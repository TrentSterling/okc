#!/usr/bin/env python3
"""Render actual city geometry/maps with fixed, deliberately simple shading.

This native EGL inspection is not the Three.js app renderer or a browser test.
It makes street geometry, facade openings, and depth-order conflicts reviewable.
Requires numpy, Pillow, and system EGL/GLES. Input is prepared by the companion
prepare-city-diagnostics.mjs script. Generated vertex payloads stay in /tmp.
"""
import argparse
import ctypes as C
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from gles_context import GLContext, U, P

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--width', type=int, default=1280)
parser.add_argument('--views', default='', help='Comma-separated view ids; all by default.')
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
manifest = json.loads((args.input / 'manifest.json').read_text())
gl = GLContext()
for name, result, arguments in [('glCullFace', None, [U]), ('glGenerateMipmap', None, [U])]:
    setattr(gl, name, C.CFUNCTYPE(result, *arguments)(gl.egl.eglGetProcAddress(name.encode())))

vertex = '''#version 300 es
precision highp float;
layout(location=0) in vec3 position;layout(location=1) in vec3 normal;
layout(location=2) in vec2 uv;layout(location=3) in vec3 vertexColor;
uniform mat4 uViewProjection;out vec3 vNormal;out vec2 vUv;
out vec3 vColor;out float vFragDepth;
void main(){vNormal=normal;vUv=uv;vColor=vertexColor;
 gl_Position=uViewProjection*vec4(position,1.);vFragDepth=1.+gl_Position.w;}
'''
fragment = '''#version 300 es
precision highp float;
in vec3 vNormal;in vec2 vUv;in vec3 vColor;in float vFragDepth;
uniform sampler2D uMap;uniform int uHasMap;
uniform vec3 uColor;uniform vec2 uRepeat;uniform vec2 uOffset;
out vec4 color;
vec3 encodeSRGB(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void main(){
 vec3 base=uColor*vColor;
 if(uHasMap==1)base*=texture(uMap,vUv*uRepeat+uOffset).rgb;
 vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
 float shade=.46+.72*max(0.,dot(n,normalize(vec3(-.55,.70,.45))));
 color=vec4(encodeSRGB(clamp(base*shade,0.,1.)),1.);
 gl_FragDepth=log2(max(1e-6,vFragDepth))/log2(6501.);
}
'''
program, compile_report = gl.compile_program(vertex, fragment, 'actual-city-geometry-inspection')
if not program:
    raise RuntimeError(json.dumps(compile_report))
vertices = np.fromfile(args.input / 'city.f32', dtype=np.float32)
vao, buffer = U(), U()
gl.glGenVertexArrays(1, C.byref(vao)); gl.glBindVertexArray(vao)
gl.glGenBuffers(1, C.byref(buffer)); gl.glBindBuffer(0x8892, buffer)
gl.glBufferData(0x8892, vertices.nbytes, vertices.ctypes.data_as(P), 0x88E4)
offset = 0
for index, count in enumerate([3, 3, 2, 3]):
    gl.glEnableVertexAttribArray(index)
    gl.glVertexAttribPointer(index, count, 0x1406, 0, 44, P(offset))
    offset += 4 * count

textures = {}
for material in manifest['materials']:
    item = material['map']
    if not item or item['file'] in textures:
        continue
    pixels = np.asarray(Image.open(args.input / item['file']).convert('RGBA'))
    if item['flipY']:
        pixels = pixels[::-1].copy()
    handle = U(); gl.glGenTextures(1, C.byref(handle)); gl.glBindTexture(0x0DE1, handle)
    for axis, value in [(0x2802, item['wrapS']), (0x2803, item['wrapT'])]:
        gl.glTexParameteri(0x0DE1, axis, {1000: 0x2901, 1001: 0x812F, 1002: 0x8370}[value])
    gl.glTexParameteri(0x0DE1, 0x2801, 0x2703)
    gl.glTexParameteri(0x0DE1, 0x2800, 0x2601)
    internal = 0x8C43 if item['colorSpace'] == 'srgb' else 0x8058
    gl.glTexImage2D(0x0DE1, 0, internal, item['width'], item['height'], 0, 0x1908, 0x1401, pixels.ctypes.data_as(P))
    gl.glGenerateMipmap(0x0DE1)
    textures[item['file']] = handle

framebuffer, color_texture, depth = U(), U(), U()
width, height = args.width, round(args.width * 9 / 16)
gl.glGenTextures(1, C.byref(color_texture)); gl.glBindTexture(0x0DE1, color_texture)
gl.glTexImage2D(0x0DE1, 0, 0x8058, width, height, 0, 0x1908, 0x1401, None)
gl.glTexParameteri(0x0DE1, 0x2801, 0x2601); gl.glTexParameteri(0x0DE1, 0x2800, 0x2601)
gl.glGenFramebuffers(1, C.byref(framebuffer)); gl.glBindFramebuffer(0x8D40, framebuffer)
gl.glFramebufferTexture2D(0x8D40, 0x8CE0, 0x0DE1, color_texture, 0)
gl.glGenRenderbuffers(1, C.byref(depth)); gl.glBindRenderbuffer(0x8D41, depth)
gl.glRenderbufferStorage(0x8D41, 0x81A6, width, height)
gl.glFramebufferRenderbuffer(0x8D40, 0x8D00, 0x8D41, depth)
if gl.glCheckFramebufferStatus(0x8D40) != 0x8CD5:
    raise RuntimeError('Native diagnostic framebuffer incomplete')


