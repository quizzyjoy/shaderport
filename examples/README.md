# 示例（examples）

计划收录的集成示例，每个示例一个目录，自带 README 说明"怎么跑、验证什么"。

| 示例 | 目标 | 验证内容 |
|---|---|---|
| `gles-cpp/` | 原生 C++/OpenGL ES 3.0（XComponent + EGL 或桌面 GLES 模拟） | 全屏三角形 + 单 pass 效果；uniform 绑定；成本档实测 |
| `webgl2-web/` | 浏览器 WebGL2（无 WebGPU） | 与 native 侧同参数、同观感的对照；DPR 与帧率策略 |
| `capability-probe/` | 能力自检 | 输出机型能力 JSON（见 `../tools/README.md`） |

约定：

- 示例只依赖系统能力与必要的最小工具链，**不引入渲染引擎**；
- 每个示例需注明**验证过的设备/GPU**与实测帧率；
- 示例中的图片/字体等素材须为自有或可再分发。
