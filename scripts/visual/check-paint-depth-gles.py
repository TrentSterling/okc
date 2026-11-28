#!/usr/bin/env python3
"""Production MeshStandard road/paint depth, with native visibility controls.

Actual prepared shaders and original Float32 geometry/matrices are retained.
Emissive uniforms provide diagnostic IDs; no depth/vertex shader substitution.
This is not a browser capture, complete PBR scene or performance measurement.
"""
import argparse
import ctypes as C
import hashlib
import json
import math
from pathlib import Path
import numpy as np
from PIL import Image
from gles_context import GLContext, U, I, P, F

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--views',default='')
parser.add_argument('--samples',default='0,4',help='Requested native sample counts; 0 means single sample.')
parser.add_argument('--width',type=int,default=960)
parser.add_argument('--record-only',action='store_true',help='Record a failing baseline without a nonzero exit status.')
args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
manifest_bytes=(args.input/'manifest.json').read_bytes()
manifest=json.loads(manifest_bytes)
gl=GLContext()
if 'GL_EXT_clip_control' not in gl.glGetString(0x1F03).decode():
    raise RuntimeError('Native EXT_clip_control required for production reversed-depth coverage.')
for name,result,types in [
    ('glClipControlEXT',None,[U,U]),('glClearDepthf',None,[F]),('glPolygonOffset',None,[F,F]),
    ('glGetAttribLocation',I,[U,C.c_char_p]),('glVertexAttribDivisor',None,[U,U]),
    ('glDrawArraysInstanced',None,[U,I,I,I]),('glCullFace',None,[U]),
    ('glUniform4f',None,[I,F,F,F,F]),('glUniformMatrix3fv',None,[I,I,U,P]),
    ('glGenerateMipmap',None,[U]),('glGetIntegerv',None,[U,C.POINTER(I)]),
    ('glRenderbufferStorageMultisample',None,[U,I,U,I,I]),
    ('glBlitFramebuffer',None,[I,I,I,I,I,I,I,I,U,U]),
    ('glGetActiveUniform',None,[U,U,I,C.POINTER(I),C.POINTER(I),C.POINTER(U),P]),
    ('glGetRenderbufferParameteriv',None,[U,U,C.POINTER(I)]),
]:
    pointer=gl.egl.eglGetProcAddress(name.encode())
    if not pointer: raise RuntimeError('Missing native entry point '+name)
    setattr(gl,name,C.CFUNCTYPE(result,*types)(pointer))

def checked(file,expected):
    data=(args.input/file).read_bytes()
    if hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Changed input '+file)
    return data

report={'method':__doc__,'sourceMethod':manifest['method'],'renderer':gl.description(),
        'inputManifestSha256':hashlib.sha256(manifest_bytes).hexdigest(),
        'geometryComparison':manifest.get('geometryComparison'),
        'textureScope':manifest.get('textureScope'),'sourceHashes':manifest['sourceHashes'],'programs':[],'results':[],'failures':[],'passed':False}
