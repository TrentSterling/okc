#!/usr/bin/env python3
"""Actual core/metro triangle ownership plus native ordinary/log/reversed depth.

Diagnostic owner colors make equal-depth draws measurable. No browser, PBR,
shadow or FPS claim; the original production compiler is the negative control.
"""
import argparse
import ctypes as C
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from gles_context import GLContext, U, P, F

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input',type=Path,default=Path('/tmp/okc-metro-surface-probe'))
parser.add_argument('--output',type=Path,default=Path('/tmp/okc-metro-surface-depth'))
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
manifest=json.loads((args.input/'manifest.json').read_text())
buffers={k:np.fromfile(args.input/v['file'],dtype=np.float32).reshape(-1,3) for k,v in manifest['variants'].items()}
cb=manifest['coreSurfaceBounds'];owner=box(cb['minX'],cb['minZ'],cb['maxX'],cb['maxZ'])
geometry={}
for variant,entry in manifest['variants'].items():
    grouped={'downtown':[],'metro':[]};intrusion=0
    for draw in entry['draws']:
        points=buffers[variant][draw['start']:draw['start']+draw['count']]
        assert np.isfinite(points).all()
        for triangle in points.reshape(-1,3,3):
            polygon=Polygon(triangle[:,[0,2]])
            if polygon.area<1e-9:continue
            if draw['owner']=='metro':intrusion+=polygon.intersection(owner).area
            if draw['kind'] in ['road','asphalt'] and np.max(abs(triangle[:,1]-.14))<1e-5:grouped[draw['owner']].append(polygon)
    original,metro=[unary_union(grouped[k]) for k in ['downtown','metro']]
    geometry[variant]={'coplanarRoadOverlapSquareMeters':original.intersection(metro).area,'metroSurfaceOwnerIntrusionSquareMeters':intrusion,
      'vertices':len(buffers[variant]),'finite':True}
assert geometry['before']['coplanarRoadOverlapSquareMeters']>20000,geometry
assert geometry['after']['coplanarRoadOverlapSquareMeters']<1e-6,geometry
assert geometry['after']['metroSurfaceOwnerIntrusionSquareMeters']<1e-6,geometry

gl=GLContext()
assert 'GL_EXT_clip_control' in gl.glGetString(0x1F03).decode(),'Native reversed-depth extension unavailable'
for name,arguments in [('glClipControlEXT',[U,U]),('glClearDepthf',[F])]:
    setattr(gl,name,C.CFUNCTYPE(None,*arguments)(gl.egl.eglGetProcAddress(name.encode())))
vertex='''#version 300 es
precision highp float;layout(location=0) in vec3 position;
uniform mat4 uMatrix;out float vDepth;
void main(){gl_Position=uMatrix*vec4(position,1.);vDepth=1.+gl_Position.w;}
'''
fragment='''#version 300 es
precision highp float;in float vDepth;uniform vec3 uColor;uniform int uLog;out vec4 color;
void main(){color=vec4(uColor,1.);gl_FragDepth=uLog==1?log2(max(1e-6,vDepth))/log2(7501.):gl_FragCoord.z;}
'''
program,compiled=gl.compile_program(vertex,fragment,'metro-surface-ownership')
assert program,compiled
width,height=960,540
vao,vbo=U(),U();gl.glGenVertexArrays(1,C.byref(vao));gl.glBindVertexArray(vao)
gl.glGenBuffers(1,C.byref(vbo));gl.glBindBuffer(0x8892,vbo)
gl.glEnableVertexAttribArray(0);gl.glVertexAttribPointer(0,3,0x1406,0,12,None)
texture,framebuffer,depth=U(),U(),U()
gl.glGenTextures(1,C.byref(texture));gl.glBindTexture(0x0DE1,texture)
gl.glTexImage2D(0x0DE1,0,0x8058,width,height,0,0x1908,0x1401,None)
gl.glTexParameteri(0x0DE1,0x2801,0x2601);gl.glTexParameteri(0x0DE1,0x2800,0x2601)
gl.glGenFramebuffers(1,C.byref(framebuffer));gl.glBindFramebuffer(0x8D40,framebuffer)
gl.glFramebufferTexture2D(0x8D40,0x8CE0,0x0DE1,texture,0)
gl.glGenRenderbuffers(1,C.byref(depth));gl.glBindRenderbuffer(0x8D41,depth)
gl.glFramebufferRenderbuffer(0x8D40,0x8D00,0x8D41,depth)
gl.glViewport(0,0,width,height);gl.glUseProgram(program)
gl.glDisable(0x0B44);gl.glDisable(0x0BE2);gl.glEnable(0x0B71);gl.glDepthMask(1)

