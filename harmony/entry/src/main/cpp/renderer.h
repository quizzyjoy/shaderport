#ifndef SHADERPORT_RENDERER_H
#define SHADERPORT_RENDERER_H

#include <EGL/egl.h>
#include <GLES3/gl3.h>
#include <native_vsync/native_vsync.h>
#include <native_window/external_window.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

struct UboMember {
    std::string path;  // e.g. "n_n.colorA"
    GLenum type = GL_FLOAT;
    GLint offset = 0;
    GLint size = 1;
};

class EffectRenderer {
public:
    static EffectRenderer &Get();

    bool Init(uint64_t surfaceId, int width, int height);
    void SetShader(const std::string &fragmentSource, const std::string &blockName,
                   const std::string &instanceName);
    void SetParam(const std::string &name, const std::vector<float> &values);
    void SetPointer(float x, float y, float active);
    void Resize(int width, int height);
    void Dispose();

private:
    EffectRenderer() = default;
    ~EffectRenderer() = default;

    static void FrameCallback(long long timestamp, void *data);
    void OnFrame(long long timestamp);

    bool CreateEgl(uint64_t surfaceId);
    bool BuildProgram();
    void ReflectUbo();
    void PackAndDraw(double time);
    void WriteValue(std::vector<uint8_t> &buffer, const UboMember &member,
                    const std::vector<float> &values) const;

    EGLDisplay display_ = EGL_NO_DISPLAY;
    EGLSurface surface_ = EGL_NO_SURFACE;
    EGLContext context_ = EGL_NO_CONTEXT;
    EGLConfig config_ = nullptr;
    OHNativeWindow *window_ = nullptr;
    OH_NativeVSync *vsync_ = nullptr;

    GLuint program_ = 0;
    GLuint vao_ = 0;
    GLuint vbo_ = 0;
    GLuint ubo_ = 0;
    GLuint blockIndex_ = GL_INVALID_INDEX;
    GLint uboSize_ = 0;
    std::vector<UboMember> members_;

    std::mutex mutex_;
    std::unordered_map<std::string, std::vector<float>> params_;
    std::string pendingFragment_;
    std::string blockName_ = "combined_block_0Fragment";
    std::string instanceName_ = "_group_0_binding_0_fs";
    bool hasPendingShader_ = false;
    bool programDirty_ = false;

    int width_ = 0;
    int height_ = 0;
    float pointerX_ = 0.5f;
    float pointerY_ = 0.5f;
    float pointerActive_ = 0.0f;

    bool running_ = false;
    bool initialized_ = false;
    long long firstTimestamp_ = 0;
};

#endif  // SHADERPORT_RENDERER_H
