#!/usr/bin/env python3
"""Compile actual Three shaders and render bounded native optical diagnostics.

Run prepare-sunset-diagnostics.mjs first. Compilation uses Python stdlib and
Mesa GLES only; optional image rendering also needs numpy and Pillow.
The images show the exact shared radiance GLSL with ideal reflection rays on
actual Devon glass triangles. They are NOT full PBR or browser scene renders.
"""
import argparse
import ctypes as C
import json
import math
from pathlib import Path

from gles_context import GLContext, U, P

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, default=Path('/tmp/okc-sunset-diagnostics'))
parser.add_argument('--output', type=Path, default=Path('docs/validation'))
parser.add_argument('--compile-only', action='store_true', help='Only ctypes/EGL compile and link; no numpy or Pillow needed.')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
manifest = json.loads((args.input / 'manifest.json').read_text())
try:
    gl = GLContext()
except (OSError, RuntimeError, AttributeError) as error:
    raise SystemExit('Native GLES unavailable. Install libegl1, libgles2, libegl-mesa0 and libgl1-mesa-dri on Ubuntu; '
                     'this diagnostic does not use a browser. Detail: ' + str(error)) from error
report = {'method': manifest['scope'], 'renderer': gl.description(),
          'threeVersion': manifest['threeVersion'], 'sourceHashes': manifest['sourceHashes'],
          'geometry': manifest['geometry'],
          'programs': [], 'horizon': manifest['horizon'], 'horizonDipDegrees': manifest['horizonDipDegrees']}
for item in manifest['programs']:
    program, result = gl.compile_program((args.input / item['vertex']).read_text(),
                                         (args.input / item['fragment']).read_text(), item['name'])
    result['sha256'] = item['sha256']
    result['features'] = item['features']
    result['hooks'] = item['hooks']
    result['materialType'] = item['materialType']
    result['hookUniforms'] = item['hookUniforms']
    report['programs'].append(result)
    if program:
        gl.glDeleteProgram(program)
report['passed'] = all(item['linked'] for item in report['programs'])
if not report['passed']:
    (args.output / 'sunset-shader-report-v05.json').write_text(json.dumps(report, indent=2) + '\n')
    for item in report['programs']:
        if not item['linked']:
            print(json.dumps(item))
    raise SystemExit('Native shader compilation failed; see report.')
