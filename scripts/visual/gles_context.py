"""Small native EGL/GLES3 diagnostic context. No browser or browser settings.

Requires system Mesa/EGL/GLES; Python ctypes provides the bindings. Rendering
helpers use numpy only to transfer vertex, uniform, and readback buffers.
"""
import ctypes as C
import ctypes.util

U, I, P, F = C.c_uint, C.c_int, C.c_void_p, C.c_float


class GLContext:
    def __init__(self):
        self.egl = C.CDLL(ctypes.util.find_library('EGL') or 'libEGL.so.1')
        e = self.egl
        egl_functions = {
            'eglGetProcAddress': (P, [C.c_char_p]),
            'eglGetPlatformDisplay': (P, [U, P, P]),
            'eglInitialize': (U, [P, C.POINTER(I), C.POINTER(I)]),
            'eglBindAPI': (U, [U]),
            'eglChooseConfig': (U, [P, C.POINTER(I), C.POINTER(P), I, C.POINTER(I)]),
            'eglCreateContext': (P, [P, P, P, C.POINTER(I)]),
            'eglCreatePbufferSurface': (P, [P, P, C.POINTER(I)]),
            'eglMakeCurrent': (U, [P, P, P, P]),
            'eglGetError': (U, []),
        }
        for name, (result, arguments) in egl_functions.items():
            function = getattr(e, name)
            function.restype, function.argtypes = result, arguments
        self.display = e.eglGetPlatformDisplay(0x31DD, None, None)
        major, minor = I(), I()
        self._check(e.eglInitialize(self.display, C.byref(major), C.byref(minor)), 'eglInitialize')
        self._check(e.eglBindAPI(0x30A0), 'eglBindAPI GLES')
        attributes = (I * 15)(0x3033, 1, 0x3040, 0x40, 0x3024, 8, 0x3023, 8,
                             0x3022, 8, 0x3021, 8, 0x3025, 0, 0x3038)
        config, count = P(), I()
        self._check(e.eglChooseConfig(self.display, attributes, C.byref(config), 1, C.byref(count)), 'eglChooseConfig')
        if not count.value:
            raise RuntimeError('No GLES3 EGL configuration')
        self.context = e.eglCreateContext(self.display, config, None, (I * 3)(0x3098, 3, 0x3038))
        self._check(self.context, 'eglCreateContext')
        self.surface = e.eglCreatePbufferSurface(self.display, config, (I * 5)(0x3057, 16, 0x3056, 16, 0x3038))
        self._check(self.surface, 'eglCreatePbufferSurface')
        self._check(e.eglMakeCurrent(self.display, self.surface, self.surface, self.context), 'eglMakeCurrent')
        signatures = {
            'glGetString': (C.c_char_p, [U]), 'glGetError': (U, []),
            'glCreateShader': (U, [U]),
            'glShaderSource': (None, [U, I, C.POINTER(C.c_char_p), C.POINTER(I)]),
            'glCompileShader': (None, [U]),
            'glGetShaderiv': (None, [U, U, C.POINTER(I)]),
            'glGetShaderInfoLog': (None, [U, I, C.POINTER(I), P]),
            'glCreateProgram': (U, []), 'glAttachShader': (None, [U, U]),
            'glBindAttribLocation': (None, [U, U, C.c_char_p]),
            'glLinkProgram': (None, [U]),
            'glGetProgramiv': (None, [U, U, C.POINTER(I)]),
            'glGetProgramInfoLog': (None, [U, I, C.POINTER(I), P]),
            'glDeleteShader': (None, [U]), 'glDeleteProgram': (None, [U]),
            'glUseProgram': (None, [U]),
            'glGetUniformLocation': (I, [U, C.c_char_p]),
            'glUniform1f': (None, [I, F]), 'glUniform1i': (None, [I, I]),
            'glUniform2f': (None, [I, F, F]), 'glUniform3f': (None, [I, F, F, F]),
            'glUniformMatrix4fv': (None, [I, I, U, P]),
            'glGenTextures': (None, [I, C.POINTER(U)]), 'glBindTexture': (None, [U, U]),
            'glActiveTexture': (None, [U]), 'glTexParameteri': (None, [U, U, I]),
            'glTexImage2D': (None, [U, I, I, I, I, I, U, U, P]),
            'glGenFramebuffers': (None, [I, C.POINTER(U)]), 'glBindFramebuffer': (None, [U, U]),
            'glFramebufferTexture2D': (None, [U, U, U, U, I]),
            'glCheckFramebufferStatus': (U, [U]),
            'glGenRenderbuffers': (None, [I, C.POINTER(U)]), 'glBindRenderbuffer': (None, [U, U]),
            'glRenderbufferStorage': (None, [U, U, I, I]),
            'glFramebufferRenderbuffer': (None, [U, U, U, U]),
            'glGenVertexArrays': (None, [I, C.POINTER(U)]), 'glBindVertexArray': (None, [U]),
            'glGenBuffers': (None, [I, C.POINTER(U)]), 'glBindBuffer': (None, [U, U]),
            'glBufferData': (None, [U, C.c_ssize_t, P, U]),
            'glEnableVertexAttribArray': (None, [U]),
            'glVertexAttribPointer': (None, [U, I, U, U, I, P]),
            'glViewport': (None, [I, I, I, I]), 'glDrawArrays': (None, [U, I, I]),
            'glReadPixels': (None, [I, I, I, I, U, U, P]),
            'glFinish': (None, []), 'glEnable': (None, [U]), 'glDisable': (None, [U]),
            'glClearColor': (None, [F, F, F, F]), 'glClear': (None, [U]),
            'glDepthFunc': (None, [U]), 'glDepthMask': (None, [U]),
        }
        for name, (result, arguments) in signatures.items():
            pointer = e.eglGetProcAddress(name.encode())
            if not pointer:
                raise RuntimeError('Missing GLES entry point: ' + name)
            setattr(self, name, C.CFUNCTYPE(result, *arguments)(pointer))

    def _check(self, ok, label):
        if not ok:
            raise RuntimeError(f'{label} failed: EGL {self.egl.eglGetError():#x}')

    def compile_program(self, vertex, fragment, name):
        record = {'name': name, 'stages': [], 'linked': False}
        handles = []
        for stage, kind, source in [('vertex', 0x8B31, vertex), ('fragment', 0x8B30, fragment)]:
            handle = self.glCreateShader(kind)
            text = C.c_char_p(source.encode())
            self.glShaderSource(handle, 1, C.byref(text), None)
            self.glCompileShader(handle)
            status, length = I(), I()
            self.glGetShaderiv(handle, 0x8B81, C.byref(status))
            self.glGetShaderiv(handle, 0x8B84, C.byref(length))
            log = C.create_string_buffer(max(1, length.value))
            self.glGetShaderInfoLog(handle, len(log), None, log)
            record['stages'].append({'stage': stage, 'compiled': bool(status.value), 'log': log.value.decode()})
            handles.append(handle)
        if not all(stage['compiled'] for stage in record['stages']):
            for handle in handles:
                self.glDeleteShader(handle)
            return None, record
        program = self.glCreateProgram()
        for handle in handles:
            self.glAttachShader(program, handle)
        self.glBindAttribLocation(program, 0, b'position')
        self.glLinkProgram(program)
        status, length = I(), I()
        self.glGetProgramiv(program, 0x8B82, C.byref(status))
        self.glGetProgramiv(program, 0x8B84, C.byref(length))
        log = C.create_string_buffer(max(1, length.value))
        self.glGetProgramInfoLog(program, len(log), None, log)
        record.update(linked=bool(status.value), linkLog=log.value.decode())
        for handle in handles:
            self.glDeleteShader(handle)
        return program if status.value else None, record

    def description(self):
        return {name: self.glGetString(value).decode() for name, value in
                [('vendor', 0x1F00), ('renderer', 0x1F01), ('version', 0x1F02)]}
