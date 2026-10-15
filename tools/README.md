# 工具（tools）

## `wgsl2glsles`（计划中）

把 WGSL 转成 **GLSL ES 3.00**，并**报告目标能力缺口**——而不是静默产出一份在 GLES 3.0 上跑不起来的代码。

### 为什么不是自研编译器

[`naga`](https://github.com/gfx-rs/wgpu)（wgpu 的着色器编译器，MIT/Apache-2.0）的 GLSL 后端**已明确支持 ES 300 / 310**，正好命中 `#version 300 es`。本工具在其上做三件增值：

1. **能力检查**：扫描 WGSL 中的 `@compute`、storage texture、`f16`、原子操作等 **GLES 3.0 不支持** 的特性 → 报错或给出降级建议；
2. **产出规范化**：补齐/校验 `precision` 声明、核对 attribute location 与 uniform 绑定、避免动态下标访问 uniform 数组；
3. **报告**：人类可读摘要 + 机器可读 JSON（给 CI 与效果规格表用）。

### 计划用法

```bash
# 转换单个效果
wgsl2glsles effects/mesh-gradient/shader.wgsl -o effects/mesh-gradient/shader.glsl

# 批量 + 输出能力报告
wgsl2glsles --in effects/ --report build/capability-report.json
```

### 环境

- Node 22+（或 Rust 工具链用于本地构建 naga 后端）
- 依赖 `naga`（Rust，MIT/Apache-2.0）；若走 WASM，则使用 Node

### 状态

⬜ 骨架待实现（下一步：先用 naga CLI 手工跑通一条链路，再把流程脚本化）

---

## `capability-probe`（计划中）

目标机型/浏览器能力自检，用于决定"哪些效果可用、哪些要降级"：

- **Web 侧**：WebGL2 支持、扩展（`EXT_color_buffer_float`/`half_float`、`OES_texture_float_linear`）、`gl_VertexID`、FP16 渲染目标读写实测、帧率基准；
- **native 侧（GLES）**：`GL_VERSION` / `GL_RENDERER` / `GL_SHADING_LANGUAGE_VERSION`、扩展列表、`GL_MAX_TEXTURE_SIZE` / `GL_MAX_UNIFORM_BLOCK_SIZE` / `GL_MAX_TEXTURE_IMAGE_UNITS`、RGBA16F 离屏渲染并读回 1 像素。

输出一份可粘贴/可入库的 JSON，作为效果规格中"已验证机型"一栏的依据。