if args.compile_only:
    report['method'] = 'Actual Three r180 WebGLProgram preparation and native EGL/GLES compile/link. No rasterization or browser claim.'
    (args.output / 'sunset-shader-report-v05.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'passed': True, 'actualPrograms': len(report['programs']), 'renderer': report['renderer']}, indent=2))
    raise SystemExit(0)

import numpy as np
from PIL import Image, ImageDraw, ImageFont

shared = (args.input / 'radiance.glsl').read_text()
display = ('#define saturate(a) clamp(a, 0.0, 1.0)\n' +
           (args.input / 'tonemapping.glsl').read_text() + '\n' +
           (args.input / 'colorspace.glsl').read_text() + '\n' +
           'vec3 displayColor(vec3 c){return sRGBTransferOETF(vec4(ACESFilmicToneMapping(c),1.)).rgb;}\n')
header = '#version 300 es\nprecision highp float;\n'
quad_vertex = header + '''
layout(location=0) in vec2 position;out vec2 vScreen;
void main(){vScreen=position;gl_Position=vec4(position,0.,1.);}
'''
sky_fragment = header + '''
in vec2 vScreen;out vec4 color;uniform vec3 uForward;uniform vec3 uRight;uniform vec3 uUp;
uniform float uTanHalfFov;uniform float uAspect;
''' + shared + display + '''
void main(){vec3 ray=normalize(uForward+vScreen.x*uRight*uTanHalfFov*uAspect+vScreen.y*uUp*uTanHalfFov);
 color=vec4(displayColor(skyRadiance(ray,uObserverHeight)),0.);}
'''
tower_vertex = header + '''
layout(location=0) in vec3 position;layout(location=1) in vec3 normal;
uniform mat4 uViewProjection;out vec3 vPoint;out vec3 vNormal;
void main(){vPoint=position;vNormal=normal;gl_Position=uViewProjection*vec4(position,1.);}
'''
tower_fragment = header + '''
in vec3 vPoint;in vec3 vNormal;out vec4 color;uniform vec3 uEye;
''' + shared + display + '''
void main(){vec3 incident=normalize(vPoint-uEye),n=normalize(vNormal);
 vec3 ray=reflect(incident,n);
 // Ideal unfiltered reflection isolates the sky directions the geometry sees.
 // No emissive term, material tint, PBR multiplier, local probe or fog is added.
 color=vec4(displayColor(skyRadiance(ray,max(vPoint.y,0.))),1.);}
'''
sky_program, sky_record = gl.compile_program(quad_vertex, sky_fragment, 'shared-sky-diagnostic')
tower_program, tower_record = gl.compile_program(tower_vertex, tower_fragment, 'ideal-devon-reflection-diagnostic')
report['diagnosticPrograms'] = [sky_record, tower_record]
if not sky_program or not tower_program:
    raise RuntimeError('Diagnostic shader compilation failed: ' + json.dumps(report['diagnosticPrograms']))


def make_buffer(data, attributes):
    data = np.asarray(data, dtype=np.float32)
    vao, buffer = U(), U()
    gl.glGenVertexArrays(1, C.byref(vao))
    gl.glGenBuffers(1, C.byref(buffer))
    gl.glBindVertexArray(vao)
    gl.glBindBuffer(0x8892, buffer)
    gl.glBufferData(0x8892, data.nbytes, data.ctypes.data_as(P), 0x88E4)
    stride, offset = sum(attributes) * 4, 0
    for index, size in enumerate(attributes):
        gl.glEnableVertexAttribArray(index)
        gl.glVertexAttribPointer(index, size, 0x1406, 0, stride, P(offset))
        offset += size * 4
    return vao, buffer


quad, quad_buffer = make_buffer([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1], [2])
vertices = np.fromfile(args.input / 'devon-glass.f32', dtype=np.float32)
tower, tower_buffer = make_buffer(vertices, [3, 3])
texture, framebuffer, depth = U(), U(), U()
gl.glGenTextures(1, C.byref(texture))
gl.glBindTexture(0x0DE1, texture)
gl.glTexParameteri(0x0DE1, 0x2801, 0x2601)
gl.glTexParameteri(0x0DE1, 0x2800, 0x2601)
gl.glGenFramebuffers(1, C.byref(framebuffer))
gl.glGenRenderbuffers(1, C.byref(depth))
gl.glBindFramebuffer(0x8D40, framebuffer)
gl.glFramebufferTexture2D(0x8D40, 0x8CE0, 0x0DE1, texture, 0)
gl.glBindRenderbuffer(0x8D41, depth)
gl.glFramebufferRenderbuffer(0x8D40, 0x8D00, 0x8D41, depth)


def uniform(program, name, value):
    location = gl.glGetUniformLocation(program, name.encode())
    if location < 0:
        return
    if np.isscalar(value):
        gl.glUniform1f(location, float(value))
    elif len(value) == 3:
        gl.glUniform3f(location, *map(float, value))
    else:
        value = np.asarray(value, dtype=np.float32).T.copy()
        gl.glUniformMatrix4fv(location, 1, 0, value.ctypes.data_as(P))


def atmosphere(program, stage, height, disk):
    gl.glUseProgram(program)
    uniform(program, 'uProgress', stage['progress'])
    uniform(program, 'uSunDisk', disk)
    uniform(program, 'uStyle', 0)
    uniform(program, 'uNeutral', 0)
    uniform(program, 'uObserverHeight', height)
    uniform(program, 'uSolarCenterAltitude', stage['altitude'])
    horizontal = math.hypot(.94, .34)
    sun = [-.94 / horizontal * math.cos(stage['altitude']), math.sin(stage['altitude']),
           .34 / horizontal * math.cos(stage['altitude'])]
    uniform(program, 'uSunDirection', sun)
    uniform(program, 'toneMappingExposure', 1.08)


def normalize(vector):
    vector = np.asarray(vector, dtype=np.float64)
    return vector / np.linalg.norm(vector)


def camera(eye, target, fov, aspect):
    eye = np.asarray(eye, dtype=np.float64)
    forward = normalize(np.asarray(target) - eye)
    right = normalize(np.cross(forward, [0, 1, 0]))
    up = np.cross(right, forward)
    view = np.eye(4)
    view[0, :3], view[1, :3], view[2, :3] = right, up, -forward
    view[:3, 3] = -view[:3, :3] @ eye
    tangent = math.tan(math.radians(fov) / 2)
    near, far = .1, 20000
    projection = np.zeros((4, 4))
    projection[0, 0], projection[1, 1] = 1 / tangent / aspect, 1 / tangent
    projection[2, 2] = -(far + near) / (far - near)
    projection[2, 3] = -2 * far * near / (far - near)
    projection[3, 2] = -1
    return forward, right, up, tangent, projection @ view


def render(stage, eye, target, fov, width, height, geometry=True, disk=0):
    gl.glBindTexture(0x0DE1, texture)
    gl.glTexImage2D(0x0DE1, 0, 0x8058, width, height, 0, 0x1908, 0x1401, None)
    gl.glRenderbufferStorage(0x8D41, 0x81A6, width, height)
    if gl.glCheckFramebufferStatus(0x8D40) != 0x8CD5:
        raise RuntimeError('Diagnostic framebuffer incomplete')
    gl.glViewport(0, 0, width, height)
    gl.glClearColor(0, 0, 0, 0)
    gl.glDepthMask(1)
    gl.glClear(0x4000 | 0x0100)
    gl.glDisable(0x0B71)
    gl.glDisable(0x0BE2)
    forward, right, up, tangent, vp = camera(eye, target, fov, width / height)
    atmosphere(sky_program, stage, eye[1], disk)
    for name, value in [('uForward', forward), ('uRight', right), ('uUp', up),
                        ('uTanHalfFov', tangent), ('uAspect', width / height)]:
        uniform(sky_program, name, value)
    gl.glBindVertexArray(quad)
    gl.glDrawArrays(0x0004, 0, 6)
    background = np.empty((height, width, 4), dtype=np.uint8)
    gl.glReadPixels(0, 0, width, height, 0x1908, 0x1401, background.ctypes.data_as(P))
    if geometry:
        gl.glEnable(0x0B71)
        gl.glDepthFunc(0x0201)
        atmosphere(tower_program, stage, eye[1], 0)
        uniform(tower_program, 'uEye', eye)
        uniform(tower_program, 'uViewProjection', vp)
        gl.glBindVertexArray(tower)
        gl.glDrawArrays(0x0004, 0, len(vertices) // 6)
    gl.glFinish()
    pixels = np.empty_like(background)
    gl.glReadPixels(0, 0, width, height, 0x1908, 0x1401, pixels.ctypes.data_as(P))
    error = gl.glGetError()
    if error:
        raise RuntimeError(f'Native GL render/readback error {error:#x}')
    mask = pixels[:, :, 3] > 127
    stats = {'surfacePixels': int(mask.sum())}
    if mask.any():
        stats['meanReflectedRGB8'] = pixels[mask, :3].mean(axis=0).round(2).tolist()
        stats['meanBackgroundRGB8'] = background[mask, :3].mean(axis=0).round(2).tolist()
    return Image.fromarray(pixels[::-1, :, :3].copy()), stats


font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(font_path, 17)
small = ImageFont.truetype(font_path, 13)
title = ImageFont.truetype(font_path, 22)
panel_w, panel_h = 420, 460
sheet = Image.new('RGB', (4 * panel_w, 2 * (panel_h + 52) + 104), '#101923')
draw = ImageDraw.Draw(sheet)
draw.text((18, 12), 'DEVON / SHARED-SKY REFLECTION DIAGNOSTIC', font=title, fill='#f1eee4')
draw.text((18, 43), 'Native GLES. Actual glass geometry + ideal reflected rays. Fixed exposure 1.08. No facade emission.', font=font, fill='#c5ced6')
draw.text((18, 70), 'Isolates sky and geometry. No PBR filtering, local city reflections, frames, fog or complete scene. Not a browser capture.', font=small, fill='#92a4b8')
views = manifest['views']
report['reflectionPanels'] = []
for row, view in enumerate(views):
    name, eye, target, fov = (view[key] for key in ['name', 'eye', 'target', 'fov'])
    if abs(view['exposure'] - 1.08) > 1e-8:
        raise ValueError('The fixed-view exposure changed; update the documented diagnostic exposure explicitly.')
    for column, stage in enumerate(manifest['stages']):
        picture, stats = render(stage, eye, target, fov, panel_w, panel_h)
        x, y = column * panel_w, 104 + row * (panel_h + 52)
        sheet.paste(picture, (x, y))
        draw.text((x + 12, y + panel_h + 7), f'{name} / sky {stage["progress"]:.2f}', font=small, fill='#e2e6e9')
        draw.text((x + 12, y + panel_h + 27), f'Solar center: {math.degrees(stage["altitude"]):+.2f} degrees', font=small, fill='#95a9be')
        report['reflectionPanels'].append({'presetId': view['id'], 'view': name, 'camera': eye,
            'target': target, 'verticalFov': fov, 'exposure': view['exposure'], 'progress': stage['progress'], **stats})
sheet.save(args.output / 'sunset-shader-reflections-v05.webp', quality=88)

panel_w, panel_h = 420, 200
horizon_sheet = Image.new('RGB', (4 * panel_w, 2 * (panel_h + 51) + 102), '#101923')
draw = ImageDraw.Draw(horizon_sheet)
draw.text((18, 12), 'HEIGHT-DEPENDENT SUNSET / SAME INSTANT, DIFFERENT HORIZON', font=title, fill='#f1eee4')
draw.text((18, 44), 'Exact shared sky GLSL, native GLES. Level spherical horizon, explicit refraction approximation. Fixed exposure.', font=font, fill='#c5ced6')
draw.text((18, 71), 'The time slider is an authored altitude sequence, not a clock or weather forecast. Sun shown at its modeled angular size.', font=small, fill='#92a4b8')
horizontal = math.hypot(.94, .34)
for row, h in enumerate([2, 257.2]):
    for column, stage in enumerate(manifest['horizon']):
        eye = [0, h, 0]
        target = [-.94 / horizontal * 1000, h - 4.36, .34 / horizontal * 1000]
        picture, _ = render(stage, eye, target, 1.8, panel_w, panel_h, False, 1)
        x, y = column * panel_w, 102 + row * (panel_h + 51)
        horizon_sheet.paste(picture, (x, y))
        visibility = stage['streetVisibility' if row == 0 else 'crownVisibility']
        draw.text((x + 12, y + panel_h + 5), f'{h:g} m above ground / sky {stage["progress"]:.2f}', font=small, fill='#e2e6e9')
        draw.text((x + 12, y + panel_h + 25), f'Geometric visible disc fraction: {visibility:.1%}', font=small, fill='#95a9be')
horizon_sheet.save(args.output / 'sunset-shader-height-v05.webp', quality=88)
report['images'] = ['sunset-shader-reflections-v05.webp', 'sunset-shader-height-v05.webp']
report['diagnosticLimitations'] = [
    'Actual Three physical programs compiled and linked but were not rasterized as a complete scene.',
    'The reflection image directly samples shared sky radiance using actual Devon glass triangles; no PBR, PMREM, local city, frames, or fog.',
    'Native Mesa diagnostics do not establish browser execution, final visual quality, device compatibility, or FPS.',
    'Canvas texture painting was mocked during shader feature preparation; it is not part of this image validation.',
]
(args.output / 'sunset-shader-report-v05.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'passed': report['passed'], 'actualPrograms': len(report['programs']),
                  'images': report['images'], 'renderer': report['renderer']}, indent=2))
