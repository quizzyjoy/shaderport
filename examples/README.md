# 示例（examples）

> **当前可运行的完整示例**：[`harmony/`](../harmony) —— `entry` demo App（ArkTS + native GLES 3.0 渲染器）+ `library` HAR，
> 覆盖 48 个效果、spec 驱动参数面板、Scale 档位与真机截图。
> 使用教程见 [`docs/usage-guide.md`](../docs/usage-guide.md)。

下面这些是**计划中**的独立最小示例（每个只演示一件事），目录尚未创建：

| 示例 | 目标 | 验证内容 |
|---|---|---|
| `gles-cpp/`（1.x，由 `harmony/entry` 导出） | 原生 C++/OpenGL ES 3.0（XComponent + EGL 或桌面 GLES 模拟） | 全屏三角形 + 单 pass 效果；uniform 绑定；成本档实测 |
| `webgl2-web/` | 浏览器 WebGL2（无 WebGPU） | 与 native 侧同参数、同观感的对照；DPR 与帧率策略 |
| `capability-probe/`（1.x） | 能力自检 | 输出机型能力 JSON（见 `../tools/README.md`） |

约定：

- 示例只依赖系统能力与必要的最小工具链，**不引入渲染引擎**；
- 每个示例需注明**验证过的设备/GPU**与实测帧率；
- 示例中的图片/字体等素材须为自有或可再分发。
