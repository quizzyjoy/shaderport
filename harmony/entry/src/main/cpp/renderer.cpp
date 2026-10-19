#include "renderer.h"

#include <EGL/eglext.h>
#include <hilog/log.h>

#include <chrono>
#include <cstring>

#undef LOG_DOMAIN
#undef LOG_TAG
#define LOG_DOMAIN 0x5301
#define LOG_TAG "ShaderPort"

namespace {

constexpr const char *kVertexShader = R"(#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
smooth out vec2 _vs2fs_location0;
void main() {
    vec2 uv = aPos * 0.5 + 0.5;
    _vs2fs_location0 = vec2(uv.x, 1.0 - uv.y);
    gl_Position = vec4(aPos, 0.0, 1.0);
}
)";

GLuint CompileShader(GLenum type, const char *source) {
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &source, nullptr);
    glCompileShader(shader);
    GLint ok = GL_FALSE;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &ok);
    if (ok != GL_TRUE) {
        char log[2048] = {0};
        glGetShaderInfoLog(shader, sizeof(log), nullptr, log);
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "compile failed: %{public}s", log);
        glDeleteShader(shader);
        return 0;
    }
    return shader;
}

}  // namespace

EffectRenderer &EffectRenderer::Get() {
    static EffectRenderer instance;
    return instance;
}

bool EffectRenderer::Init(uint64_t surfaceId, int width, int height) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (initialized_) {
        width_ = width;
        height_ = height;
        return true;
    }
    width_ = width;
    height_ = height;

    if (!CreateEgl(surfaceId)) {
        return false;
    }

    glGenVertexArrays(1, &vao_);
    glBindVertexArray(vao_);
    glGenBuffers(1, &vbo_);
    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    const float quad[] = {-1.0f, -1.0f, 1.0f, -1.0f, -1.0f, 1.0f,
                          -1.0f, 1.0f,  1.0f, -1.0f, 1.0f,  1.0f};
    glBufferData(GL_ARRAY_BUFFER, sizeof(quad), quad, GL_STATIC_DRAW);
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 2 * sizeof(float), nullptr);
    glBindVertexArray(0);

    eglMakeCurrent(display_, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);

    vsync_ = OH_NativeVSync_Create("shaderport", 11);
    if (vsync_ == nullptr) {
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "vsync create failed");
        return false;
    }

    initialized_ = true;
    running_ = true;
    OH_NativeVSync_RequestFrame(vsync_, FrameCallback, this);
    OH_LOG_Print(LOG_APP, LOG_INFO, LOG_DOMAIN, LOG_TAG, "EGL ready %{public}dx%{public}d", width_, height_);
    return true;
}

bool EffectRenderer::CreateEgl(uint64_t surfaceId) {
    if (OH_NativeWindow_CreateNativeWindowFromSurfaceId(surfaceId, &window_) != 0 || window_ == nullptr) {
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "native window create failed");
        return false;
    }

    display_ = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display_ == EGL_NO_DISPLAY || eglInitialize(display_, nullptr, nullptr) != EGL_TRUE) {
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "eglInitialize failed");
        return false;
    }

    const EGLint configAttribs[] = {
        EGL_SURFACE_TYPE, EGL_WINDOW_BIT,
        EGL_RENDERABLE_TYPE, EGL_OPENGL_ES3_BIT_KHR,
        EGL_RED_SIZE, 8,
        EGL_GREEN_SIZE, 8,
        EGL_BLUE_SIZE, 8,
        EGL_ALPHA_SIZE, 8,
        EGL_NONE,
    };
    EGLint numConfigs = 0;
    if (eglChooseConfig(display_, configAttribs, &config_, 1, &numConfigs) != EGL_TRUE || numConfigs < 1) {
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "eglChooseConfig failed");
        return false;
    }

    const EGLint contextAttribs[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
    context_ = eglCreateContext(display_, config_, EGL_NO_CONTEXT, contextAttribs);
    if (context_ == EGL_NO_CONTEXT) {
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "eglCreateContext failed");
        return false;
    }

    surface_ = eglCreateWindowSurface(display_, config_,
                                      reinterpret_cast<EGLNativeWindowType>(window_), nullptr);
    if (surface_ == EGL_NO_SURFACE) {
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "eglCreateWindowSurface failed");
        return false;
    }

    if (eglMakeCurrent(display_, surface_, surface_, context_) != EGL_TRUE) {
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "eglMakeCurrent failed");
        return false;
    }
    eglSwapInterval(display_, 1);
    OH_LOG_Print(LOG_APP, LOG_INFO, LOG_DOMAIN, LOG_TAG, "GL_VERSION=%{public}s",
                 reinterpret_cast<const char *>(glGetString(GL_VERSION)));
    return true;
}

void EffectRenderer::SetShader(const std::string &fragmentSource, const std::string &blockName,
                               const std::string &instanceName) {
    std::lock_guard<std::mutex> lock(mutex_);
    pendingFragment_ = fragmentSource;
    blockName_ = blockName;
    instanceName_ = instanceName;
    hasPendingShader_ = true;
}