def matrix_for(view,reversed_depth):
    eye=np.asarray(view['eye'],dtype=np.float64);forward=np.asarray(view['target'])-eye;forward/=np.linalg.norm(forward)
    right=np.cross(forward,[0,1,0]);right/=np.linalg.norm(right);up=np.cross(right,forward)
    v=np.eye(4);v[0,:3],v[1,:3],v[2,:3]=right,up,-forward;v[:3,3]=-v[:3,:3]@eye
    near,far=.5,7500;focal=1/math.tan(math.radians(view['fov'])/2)
    p=np.zeros((4,4));p[0,0],p[1,1],p[3,2]=focal/(width/height),focal,-1
    if reversed_depth:p[2,2],p[2,3]=near/(far-near),near*far/(far-near)
    else:p[2,2],p[2,3]=-(far+near)/(far-near),-2*far*near/(far-near)
    return np.asarray(p@v,dtype=np.float32).T.copy()

def draw(variant,view,mode,reverse):
    is_reversed=mode.startswith('reversed');matrix=matrix_for(view,is_reversed)
    gl.glUniformMatrix4fv(gl.glGetUniformLocation(program,b'uMatrix'),1,0,matrix.ctypes.data_as(P))
    gl.glUniform1i(gl.glGetUniformLocation(program,b'uLog'),int(mode=='log24'))
    gl.glClipControlEXT(0x8CA1,0x935F if is_reversed else 0x935E)
    gl.glDepthFunc(0x0206 if is_reversed else 0x0203);gl.glClearDepthf(0 if is_reversed else 1)
    gl.glClearColor(.055,.07,.085,1);gl.glClear(0x4000|0x0100)
    draws=manifest['variants'][variant]['draws']
    for item in draws[::-1] if reverse else draws:
        kind=item['kind'];color=(.90,.39,.16) if item['owner']=='downtown' else (.13,.64,.88)
        if kind not in ['road','asphalt']:color=tuple(c*.44 for c in color)
        if kind in ['yellow','paint']:color=(.95,.88,.28)
        gl.glUniform3f(gl.glGetUniformLocation(program,b'uColor'),*color)
        gl.glDrawArrays(0x0004,item['start'],item['count'])
    gl.glFinish();pixels=np.empty((height,width,4),dtype=np.uint8)
    gl.glReadPixels(0,0,width,height,0x1908,0x1401,pixels.ctypes.data_as(P));assert gl.glGetError()==0
    return pixels[::-1,:,:3].copy()

results=[];images={}
for mode,format in [('ordinary24',0x81A6),('log24',0x81A6),('reversed24',0x81A6),('reversed32f',0x8CAC)]:
    gl.glRenderbufferStorage(0x8D41,format,width,height);assert gl.glCheckFramebufferStatus(0x8D40)==0x8CD5
    for variant in ['before','after']:
        vertices=buffers[variant];gl.glBufferData(0x8892,vertices.nbytes,vertices.ctypes.data_as(P),0x88E4)
        for view in manifest['views']:
            a=draw(variant,view,mode,False);b=draw(variant,view,mode,True)
            delta=np.max(abs(a.astype(np.int16)-b.astype(np.int16)),axis=2);count=int((delta>2).sum())
            results.append({'variant':variant,'mode':mode,'view':view['id'],'changedPixels':count})
            if mode=='log24' and view['id']=='west-reno-overhead':
                marked=a.copy();marked[delta>2]=[255,20,120];images[variant]=marked
assert all(r['changedPixels']==0 for r in results if r['variant']=='after'),results
assert all(any(r['changedPixels']>100 for r in results if r['variant']=='before' and r['mode']==mode) for mode in ['ordinary24','log24','reversed24','reversed32f']),results
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
sheet=Image.new('RGB',(width*2,height+80),'#111b23');paint=ImageDraw.Draw(sheet)
for i,variant in enumerate(['before','after']):
    sheet.paste(Image.fromarray(images[variant]),(i*width,80));paint.text((i*width+15,14),variant.upper()+' / actual downtown + metro road triangles',font=font,fill='#e5ece7')
    paint.text((i*width+15,43),'Orange = downtown; blue = metro; pink = draw-order conflict. Native diagnostic.',font=font,fill='#9fb5b8')
sheet.save(args.output/'metro-surface-ownership.webp',quality=92)
report={'passed':True,'scope':__doc__,'renderer':gl.description(),'geometry':geometry,'results':results,
        'source':{k:manifest[k] for k in ['baselineRevision','sourceHashes','tiles','core','coreSurfaceBounds','views']}}
(args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':True,'geometry':geometry,'results':results,'output':str(args.output)},indent=2))
