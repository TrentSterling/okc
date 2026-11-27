#!/usr/bin/env python3
"""Render exact prepared Three UI shaders and surface.snapshot attributes.

This uses native Mesa GLES, not a browser, and makes no device/FPS claim.
Run prepare-ui-diagnostics.mjs first. Requires existing numpy, Pillow, EGL/GLES.
"""
import argparse
import ctypes as C
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from gles_context import GLContext, U, I, P

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--dpr', type=float, default=1.0)
args = parser.parse_args()
if not 0.5 <= args.dpr <= 3:
    raise SystemExit('Choose DPR from 0.5 to 3 for bounded native captures.')
args.output.mkdir(parents=True, exist_ok=True)
manifest = json.loads((args.input/'manifest.json').read_text())
gl = GLContext()
for name, result, parameters in [
    ('glGetAttribLocation', I, [U, C.c_char_p]),
    ('glVertexAttribDivisor', None, [U, U]),
    ('glDrawElementsInstanced', None, [U, I, U, P, I]),
    ('glBlendFuncSeparate', None, [U, U, U, U]),
    ('glBlendEquation', None, [U]),
    ('glPixelStorei', None, [U, I]),
    ('glDeleteTextures', None, [I, C.POINTER(U)]),
    ('glDeleteBuffers', None, [I, C.POINTER(U)]),
    ('glDeleteVertexArrays', None, [I, C.POINTER(U)]),
    ('glDeleteFramebuffers', None, [I, C.POINTER(U)]),
]:
    pointer = gl.egl.eglGetProcAddress(name.encode())
    if not pointer:
        raise RuntimeError('Missing GLES entry point: '+name)
    setattr(gl, name, C.CFUNCTYPE(result, *parameters)(pointer))


def verified_bytes(file, expected):
    content = (args.input/file).read_bytes()
    if hashlib.sha256(content).hexdigest() != expected:
        raise RuntimeError('Diagnostic input hash changed: '+file)
    return content


report = {'method': manifest['method'], 'renderer': gl.description(), 'dpr': args.dpr,
          'sourceHashes': manifest['sourceHashes'], 'atlas': manifest['atlas'],
          'atlases': manifest.get('atlases', {'main': manifest['atlas']}),
          'inputSnapshots': manifest['inputSnapshots'], 'programs': [], 'views': [], 'passed': False}
programs = []
for spec in manifest['programs']:
    vertex = verified_bytes(spec['vertex'], spec['sha256']['vertex']).decode()
    fragment = verified_bytes(spec['fragment'], spec['sha256']['fragment']).decode()
    program, result = gl.compile_program(vertex, fragment, spec['name'])
    report['programs'].append({**result, 'sha256': spec['sha256'], 'toneMapping': spec['toneMapping']})
    if not program:
        (args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
        raise RuntimeError(json.dumps(result))
    programs.append((program, spec))

atlases = {}
for atlas_id, spec in report['atlases'].items():
    atlas_pixels = np.frombuffer(verified_bytes(spec['file'], spec['sha256']), dtype=np.uint8)
    if atlas_pixels.size != spec['width']*spec['height']:
        raise RuntimeError('Invalid R8 atlas size: '+atlas_id)
    atlas = U(); gl.glGenTextures(1, C.byref(atlas)); gl.glBindTexture(0x0DE1, atlas)
    gl.glPixelStorei(0x0CF5, 1)
    gl.glTexImage2D(0x0DE1, 0, 0x8229, spec['width'], spec['height'], 0, 0x1903, 0x1401, atlas_pixels.ctypes.data_as(P))
    for parameter, value in [(0x2801, 0x2601), (0x2800, 0x2601), (0x2802, 0x812F), (0x2803, 0x812F)]:
        gl.glTexParameteri(0x0DE1, parameter, value)
    atlases[atlas_id] = atlas

framebuffer, color_texture = U(), U()
gl.glGenFramebuffers(1, C.byref(framebuffer)); gl.glGenTextures(1, C.byref(color_texture))
vao, positions, indices = U(), U(), U()
gl.glGenVertexArrays(1, C.byref(vao)); gl.glBindVertexArray(vao)
gl.glGenBuffers(1, C.byref(positions)); gl.glBindBuffer(0x8892, positions)
quad = np.array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], dtype=np.float32)
gl.glBufferData(0x8892, quad.nbytes, quad.ctypes.data_as(P), 0x88E4)
gl.glEnableVertexAttribArray(0); gl.glVertexAttribPointer(0, 3, 0x1406, 0, 12, None)
gl.glGenBuffers(1, C.byref(indices)); gl.glBindBuffer(0x8893, indices)
index_data = np.array([0, 2, 1, 0, 3, 2], dtype=np.uint16)
gl.glBufferData(0x8893, index_data.nbytes, index_data.ctypes.data_as(P), 0x88E4)
attribute_buffers = {}
for attribute in manifest['attributeSizes']:
    handle = U(); gl.glGenBuffers(1, C.byref(handle)); attribute_buffers[attribute] = handle