void EffectRenderer::SetParam(const std::string &name, const std::vector<float> &values) {
    std::lock_guard<std::mutex> lock(mutex_);
    params_[name] = values;
}

void EffectRenderer::SetPointer(float x, float y, float active) {
    std::lock_guard<std::mutex> lock(mutex_);
    pointerX_ = x;
    pointerY_ = y;
    pointerActive_ = active;
}

void EffectRenderer::Resize(int width, int height) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (width > 0 && height > 0) {
        width_ = width;
        height_ = height;
    }
}

void EffectRenderer::FrameCallback(long long timestamp, void *data) {
    auto *self = static_cast<EffectRenderer *>(data);
    if (self != nullptr) {
        self->OnFrame(timestamp);
    }
}

void EffectRenderer::OnFrame(long long timestamp) {
    if (!initialized_ || !running_) {
        return;
    }
    if (eglMakeCurrent(display_, surface_, surface_, context_) != EGL_TRUE) {
        return;
    }

    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (firstTimestamp_ == 0) {
            firstTimestamp_ = timestamp;
        }
        const double time = static_cast<double>(timestamp - firstTimestamp_) / 1e9;
        if (hasPendingShader_) {
            BuildProgram();
            hasPendingShader_ = false;
        }
        if (program_ != 0) {
            PackAndDraw(time);
        }
    }

    eglSwapBuffers(display_, surface_);
    eglMakeCurrent(display_, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);

    if (running_) {
        OH_NativeVSync_RequestFrame(vsync_, FrameCallback, this);
    }
}

bool EffectRenderer::BuildProgram() {
    GLuint vs = CompileShader(GL_VERTEX_SHADER, kVertexShader);
    GLuint fs = CompileShader(GL_FRAGMENT_SHADER, pendingFragment_.c_str());
    if (vs == 0 || fs == 0) {
        if (vs != 0) glDeleteShader(vs);
        if (fs != 0) glDeleteShader(fs);
        return false;
    }

    GLuint program = glCreateProgram();
    glAttachShader(program, vs);
    glAttachShader(program, fs);
    glLinkProgram(program);
    glDeleteShader(vs);
    glDeleteShader(fs);

    GLint linked = GL_FALSE;
    glGetProgramiv(program, GL_LINK_STATUS, &linked);
    if (linked != GL_TRUE) {
        char log[2048] = {0};
        glGetProgramInfoLog(program, sizeof(log), nullptr, log);
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "link failed: %{public}s", log);
        glDeleteProgram(program);
        return false;
    }

    if (program_ != 0) {
        glDeleteProgram(program_);
    }
    program_ = program;

    if (ubo_ != 0) {
        glDeleteBuffers(1, &ubo_);
        ubo_ = 0;
    }
    ReflectUbo();
    return true;
}

void EffectRenderer::ReflectUbo() {
    members_.clear();
    uboSize_ = 0;
    blockIndex_ = glGetUniformBlockIndex(program_, blockName_.c_str());

    if (blockIndex_ == GL_INVALID_INDEX) {
        GLint blockCount = 0;
        glGetProgramiv(program_, GL_ACTIVE_UNIFORM_BLOCKS, &blockCount);
        for (GLint i = 0; i < blockCount; ++i) {
            char name[256] = {0};
            glGetActiveUniformBlockName(program_, static_cast<GLuint>(i), sizeof(name), nullptr, name);
            if (blockName_ == name) {
                blockIndex_ = static_cast<GLuint>(i);
                break;
            }
        }
    }
    if (blockIndex_ == GL_INVALID_INDEX) {
        OH_LOG_Print(LOG_APP, LOG_ERROR, LOG_DOMAIN, LOG_TAG, "uniform block '%{public}s' not found",
                     blockName_.c_str());
        return;
    }

    glGetActiveUniformBlockiv(program_, blockIndex_, GL_UNIFORM_BLOCK_DATA_SIZE, &uboSize_);
    glUniformBlockBinding(program_, blockIndex_, 0);

    glGenBuffers(1, &ubo_);
    glBindBuffer(GL_UNIFORM_BUFFER, ubo_);
    glBufferData(GL_UNIFORM_BUFFER, uboSize_, nullptr, GL_DYNAMIC_DRAW);
    glBindBufferBase(GL_UNIFORM_BUFFER, 0, ubo_);

    const std::string prefix = instanceName_ + ".";
    GLint uniformCount = 0;
    glGetProgramiv(program_, GL_ACTIVE_UNIFORMS, &uniformCount);
    for (GLint i = 0; i < uniformCount; ++i) {
        char name[256] = {0};
        GLint size = 0;
        GLenum type = GL_FLOAT;
        glGetActiveUniform(program_, static_cast<GLuint>(i), sizeof(name), nullptr, &size, &type, name);
        std::string full(name);
        if (full.compare(0, prefix.size(), prefix) != 0) {
            continue;
        }
        GLint offset = 0;
        GLuint index = static_cast<GLuint>(i);
        glGetActiveUniformsiv(program_, 1, &index, GL_UNIFORM_OFFSET, &offset);
        members_.push_back({full.substr(prefix.size()), type, offset, size});
    }

    OH_LOG_Print(LOG_APP, LOG_INFO, LOG_DOMAIN, LOG_TAG, "ubo=%{public}d bytes, members=%{public}zu",
                 uboSize_, members_.size());
}

