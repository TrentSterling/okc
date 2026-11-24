#!/usr/bin/env python3
"""Native regression for the renderer's ordinary/reversed polygon-offset sign.

Uses EXT_clip_control, actual depth comparison and a road/paint gap of .012 m.
The deliberately wrong sign is a negative control, not a claimed v0.5 defect:
v0.5 already reversed its polygon offsets at scene startup.
"""
import argparse
import ctypes as C
import json
import math
from pathlib import Path

import numpy as np

from gles_context import GLContext, U, I, P, F

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--state', type=Path, default=Path('/tmp/okc-depth-offsets.json'))
parser.add_argument('--output', type=Path, default=Path('/tmp/okc-native-depth-offsets.json'))
args = parser.parse_args()
state = json.loads(args.state.read_text())
gl = GLContext()
if 'GL_EXT_clip_control' not in gl.glGetString(0x1F03).decode():
    raise SystemExit('Native EXT_clip_control unavailable; reversed-depth test cannot run.')
for name, arguments in [('glClipControlEXT', [U, U]), ('glClearDepthf', [F]), ('glPolygonOffset', [F, F])]:
    setattr(gl, name, C.CFUNCTYPE(None, *arguments)(gl.egl.eglGetProcAddress(name.encode())))
vertex = '''#version 300 es
precision highp float;layout(location=0) in vec3 position;
uniform mat4 uMatrix;void main(){gl_Position=uMatrix*vec4(position,1.);}
'''
fragment = '''#version 300 es
precision highp float;uniform vec3 uColor;out vec4 color;
void main(){color=vec4(uColor,1.);}
'''
program, compiled = gl.compile_program(vertex, fragment, 'native-depth-offset-regression')
if not program:
    raise RuntimeError(json.dumps(compiled))
vertices = []


def quad(x0, x1, y, z0, z1):
    vertices.extend([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z0], [x1, y, z1], [x0, y, z1]])


quad(-10, 10, .14, 15, -2000)
for x in [-5.25, 0, 5.25]:
    for z in range(10, -1800, -10):
        quad(x - .065, x + .065, .152, z, z - 3.2)
vertices = np.asarray(vertices, dtype=np.float32)
vao, buffer = U(), U()
gl.glGenVertexArrays(1, C.byref(vao)); gl.glBindVertexArray(vao)
gl.glGenBuffers(1, C.byref(buffer)); gl.glBindBuffer(0x8892, buffer)
gl.glBufferData(0x8892, vertices.nbytes, vertices.ctypes.data_as(P), 0x88E4)
gl.glEnableVertexAttribArray(0); gl.glVertexAttribPointer(0, 3, 0x1406, 0, 12, None)
color_texture, framebuffer, depth = U(), U(), U(); width, height = 960, 540
gl.glGenTextures(1, C.byref(color_texture)); gl.glBindTexture(0x0DE1, color_texture)
gl.glTexImage2D(0x0DE1, 0, 0x8058, width, height, 0, 0x1908, 0x1401, None)
gl.glTexParameteri(0x0DE1, 0x2801, 0x2601); gl.glTexParameteri(0x0DE1, 0x2800, 0x2601)
gl.glGenFramebuffers(1, C.byref(framebuffer)); gl.glBindFramebuffer(0x8D40, framebuffer)
gl.glFramebufferTexture2D(0x8D40, 0x8CE0, 0x0DE1, color_texture, 0)
gl.glGenRenderbuffers(1, C.byref(depth)); gl.glBindRenderbuffer(0x8D41, depth)
gl.glRenderbufferStorage(0x8D41, 0x8CAC, width, height)
gl.glFramebufferRenderbuffer(0x8D40, 0x8D00, 0x8D41, depth)
assert gl.glCheckFramebufferStatus(0x8D40) == 0x8CD5
eye = np.array([0, 2.1, 12.]); forward = np.array([0, .14, -120.]) - eye
forward /= np.linalg.norm(forward); right = np.cross(forward, [0, 1, 0]); right /= np.linalg.norm(right)
up = np.cross(right, forward); view = np.eye(4)
view[0, :3], view[1, :3], view[2, :3] = right, up, -forward
view[:3, 3] = -view[:3, :3] @ eye
gl.glViewport(0, 0, width, height); gl.glUseProgram(program)
gl.glDisable(0x0B44); gl.glDisable(0x0BE2); gl.glEnable(0x0B71)
results = []
for reversed_depth in [False, True]:
    near, far = .5, 7500
    projection = np.zeros((4, 4)); focal = 1 / math.tan(math.radians(48) / 2)
    projection[0, 0], projection[1, 1], projection[3, 2] = focal / (width / height), focal, -1
    if reversed_depth:
        projection[2, 2], projection[2, 3] = near / (far - near), near * far / (far - near)
    else:
        projection[2, 2], projection[2, 3] = -(far + near) / (far - near), -2 * far * near / (far - near)
    matrix = np.asarray(projection @ view, dtype=np.float32).T.copy()
    gl.glUniformMatrix4fv(gl.glGetUniformLocation(program, b'uMatrix'), 1, 0, matrix.ctypes.data_as(P))
    gl.glClipControlEXT(0x8CA1, 0x935F if reversed_depth else 0x935E)
    gl.glDepthFunc(0x0206 if reversed_depth else 0x0203)
    gl.glClearDepthf(0 if reversed_depth else 1)
    configured = state['roadPaint']['reversed' if reversed_depth else 'ordinary']
    for label, factor, units in [('configured', *configured), ('wrong-sign-control', *[-x for x in configured])]:
        gl.glDepthMask(1); gl.glClearColor(.05, .06, .07, 1); gl.glClear(0x4000 | 0x0100)
        gl.glDisable(0x8037); gl.glUniform3f(gl.glGetUniformLocation(program, b'uColor'), .24, .26, .28)
        gl.glDrawArrays(0x0004, 0, 6)
        gl.glDepthMask(0); gl.glEnable(0x8037); gl.glPolygonOffset(factor, units)
        gl.glUniform3f(gl.glGetUniformLocation(program, b'uColor'), 1, .8, .1)
        gl.glDrawArrays(0x0004, 6, len(vertices) - 6); gl.glFinish()
        pixels = np.empty((height, width, 4), dtype=np.uint8)
        gl.glReadPixels(0, 0, width, height, 0x1908, 0x1401, pixels.ctypes.data_as(P))
        count = int(((pixels[:, :, 0] > 220) & (pixels[:, :, 1] > 150)).sum())
        results.append({'mode': 'reversed' if reversed_depth else 'ordinary', 'configuration': label,
                        'factor': factor, 'units': units, 'visiblePaintPixels': count})
for mode in ['ordinary', 'reversed']:
    good, bad = [r for r in results if r['mode'] == mode]
    assert good['visiblePaintPixels'] > 0
    assert good['visiblePaintPixels'] > bad['visiblePaintPixels'], (mode, results)
assert gl.glGetError() == 0
report = {'passed': True, 'method': __doc__, 'renderer': gl.description(), 'depthFormat': 'DEPTH_COMPONENT32F',
          'roadElevation': .14, 'paintElevation': .152, 'state': state, 'results': results,
          'limits': 'A native depth-state regression with isolated planes. It is not a full app render and does not establish the source of the reported v0.5 artifacts.'}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'passed': True, 'results': results, 'output': str(args.output)}, indent=2))