def render(view, attributes, program, spec, omit_glyphs=False):
    width, height = round(view['width']*args.dpr), round(view['height']*args.dpr)
    gl.glBindTexture(0x0DE1, color_texture)
    gl.glTexImage2D(0x0DE1, 0, 0x8058, width, height, 0, 0x1908, 0x1401, None)
    gl.glTexParameteri(0x0DE1, 0x2801, 0x2601); gl.glTexParameteri(0x0DE1, 0x2800, 0x2601)
    gl.glBindFramebuffer(0x8D40, framebuffer)
    gl.glFramebufferTexture2D(0x8D40, 0x8CE0, 0x0DE1, color_texture, 0)
    if gl.glCheckFramebufferStatus(0x8D40) != 0x8CD5:
        raise RuntimeError('UI diagnostic framebuffer incomplete.')
    gl.glViewport(0, 0, width, height); gl.glDisable(0x0B71); gl.glDisable(0x0B44); gl.glDisable(0x0C11)
    gl.glEnable(0x0BE2); gl.glBlendEquation(0x8006); gl.glBlendFuncSeparate(0x0302, 0x0303, 1, 0x0303)
    gl.glClearColor(16/255, 28/255, 41/255, 1); gl.glClear(0x4000)
    gl.glUseProgram(program); gl.glBindVertexArray(vao)
    keep = attributes['aShape'][:, 0] != 1 if omit_glyphs else np.ones(view['count'], dtype=bool)
    for attribute, size in manifest['attributeSizes'].items():
        location = gl.glGetAttribLocation(program, attribute.encode())
        if location < 0:
            raise RuntimeError('Expected UI attribute was optimized out: '+attribute)
        data = np.ascontiguousarray(attributes[attribute][keep])
        gl.glBindBuffer(0x8892, attribute_buffers[attribute]); gl.glBufferData(0x8892, data.nbytes, data.ctypes.data_as(P), 0x88E4)
        gl.glEnableVertexAttribArray(location); gl.glVertexAttribPointer(location, size, 0x1406, 0, size*4, None)
        gl.glVertexAttribDivisor(location, 1)
    matrices = view['matrices']['reversed' if spec['reversed'] else 'logarithmic']
    for name, values in matrices.items():
        matrix = np.array(values, dtype=np.float32)
        gl.glUniformMatrix4fv(gl.glGetUniformLocation(program, name.encode()), 1, 0, matrix.ctypes.data_as(P))
    gl.glActiveTexture(0x84C0); gl.glBindTexture(0x0DE1, atlases[view.get('atlas', 'main')])
    gl.glUniform1i(gl.glGetUniformLocation(program, b'glyphs'), 0)
    gl.glDrawElementsInstanced(0x0004, 6, 0x1403, None, int(keep.sum()))
    gl.glFinish()
    pixels = np.empty((height, width, 4), dtype=np.uint8)
    gl.glReadPixels(0, 0, width, height, 0x1908, 0x1401, pixels.ctypes.data_as(P))
    error = gl.glGetError()
    if error:
        raise RuntimeError(f'Native UI GL error {error:#x}')
    return pixels[::-1, :, :3].copy()


failures = []
for view in manifest['views']:
    attributes = {name: np.frombuffer(verified_bytes(item['file'], item['sha256']), dtype=np.float32).reshape(-1, manifest['attributeSizes'][name])
                  for name, item in view['attributes'].items()}
    for name, values in attributes.items():
        if len(values) != view['count'] or not np.isfinite(values).all():
            raise RuntimeError('Invalid UI attribute data: '+name)
    normal = render(view, attributes, *programs[0])
    reversed_depth = render(view, attributes, *programs[1])
    without_glyphs = render(view, attributes, *programs[0], omit_glyphs=True)
    depth_delta = np.max(np.abs(normal.astype(np.int16)-reversed_depth.astype(np.int16)), axis=2)
    glyph_delta = np.max(np.abs(normal.astype(np.int16)-without_glyphs.astype(np.int16)), axis=2)
    glyphs = int((attributes['aShape'][:, 0] == 1).sum())
    glyph_pixels = int((glyph_delta > 2).sum())
    if int(depth_delta.max()) > 1:
        failures.append(view['name']+': depth-mode UI output differs.')
    if glyphs and glyph_pixels < 10:
        failures.append(view['name']+': glyphs contributed no useful pixels.')
    checks = []
    for check in view.get('pixelChecks', []):
        x, y = round(check['x']*args.dpr), round(check['y']*args.dpr)
        actual = normal[y, x].tolist(); delta = max(abs(a-b) for a, b in zip(actual, check['rgb']))
        passed = delta <= check.get('tolerance', 2)
        checks.append({**check, 'actual': actual, 'passed': passed})
        if not passed:
            failures.append(view['name']+': clip/background pixel check failed.')
    file = view['name']+'.png'; Image.fromarray(normal).save(args.output/file)
    report['views'].append({'name': view['name'], 'inputScope': view.get('scope'), 'atlas': view.get('atlas', 'main'), 'image': file, 'cssSize': [view['width'], view['height']],
                            'pixelSize': [normal.shape[1], normal.shape[0]], 'instances': view['count'],
                            'runtimeDrawCalls': 1 if view['count'] else 0, 'glyphInstances': glyphs,
                            'glyphContributionPixels': glyph_pixels, 'depthModeChangedPixels': int((depth_delta > 1).sum()),
                            'depthModeMaxDelta': int(depth_delta.max()), 'pixelChecks': checks,
                            'imageSha256': hashlib.sha256((args.output/file).read_bytes()).hexdigest(),
                            'targetCount': len(view.get('targets', []))})

for handle in [positions, indices, *attribute_buffers.values()]:
    gl.glDeleteBuffers(1, C.byref(handle))
gl.glDeleteVertexArrays(1, C.byref(vao)); gl.glDeleteFramebuffers(1, C.byref(framebuffer))
for handle in [*atlases.values(), color_texture]:
    gl.glDeleteTextures(1, C.byref(handle))
for program, _ in programs:
    gl.glDeleteProgram(program)
report['failures'] = failures; report['passed'] = not failures
(args.output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'output': str(args.output), 'passed': report['passed'], 'programs': len(programs),
                  'views': report['views'], 'failures': failures}, indent=2))
if failures:
    raise SystemExit(1)