void EffectRenderer::WriteValue(std::vector<uint8_t> &buffer, const UboMember &member,
                                const std::vector<float> &values) const {
    if (values.empty() || member.offset < 0) {
        return;
    }
    const size_t offset = static_cast<size_t>(member.offset);
    const size_t bytes = buffer.size();
    auto putFloat = [&](size_t index, float value) {
        if (offset + index * sizeof(float) + sizeof(float) <= bytes) {
            std::memcpy(buffer.data() + offset + index * sizeof(float), &value, sizeof(float));
        }
    };

    switch (member.type) {
        case GL_FLOAT:
            putFloat(0, values[0]);
            break;
        case GL_FLOAT_VEC2:
            for (int i = 0; i < 2; ++i) putFloat(i, i < static_cast<int>(values.size()) ? values[i] : 0.0f);
            break;
        case GL_FLOAT_VEC3:
            for (int i = 0; i < 3; ++i) putFloat(i, i < static_cast<int>(values.size()) ? values[i] : 0.0f);
            break;
        case GL_FLOAT_VEC4:
            for (int i = 0; i < 4; ++i) putFloat(i, i < static_cast<int>(values.size()) ? values[i] : 0.0f);
            break;
        case GL_INT:
        case GL_BOOL: {
            GLint v = static_cast<GLint>(values[0]);
            if (offset + sizeof(v) <= bytes) std::memcpy(buffer.data() + offset, &v, sizeof(v));
            break;
        }
        default:
            break;
    }
}

void EffectRenderer::PackAndDraw(double time) {
    std::vector<uint8_t> buffer(static_cast<size_t>(uboSize_), 0);
    const float vw = static_cast<float>(width_);
    const float vh = static_cast<float>(height_);
    const float aspect = vh > 0.0f ? vw / vh : 1.0f;

    for (const auto &member : members_) {
        if (member.size > 1) {
            continue;  // array elements stay zero (stops are null in the current specs)
        }
        const size_t dot = member.path.find('.');
        const std::string node = dot == std::string::npos ? member.path : member.path.substr(0, dot);
        const std::string leaf = dot == std::string::npos ? std::string() : member.path.substr(dot + 1);

        std::vector<float> values;
        if (node == "_sys") {
            if (leaf == "time") values = {static_cast<float>(time)};
            else if (leaf == "viewportSize") values = {vw, vh};
            else if (leaf == "logicalViewportSize") values = {vw, vh};
            else if (leaf == "aspect") values = {aspect};
            else if (leaf == "pointer") values = {pointerX_, pointerY_};
            else if (leaf == "pointerActive") values = {pointerActive_};
        } else if (node == "n_root") {
            if (leaf == "_opacity") values = {1.0f};
        } else if (node == "n_n" || node == "n_base") {
            if (leaf == "_opacity") {
                values = {1.0f};
            } else if (leaf == "_animTime") {
                values = {static_cast<float>(time)};
            } else if (leaf == "stopCount") {
                values = {0.0f};
            } else {
                const auto it = params_.find(leaf);
                if (it != params_.end()) {
                    values = it->second;
                }
            }
        }
        WriteValue(buffer, member, values);
    }

    glBindBuffer(GL_UNIFORM_BUFFER, ubo_);
    glBufferSubData(GL_UNIFORM_BUFFER, 0, static_cast<GLsizeiptr>(buffer.size()), buffer.data());
    glBindBufferBase(GL_UNIFORM_BUFFER, 0, ubo_);

    glViewport(0, 0, width_, height_);
    glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT);
    glUseProgram(program_);
    glBindVertexArray(vao_);
    glDrawArrays(GL_TRIANGLES, 0, 6);
    glBindVertexArray(0);
}

void EffectRenderer::Dispose() {
    running_ = false;
    if (vsync_ != nullptr) {
        OH_NativeVSync_Destroy(vsync_);
        vsync_ = nullptr;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    if (display_ != EGL_NO_DISPLAY && context_ != EGL_NO_CONTEXT) {
        eglMakeCurrent(display_, surface_, surface_, context_);
        if (program_ != 0) glDeleteProgram(program_);
        if (ubo_ != 0) glDeleteBuffers(1, &ubo_);
        if (vbo_ != 0) glDeleteBuffers(1, &vbo_);
        if (vao_ != 0) glDeleteVertexArrays(1, &vao_);
        program_ = 0;
        ubo_ = 0;
        vbo_ = 0;
        vao_ = 0;
        eglMakeCurrent(display_, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
        eglDestroySurface(display_, surface_);
        eglDestroyContext(display_, context_);
        eglTerminate(display_);
    }
    surface_ = EGL_NO_SURFACE;
    context_ = EGL_NO_CONTEXT;
    display_ = EGL_NO_DISPLAY;

    if (window_ != nullptr) {
        OH_NativeWindow_DestroyNativeWindow(window_);
        window_ = nullptr;
    }
    initialized_ = false;
}
