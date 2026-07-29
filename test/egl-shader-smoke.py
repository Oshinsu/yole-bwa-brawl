#!/usr/bin/env python3
from __future__ import annotations
import ctypes as C
import ctypes.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROGRAMS = ROOT / 'test' / 'generated-shaders.json'

EGL_DEFAULT_DISPLAY = C.c_void_p(0)
EGL_NO_DISPLAY = C.c_void_p(0)
EGL_NO_CONTEXT = C.c_void_p(0)
EGL_NO_SURFACE = C.c_void_p(0)
EGL_NONE = 0x3038
EGL_RED_SIZE = 0x3024
EGL_GREEN_SIZE = 0x3023
EGL_BLUE_SIZE = 0x3022
EGL_ALPHA_SIZE = 0x3021
EGL_SURFACE_TYPE = 0x3033
EGL_PBUFFER_BIT = 0x0001
EGL_RENDERABLE_TYPE = 0x3040
EGL_OPENGL_ES2_BIT = 0x0004
EGL_CONTEXT_CLIENT_VERSION = 0x3098
EGL_WIDTH = 0x3057
EGL_HEIGHT = 0x3056
EGL_OPENGL_ES_API = 0x30A0
EGL_PLATFORM_SURFACELESS_MESA = 0x31DD

GL_VERTEX_SHADER = 0x8B31
GL_FRAGMENT_SHADER = 0x8B30
GL_COMPILE_STATUS = 0x8B81
GL_LINK_STATUS = 0x8B82
GL_INFO_LOG_LENGTH = 0x8B84
GL_RENDERER = 0x1F01
GL_VERSION = 0x1F02

system_egl = ctypes.util.find_library('EGL')
system_gles = ctypes.util.find_library('GLESv2')
chromium_egl = Path('/usr/lib/chromium/libEGL.so')
chromium_gles = Path('/usr/lib/chromium/libGLESv2.so')
if system_egl and system_gles:
    egl_path, gles_path = system_egl, system_gles
elif chromium_egl.exists() and chromium_gles.exists():
    egl_path, gles_path = str(chromium_egl), str(chromium_gles)
    os.environ.setdefault('VK_ICD_FILENAMES', '/usr/lib/chromium/vk_swiftshader_icd.json')
else:
    print(json.dumps({'ok': True, 'skipped': True, 'reason': 'EGL/GLES2 libraries unavailable'}))
    raise SystemExit(0)
libegl = C.CDLL(egl_path)
libgles = C.CDLL(gles_path)

libegl.eglGetProcAddress.argtypes = [C.c_char_p]
libegl.eglGetProcAddress.restype = C.c_void_p
libegl.eglGetDisplay.argtypes = [C.c_void_p]
libegl.eglGetDisplay.restype = C.c_void_p
libegl.eglInitialize.argtypes = [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_int)]
libegl.eglInitialize.restype = C.c_uint
libegl.eglBindAPI.argtypes = [C.c_uint]
libegl.eglBindAPI.restype = C.c_uint
libegl.eglChooseConfig.argtypes = [C.c_void_p, C.POINTER(C.c_int), C.POINTER(C.c_void_p), C.c_int, C.POINTER(C.c_int)]
libegl.eglChooseConfig.restype = C.c_uint
libegl.eglCreatePbufferSurface.argtypes = [C.c_void_p, C.c_void_p, C.POINTER(C.c_int)]
libegl.eglCreatePbufferSurface.restype = C.c_void_p
libegl.eglCreateContext.argtypes = [C.c_void_p, C.c_void_p, C.c_void_p, C.POINTER(C.c_int)]
libegl.eglCreateContext.restype = C.c_void_p
libegl.eglMakeCurrent.argtypes = [C.c_void_p, C.c_void_p, C.c_void_p, C.c_void_p]
libegl.eglMakeCurrent.restype = C.c_uint
libegl.eglDestroyContext.argtypes = [C.c_void_p, C.c_void_p]
libegl.eglDestroySurface.argtypes = [C.c_void_p, C.c_void_p]
libegl.eglTerminate.argtypes = [C.c_void_p]
libegl.eglGetError.restype = C.c_uint

PFN_GET_PLATFORM_DISPLAY = C.CFUNCTYPE(C.c_void_p, C.c_uint, C.c_void_p, C.POINTER(C.c_int))
proc = libegl.eglGetProcAddress(b'eglGetPlatformDisplayEXT')
if proc:
    get_platform_display = PFN_GET_PLATFORM_DISPLAY(proc)
    display = get_platform_display(EGL_PLATFORM_SURFACELESS_MESA, EGL_DEFAULT_DISPLAY, None)
else:
    display = libegl.eglGetDisplay(EGL_DEFAULT_DISPLAY)
if not display:
    raise RuntimeError(f'EGL display unavailable: 0x{libegl.eglGetError():04x}')
major, minor = C.c_int(), C.c_int()
if not libegl.eglInitialize(display, C.byref(major), C.byref(minor)):
    raise RuntimeError(f'eglInitialize failed: 0x{libegl.eglGetError():04x}')
if not libegl.eglBindAPI(EGL_OPENGL_ES_API):
    raise RuntimeError(f'eglBindAPI failed: 0x{libegl.eglGetError():04x}')