def uniform(name, value):
    location = gl.glGetUniformLocation(program, name.encode())
    if location < 0:
        return
    if np.isscalar(value):
        gl.glUniform1i(location, int(value))
    elif len(value) == 2:
        gl.glUniform2f(location, *map(float, value))
    elif len(value) == 3:
        gl.glUniform3f(location, *map(float, value))
    else:
        value = np.asarray(value, dtype=np.float32).T.copy()
        gl.glUniformMatrix4fv(location, 1, 0, value.ctypes.data_as(P))


def matrix_for(view):
    eye = np.asarray(view['eye'], dtype=np.float64)
    forward = np.asarray(view['target']) - eye; forward /= np.linalg.norm(forward)
    right = np.cross(forward, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    matrix = np.eye(4)
    matrix[0, :3], matrix[1, :3], matrix[2, :3] = right, up, -forward
    matrix[:3, 3] = -matrix[:3, :3] @ eye
    tangent = math.tan(math.radians(view['fov']) / 2)
    near, far = .1, 6500
    projection = np.zeros((4, 4))
    projection[0, 0], projection[1, 1] = 1 / tangent / (width / height), 1 / tangent
    projection[2, 2], projection[2, 3] = -(far + near) / (far - near), -2 * far * near / (far - near)
    projection[3, 2] = -1
    return projection @ matrix


def render(view, reverse=False):
    gl.glViewport(0, 0, width, height)
    gl.glClearColor(.32, .41, .49, 1)
    gl.glDepthMask(1); gl.glClear(0x4000 | 0x0100)
    gl.glEnable(0x0B71); gl.glDepthFunc(0x0203); gl.glDisable(0x0BE2)
    gl.glUseProgram(program); gl.glBindVertexArray(vao)
    uniform('uViewProjection', matrix_for(view))
    uniform('uMap', 0)
    opaque = [item for item in manifest['draws'] if manifest['materials'][item['material']]['depthWrite']]
    overlays = [item for item in manifest['draws'] if not manifest['materials'][item['material']]['depthWrite']]
    for draw in (opaque[::-1] if reverse else opaque) + overlays:
        material = manifest['materials'][draw['material']]
        gl.glDepthMask(int(material['depthWrite']))
        if material['side'] == 2:
            gl.glDisable(0x0B44)
        else:
            gl.glEnable(0x0B44); gl.glCullFace(0x0404 if material['side'] == 1 else 0x0405)
        uniform('uColor', material['color'])
        uniform('uHasMap', bool(material['map']))
        if material['map']:
            item = material['map']; gl.glBindTexture(0x0DE1, textures[item['file']])
            uniform('uRepeat', item['repeat']); uniform('uOffset', item['offset'])
        gl.glDrawArrays(0x0004, draw['start'], draw['count'])
    gl.glFinish()
    pixels = np.empty((height, width, 4), dtype=np.uint8)
    gl.glReadPixels(0, 0, width, height, 0x1908, 0x1401, pixels.ctypes.data_as(P))
    error = gl.glGetError()
    if error:
        raise RuntimeError(f'Native GL error {error:#x}')
    return pixels[::-1, :, :3].copy()


font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font = ImageFont.truetype(font_path, 18); small = ImageFont.truetype(font_path, 13)
report = {'method': manifest['scope'], 'label': manifest['label'], 'renderer': gl.description(),
          'geometry': manifest['geometry'], 'sourceHashes': manifest['sourceHashes'], 'views': [],
          'depthOrderAudit': 'Opaque production geometry drawn in original and reversed object order with 24-bit logarithmic depth. Pixel differences above 2/255 identify potential ties. This is a native diagnostic, not proof of behavior on every WebGL driver.'}
for view in manifest['views']:
    if args.views and view['id'] not in args.views.split(','):
        continue
    pixels = render(view)
    reversed_pixels = render(view, reverse=True)
    delta = np.max(abs(pixels.astype(np.int16) - reversed_pixels.astype(np.int16)), axis=2)
    count = int((delta > 2).sum())
    image = Image.fromarray(pixels)
    sheet = Image.new('RGB', (width, height + 88), '#111b23'); sheet.paste(image, (0, 88))
    draw = ImageDraw.Draw(sheet)
    draw.text((14, 10), f"{manifest['label']} | {view['name']}", font=font, fill='#f2efe7')
    draw.text((14, 36), 'ACTUAL GEOMETRY + COLOR MAPS / Native diagnostic. Fixed Lambert lighting. No PBR, sky or shadows.', font=small, fill='#bdcbd4')
    draw.text((14, 58), f"Opaque draw-order differences: {count:,} pixels above 2/255. Not a browser screenshot.", font=small, fill='#91adbd')
    file = view['id'] + '.webp'; sheet.save(args.output / file, quality=91)
    if count:
        marked = pixels.copy(); marked[delta > 2] = [255, 30, 110]
        Image.fromarray(marked).save(args.output / (view['id'] + '-depth-order.webp'), quality=92)
    report['views'].append({**view, 'image': file, 'width': width, 'height': height,
                            'depthOrderChangedPixels': count, 'depthOrderMaxChannelDelta': int(delta.max())})
(args.output / 'city-geometry-report.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'label': report['label'], 'views': [{'id': v['id'], 'depthOrderChangedPixels': v['depthOrderChangedPixels']} for v in report['views']], 'output': str(args.output)}, indent=2))