programs={}
for spec in manifest['programs']:
    vertex=checked(spec['vertex'],spec['sha256']['vertex']).decode()
    fragment=checked(spec['fragment'],spec['sha256']['fragment']).decode()
    if spec['mode']=='logarithmic' and '#define USE_LOGARITHMIC_DEPTH_BUFFER' not in fragment:
        raise RuntimeError('Production logarithmic fragment-depth path is absent: '+spec['name'])
    handle,result=gl.compile_program(vertex,fragment,spec['name'])
    result.update(sha256=spec['sha256'],features=spec['features'])
    report['programs'].append(result)
    if not handle:
        (args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
        raise RuntimeError(json.dumps(result))
    count=I();gl.glGetProgramiv(handle,0x8B86,C.byref(count));uniforms={}
    for index in range(count.value):
        name=C.create_string_buffer(256);length,size,kind=I(),I(),U()
        gl.glGetActiveUniform(handle,index,256,C.byref(length),C.byref(size),C.byref(kind),name)
        text=name.value.decode();uniforms[text]=(gl.glGetUniformLocation(handle,name.value),kind.value)
    programs[spec['name']]={'handle':handle,'spec':spec,'uniforms':uniforms}

textures={}
for spec in manifest['textures']:
    content=checked(spec['file'],spec['sha256'])
    pixels=np.frombuffer(content,dtype=np.uint8).reshape(spec['height'],spec['width'],4) if spec.get('format')=='rgba8' else np.asarray(Image.open(args.input/spec['file']).convert('RGBA'))
    if spec['flipY']:pixels=pixels[::-1].copy()
    texture=U();gl.glGenTextures(1,C.byref(texture));gl.glBindTexture(0x0DE1,texture)
    for axis,key in [(0x2802,'wrapS'),(0x2803,'wrapT')]:gl.glTexParameteri(0x0DE1,axis,{1000:0x2901,1001:0x812F,1002:0x8370}[spec[key]])
    gl.glTexParameteri(0x0DE1,0x2801,0x2703);gl.glTexParameteri(0x0DE1,0x2800,0x2601)
    gl.glTexImage2D(0x0DE1,0,0x8C43 if spec['colorSpace']=='srgb' else 0x8058,spec['width'],spec['height'],0,0x1908,0x1401,pixels.ctypes.data_as(P));gl.glGenerateMipmap(0x0DE1)
    textures[spec['file']]=texture

draws=[]
for spec in manifest['draws']:
    vertices=np.frombuffer(checked(spec['file'],spec['sha256']),dtype=np.float32)
    vertex=U();gl.glGenBuffers(1,C.byref(vertex));gl.glBindBuffer(0x8892,vertex);gl.glBufferData(0x8892,vertices.nbytes,vertices.ctypes.data_as(P),0x88E4)
    instance=None
    if spec.get('instances'):
        item=spec['instances'];values=np.frombuffer(checked(item['file'],item['sha256']),dtype=np.float32)
        instance=U();gl.glGenBuffers(1,C.byref(instance));gl.glBindBuffer(0x8892,instance);gl.glBufferData(0x8892,values.nbytes,values.ctypes.data_as(P),0x88E4)
    draws.append({'spec':spec,'vertex':vertex,'instance':instance,'vaos':{}})
width,height=args.width,round(args.width*9/16)
framebuffer,resolve_framebuffer,color,resolve_color,depth=U(),U(),U(),U(),U()
gl.glGenFramebuffers(1,C.byref(framebuffer));gl.glGenFramebuffers(1,C.byref(resolve_framebuffer))
gl.glGenRenderbuffers(1,C.byref(color));gl.glGenRenderbuffers(1,C.byref(depth));gl.glGenTextures(1,C.byref(resolve_color))
gl.glBindTexture(0x0DE1,resolve_color);gl.glTexImage2D(0x0DE1,0,0x8058,width,height,0,0x1908,0x1401,None)
gl.glTexParameteri(0x0DE1,0x2801,0x2600);gl.glTexParameteri(0x0DE1,0x2800,0x2600)
gl.glBindFramebuffer(0x8D40,resolve_framebuffer);gl.glFramebufferTexture2D(0x8D40,0x8CE0,0x0DE1,resolve_color,0)

def set_uniform(program,name,value,texture_unit=0):
    entry=program['uniforms'].get(name)
    if entry is None or value is None:return texture_unit
    location,kind=entry
    if kind==0x8B5E:
        if isinstance(value,dict) and value.get('texture'):
            gl.glActiveTexture(0x84C0+texture_unit);gl.glBindTexture(0x0DE1,textures[value['texture']]);gl.glUniform1i(location,texture_unit);return texture_unit+1
    elif kind in [0x1404,0x8B56]:gl.glUniform1i(location,int(value))
    elif kind==0x1406:gl.glUniform1f(location,float(value))
    elif kind in [0x8B50,0x8B51,0x8B52]:
        if len(value):{0x8B50:gl.glUniform2f,0x8B51:gl.glUniform3f,0x8B52:gl.glUniform4f}[kind](location,*value)
    elif kind in [0x8B5B,0x8B5C]:
        matrix=np.asarray(value,dtype=np.float32)
        (gl.glUniformMatrix3fv if kind==0x8B5B else gl.glUniformMatrix4fv)(location,1,0,matrix.ctypes.data_as(P))
    return texture_unit

def configure_target(mode,samples,depth_bits):
    gl.glBindFramebuffer(0x8D40,framebuffer)
    actual_samples=[]
    for renderbuffer,internal,attachment in [(color,0x8058,0x8CE0),(depth,0x81A6 if depth_bits==24 else 0x8CAC,0x8D00)]:
        gl.glBindRenderbuffer(0x8D41,renderbuffer)
        gl.glRenderbufferStorageMultisample(0x8D41,samples,internal,width,height)
        gl.glFramebufferRenderbuffer(0x8D40,attachment,0x8D41,renderbuffer)
        actual=I();gl.glGetRenderbufferParameteriv(0x8D41,0x8CAB,C.byref(actual));actual_samples.append(actual.value)
    if gl.glCheckFramebufferStatus(0x8D40)!=0x8CD5:raise RuntimeError(f'Incomplete {mode} / MSAA {samples} framebuffer')
    gl.glClipControlEXT(0x8CA1,0x935F if mode=='reversed' else 0x935E)
    gl.glDepthFunc(0x0206 if mode=='reversed' else 0x0203);gl.glClearDepthf(0 if mode=='reversed' else 1)
    if len(set(actual_samples))!=1:raise RuntimeError('Color/depth sample count differs.')
    return actual_samples[0]

def render(view,mode,selection='normal',reverse=False):
    gl.glBindFramebuffer(0x8D40,framebuffer);gl.glViewport(0,0,width,height)
    gl.glDepthMask(1);gl.glClearColor(0,0,0,1);gl.glClear(0x4000|0x0100);gl.glDisable(0x0BE2)
    ordered=list(enumerate(draws));opaque=[d for d in ordered if manifest['materials'][d[1]['spec']['material']]['role']!='paint'];paint=[d for d in ordered if manifest['materials'][d[1]['spec']['material']]['role']=='paint']
    for index,draw in (opaque[::-1] if reverse else opaque)+paint:
        spec=draw['spec'];material=manifest['materials'][spec['material']];role=material['role']
        if selection=='paint-only' and role!='paint':continue
        if selection=='occluder-only' and role!='occluder':continue
        if selection in ['normal','paint-only'] and role=='occluder':continue
        program=programs[material['programs'][mode]];handle=program['handle'];gl.glUseProgram(handle)
        if handle not in draw['vaos']:
            vao=U();gl.glGenVertexArrays(1,C.byref(vao));gl.glBindVertexArray(vao);gl.glBindBuffer(0x8892,draw['vertex'])
            for name,size,offset in [('position',3,0),('normal',3,12),('uv',2,24)]:
                location=gl.glGetAttribLocation(handle,name.encode())
                if location>=0:gl.glEnableVertexAttribArray(location);gl.glVertexAttribPointer(location,size,0x1406,0,32,P(offset));gl.glVertexAttribDivisor(location,0)
            if draw['instance']:
                gl.glBindBuffer(0x8892,draw['instance']);location=gl.glGetAttribLocation(handle,b'instanceMatrix')
                for col in range(4):gl.glEnableVertexAttribArray(location+col);gl.glVertexAttribPointer(location+col,4,0x1406,0,64,P(col*16));gl.glVertexAttribDivisor(location+col,1)
            draw['vaos'][handle]=vao
        gl.glBindVertexArray(draw['vaos'][handle])
        uniforms={**program['spec']['uniforms'],**view['matrices'][mode]['draws'][index],
            'projectionMatrix':view['matrices'][mode]['projectionMatrix'],'viewMatrix':view['matrices'][mode]['viewMatrix'],
            'modelMatrix':spec['modelMatrix'],'cameraPosition':view['eye'],'isOrthographic':False,'toneMappingExposure':1.08,
            'logDepthBufFC':2/math.log2(view['far']+1),'ambientLightColor':[0,0,0],
            'emissive':{'road':[0,0,.3],'paint':[1,.65,0],'occluder':[0,1,0]}[role]}
        unit=0
        for name,value in uniforms.items():unit=set_uniform(program,name,value,unit)
        if material['side']==2:gl.glDisable(0x0B44)
        else:gl.glEnable(0x0B44);gl.glCullFace(0x0404 if material['side']==1 else 0x0405)
        gl.glDisable(0x0B71) if selection=='paint-only' else gl.glEnable(0x0B71)
        gl.glDepthMask(int(material['depthWrite']))
        state=material['states'][mode]
        if state['polygonOffset']:gl.glEnable(0x8037);gl.glPolygonOffset(state['factor'],state['units'])
        else:gl.glDisable(0x8037)
        if draw['instance']:gl.glDrawArraysInstanced(0x0004,0,spec['vertices'],spec['instances']['count'])
        else:gl.glDrawArrays(0x0004,0,spec['vertices'])
    gl.glBindFramebuffer(0x8CA8,framebuffer);gl.glBindFramebuffer(0x8CA9,resolve_framebuffer)
    gl.glBlitFramebuffer(0,0,width,height,0,0,width,height,0x4000,0x2600);gl.glBindFramebuffer(0x8D40,resolve_framebuffer);gl.glFinish()
    pixels=np.empty((height,width,4),dtype=np.uint8);gl.glReadPixels(0,0,width,height,0x1908,0x1401,pixels.ctypes.data_as(P))
    error=gl.glGetError()
    if error:raise RuntimeError(f'Native paint GL error {error:#x}')
    return pixels[::-1,:,:3].copy()

def behind_occluder(view):
    # Pixel-center ray/box intersection excludes legitimate paint in front of
    # the box, which can share its edge coverage in the multisampled image.
    yy,xx=np.mgrid[:height,:width];tangent=math.tan(math.radians(view['fov'])/2)
    matrix=np.asarray(view['matrices']['logarithmic']['viewMatrix']).reshape(4,4).T
    directions=((xx+.5)/width*2-1)[:,:,None]*tangent*(width/height)*matrix[0,:3]
    directions+=(1-(yy+.5)/height*2)[:,:,None]*tangent*matrix[1,:3]
    directions-=matrix[2,:3];eye=np.asarray(view['eye'])
    box=manifest['occluder']
    with np.errstate(divide='ignore',invalid='ignore'):
        a=(np.asarray(box['min'])-eye)/directions;b=(np.asarray(box['max'])-eye)/directions
        near=np.minimum(a,b).max(axis=2);far=np.maximum(a,b).min(axis=2)
        plane=(manifest['paintHeight']-eye[1])/directions[:,:,1]
    return (far>=near)&(near>0)&(plane>near+.02)

maximum=I();gl.glGetIntegerv(0x8D57,C.byref(maximum));samples=[int(s) for s in args.samples.split(',') if int(s)<=maximum.value]
for mode,depth_bits in [('logarithmic',24),('reversed',24),('reversed',32)]:
    for sample_count in samples:
        actual_samples=configure_target(mode,sample_count,depth_bits)
        for view in manifest['views']:
            if args.views and view['id'] not in args.views.split(','):continue
            actual=render(view,mode);reference=render(view,mode,'paint-only');reverse=render(view,mode,reverse=True)
            expected=reference[:,:,0]>8;lost=expected&(reference[:,:,0].astype(np.int16)-actual[:,:,0].astype(np.int16)>8)
            difference=np.max(np.abs(actual.astype(np.int16)-reverse.astype(np.int16)),axis=2)>2
            with_control=render(view,mode,'occluder');control=render(view,mode,'occluder-only')
            interior=control[:,:,1]>200
            for dy,dx in [(0,1),(0,-1),(1,0),(-1,0)]:interior &= np.roll(control[:,:,1]>200,(dy,dx),(0,1))
            overlap=interior&expected&behind_occluder(view)
            # ACES mixes pure green emission into a nonzero red channel. The
            # paint ID remains red-dominant; the occluder ID is green-dominant.
            leak=overlap&(with_control[:,:,0].astype(np.int16)>with_control[:,:,1].astype(np.int16)+5)
            name=f"{view['id']}-{mode}{depth_bits}-msaa{actual_samples or 1}"
            Image.fromarray(actual).save(args.output/(name+'.png'))
            if overlap.any():
                Image.fromarray(with_control).save(args.output/(name+'-occluder.png'))
                Image.fromarray(control).save(args.output/(name+'-occluder-only.png'))
            if lost.any():
                marked=actual.copy();marked[lost]=[255,0,150];Image.fromarray(marked).save(args.output/(name+'-missing.png'))
            result={'view':view['id'],'mode':mode,'depthFormat':'DEPTH_COMPONENT24' if depth_bits==24 else 'DEPTH_COMPONENT32F','requestedSamples':sample_count,'samples':actual_samples or 1,
                'expectedPaintPixels':int(expected.sum()),'lostPaintPixels':int(lost.sum()),'lostPaintFraction':float(lost.sum()/max(1,expected.sum())),
                'drawOrderChangedPixels':int(difference.sum()),'occluderPaintOverlapPixels':int(overlap.sum()),'occluderLeakPixels':int(leak.sum()),'image':name+'.png',
                'imageSha256':hashlib.sha256((args.output/(name+'.png')).read_bytes()).hexdigest()}
            report['results'].append(result)
            if expected.sum()<10:report['failures'].append(name+': paint-only reference has too little visible coverage.')
            if lost.any():report['failures'].append(name+': paint coverage lost against underlying road.')
            if leak.any():report['failures'].append(name+': paint leaked through the ground-touching occluder.')
            if difference.any():report['failures'].append(name+': road draw-order changed visible pixels.')
            print(json.dumps(result),flush=True)
if not any(item['occluderPaintOverlapPixels'] for item in report['results']):report['failures'].append('Occluder control did not overlap any paint pixels.')
report['passed']=not report['failures'];(args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'passed':report['passed'],'programs':len(programs),'cases':len(report['results']),'output':str(args.output),'failures':len(report['failures'])}))
if not report['passed'] and not args.record_only:raise SystemExit(1)