attrs = (C.c_int * 15)(
    EGL_SURFACE_TYPE, EGL_PBUFFER_BIT,
    EGL_RENDERABLE_TYPE, EGL_OPENGL_ES2_BIT,
    EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8, EGL_ALPHA_SIZE, 8,
    EGL_NONE, 0, 0
)
config = C.c_void_p()
count = C.c_int()
if not libegl.eglChooseConfig(display, attrs, C.byref(config), 1, C.byref(count)) or count.value < 1:
    raise RuntimeError(f'eglChooseConfig failed: 0x{libegl.eglGetError():04x}')
pbuffer_attrs = (C.c_int * 5)(EGL_WIDTH, 64, EGL_HEIGHT, 64, EGL_NONE)
surface = libegl.eglCreatePbufferSurface(display, config, pbuffer_attrs)
ctx_attrs = (C.c_int * 3)(EGL_CONTEXT_CLIENT_VERSION, 2, EGL_NONE)
context = libegl.eglCreateContext(display, config, EGL_NO_CONTEXT, ctx_attrs)
if not surface or not context:
    raise RuntimeError(f'EGL surface/context failed: 0x{libegl.eglGetError():04x}')
if not libegl.eglMakeCurrent(display, surface, surface, context):
    raise RuntimeError(f'eglMakeCurrent failed: 0x{libegl.eglGetError():04x}')

libgles.glCreateShader.argtypes = [C.c_uint]
libgles.glCreateShader.restype = C.c_uint
libgles.glShaderSource.argtypes = [C.c_uint, C.c_int, C.POINTER(C.c_char_p), C.POINTER(C.c_int)]
libgles.glCompileShader.argtypes = [C.c_uint]
libgles.glGetShaderiv.argtypes = [C.c_uint, C.c_uint, C.POINTER(C.c_int)]
libgles.glGetShaderInfoLog.argtypes = [C.c_uint, C.c_int, C.POINTER(C.c_int), C.c_char_p]
libgles.glCreateProgram.restype = C.c_uint
libgles.glAttachShader.argtypes = [C.c_uint, C.c_uint]
libgles.glLinkProgram.argtypes = [C.c_uint]
libgles.glGetProgramiv.argtypes = [C.c_uint, C.c_uint, C.POINTER(C.c_int)]
libgles.glGetProgramInfoLog.argtypes = [C.c_uint, C.c_int, C.POINTER(C.c_int), C.c_char_p]
libgles.glDeleteShader.argtypes = [C.c_uint]
libgles.glDeleteProgram.argtypes = [C.c_uint]
libgles.glGetString.argtypes = [C.c_uint]
libgles.glGetString.restype = C.c_char_p

VERTEX_PREAMBLE = '''
attribute vec3 position;
attribute vec2 uv;
uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
'''
FRAGMENT_PREAMBLE = 'precision highp float;\nuniform vec3 cameraPosition;\n'

def compile_shader(shader_type: int, source: str, preamble: str) -> int:
    shader = libgles.glCreateShader(shader_type)
    data = (preamble + '\n' + source).encode('utf-8')
    ptr = C.c_char_p(data)
    length = C.c_int(len(data))
    libgles.glShaderSource(shader, 1, C.byref(ptr), C.byref(length))
    libgles.glCompileShader(shader)
    ok = C.c_int()
    libgles.glGetShaderiv(shader, GL_COMPILE_STATUS, C.byref(ok))
    if not ok.value:
        log_len = C.c_int()
        libgles.glGetShaderiv(shader, GL_INFO_LOG_LENGTH, C.byref(log_len))
        buffer = C.create_string_buffer(max(1, log_len.value + 1))
        libgles.glGetShaderInfoLog(shader, len(buffer), None, buffer)
        raise RuntimeError(buffer.value.decode('utf-8', 'replace'))
    return shader

programs = json.loads(PROGRAMS.read_text(encoding='utf-8'))
report = []
renderer = 'unknown'
version = 'unknown'
try:
    for entry in programs:
        vs = compile_shader(GL_VERTEX_SHADER, entry['vertex'], VERTEX_PREAMBLE)
        fs = compile_shader(GL_FRAGMENT_SHADER, entry['fragment'], FRAGMENT_PREAMBLE)
        program = libgles.glCreateProgram()
        libgles.glAttachShader(program, vs)
        libgles.glAttachShader(program, fs)
        libgles.glLinkProgram(program)
        ok = C.c_int()
        libgles.glGetProgramiv(program, GL_LINK_STATUS, C.byref(ok))
        if not ok.value:
            log_len = C.c_int()
            libgles.glGetProgramiv(program, GL_INFO_LOG_LENGTH, C.byref(log_len))
            buffer = C.create_string_buffer(max(1, log_len.value + 1))
            libgles.glGetProgramInfoLog(program, len(buffer), None, buffer)
            raise RuntimeError(f"{entry['name']}: {buffer.value.decode('utf-8', 'replace')}")
        report.append({'name': entry['name'], 'linked': True})
        libgles.glDeleteProgram(program)
        libgles.glDeleteShader(vs)
        libgles.glDeleteShader(fs)
    renderer = (libgles.glGetString(GL_RENDERER) or b'unknown').decode('utf-8', 'replace')
    version = (libgles.glGetString(GL_VERSION) or b'unknown').decode('utf-8', 'replace')
finally:
    libegl.eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT)
    libegl.eglDestroyContext(display, context)
    libegl.eglDestroySurface(display, surface)
    libegl.eglTerminate(display)

print(json.dumps({'ok': True, 'egl': f'{major.value}.{minor.value}', 'renderer': renderer, 'version': version, 'programs': report}, indent=2))
