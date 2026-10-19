# shaderport 1.0 路线图

> 状态：v1 · 2026-10-19 · 决策已冻结（§6），变更需走 PR。

## 1. 目标

把 `shader-effects-inc/shaders`（MIT，`v4.0.4`）的效果资产转成 **GLSL ES 3.00**，以"源码 + 规格 + 参考图"三件套交付，并配套离线转换工具与 native 集成示例。

**1.0 = 可被真实产品使用的最小完整集**，不是 200 个效果的全量搬运。

## 2. 非目标

- 不做渲染引擎、场景图、UI 框架
- 不做 WebGPU 运行时兼容层
- 不做端侧（设备上）实时 WGSL 转换
- 不支持 compute / storage texture / `texture_external` / `f16`

## 3. 1.0 交付范围

| 维度 | 目标 |
|---|---|
| 效果 | **48 个**：24 生成器 + 12 滤镜/扭曲 + 6 形状 + 6 材质（Shape Effects） |
| 工具 | `export-wgsl` / `wgsl2glsles` / `glsl-gate` / `sync-effects` / `capability-probe` |
| ArkTS API | `init` / `listEffects` / `getEffect` / `getShaderSource` / `validateParams` |
| 示例 | `harmony/entry`：效果画廊 + spec 驱动参数面板 + 能力探测 + 参考图对比 |
| 平台 | phone + tablet，arm64-v8a，GLES 3.0 |
| 发布 | ohpm `@quizzyjoy/shaderport@1.0.0`；`examples/gles-cpp` 由 `harmony/entry` 生成 |

## 4. 里程碑

> 假设 1 人、每周 15–20 小时。

| 阶段 | 版本 | 周期 | 交付物 | 退出条件 |
|---|---|---|---|---|
| M0 工具链 | — | 第 1 周 | `export-wgsl` + `wgsl2glsles` + `glsl-gate` | 一条命令产出可复现的 WGSL/GLSL 与报告 |
| M1 最小闭环 | 0.1.0 | 第 1–3 周 | 6 个生成器 + demo 渲染 + HAR 装资产 | 真机 1080p ≥30fps；`ohpm prepublish` 无 ERROR |
| M2 合成链路 | 0.2.0 | 第 3–6 周 | 累计 12 个（含 warp/filter）+ RTT + capability-probe | 多 pass 跑通；浮点 FBO 缺失可降级并提示 |
| M3 画廊化 | 0.5.0-beta | 第 6–10 周 | 累计 30 个 + 画廊 + 参考图 diff CI | 列表点到渲染 ≤3 次交互；CI 全绿 |
| M4 1.0 | 1.0.0 | 第 10–14 周 | 累计 48 个 + 设备矩阵 + 文档 + 发布 | 下方 DoD 全满足 |

## 5. 首批效果（12 个，三波）

| 波次 | 效果 | role | 目的 |
|---|---|---|---|
| 1 | `SolidColor` | generator | 最裸基线（uniform → 输出） |
| 1 | `LinearGradient` | generator | 颜色插值 / 颜色空间 |
| 1 | `RadialGradient` | generator | UV 中心与 aspect |
| 1 | `Plasma` | generator | 时间驱动 + 多正弦；主视效可用 |
| 2 | `Marble` | generator | 噪声扭曲 + 三色，背景层 |
| 2 | `PerlinNoise` | generator | 噪声基座（后续效果依赖） |
| 2 | `SimplexNoise` | generator | 第二种噪声基座 |
| 2 | `BlockNoise` | generator | 块状噪声（低填充率档） |
| 3 | `Circle` | generator | SDF 形状 |
| 3 | `Ripples` | generator | 同心波纹，节拍映射载体 |
| 3 | `Twirl` | warp | 首个消费输入的效果（UV 折叠，单 pass） |
| 3 | `Blur` | filter | 可分离高斯，两趟 RTT ping-pong |

备选：`Vignette`、`Glow`。

**延后（需要先补基础设施，不计入首批）**

| 效果 | 阻塞点 |
|---|---|
| `MeshGradient` | 色标数组（`colorsArray`/`positionsArray`/`convertedColorsArray`/`stopCount`）已能通过 `spec.resolved` 正确导出；仍缺 `meshAnchors` —— 它由 `scatteredAnchors` **每帧在 CPU 上生成**（依赖 time/drift），静态构建里是全 0，渲出均匀灰 |
| `FlowingGradient` | `convA..convD` 同样是 renderer 每帧写入的预转换色，静态为 0 |
| `Aurora` | 透明效果的 alpha 语义未对齐：参考渲染器与设备帧的 RGB 差异呈 alpha 依赖（设备 alpha 约 2×），需先确认 EGL 窗口表面的 alpha/预乘约定 |

→ 前两个需要把"每帧 CPU 生成 extraFields"的逻辑也纳入导出（`scatteredAnchors` / 预转换色），与 `Vignette`/`Glow` 一起放到下一批。

> 已落地：`spec.resolved` 现在由 `tools/export-wgsl` 从上游 uniform store 导出**最终值**（颜色在 P3-linear 工作空间、位置已完成 Y 翻转、枚举已编码、色标数组已打包）。native/JS 打包器优先使用 resolved，数组按 `GL_UNIFORM_ARRAY_STRIDE` 写入。

## 6. 决策记录

| # | 决策 |
|---|---|
| 1 | 1.0 效果总数定为 **48** |
| 2 | `examples/gles-cpp` 由 `harmony/entry` 生成，不维护第二份宿主 |
| 3 | 示例接入**窗口缩放与鼠标输入**；`deviceTypes` 仍为 `phone` + `tablet`，不新增设备类型 |

## 7. 排除清单（12 个，已实测）

| 原因 | 效果 |
|---|---|
| WGSL 解析失败 | `Satin`、`Strands`、`FlowField` |
| 依赖媒体/数据纹理（导出期失败） | `Ascii`、`ChromaFlow`、`FilmStock`、`HTMLInCanvas`、`ImageTexture`、`PixelThrow`、`Text` |
| `texture_external` 无 GLES 对应 | `VideoTexture`、`WebcamTexture` |

可移植基数 **188** 个：`200` 注册 → `193` 导出 → `188` 转换成功 → `234/234` pass 编译+链接通过。

> 与 `docs/03` 的差异：`Goo`、`Irradiance`、`SmokeFill` 在**组合导出**（filter/warp 挂在 Plasma 上）下能正常解析并通过编译门禁，文档里"WGSL 非法"的结论来自单效果导出。它们暂不进首批，先做观感验证再决定是否收录。

## 8. 单个效果的 DoD

1. `effects/<id>/{spec.json, shader.glsl, reference.png}` 齐全
2. `spec.json` 含 `provenance`（`original` / `ported` / `inspired`）与上游 `repo@version` + 路径
3. `shader.glsl` 头部保留 MIT 版权声明；`THIRD_PARTY_NOTICES.md` 同步
4. `glsl-gate` 编译 + 链接通过
5. 真机渲染通过，记录 fps 与分辨率
6. 参考图 diff 在 `spec.validation.pixelDiff` 阈值内
   - 默认严格：`meanAbs ≤ 1`、`over8 ≤ 1%`、10 段亮度均值差 ≤ 2
   - 驱动敏感的高频噪声（当前仅 `PerlinNoise`）可在 spec 中放宽（`meanAbs ≤ 8`、`over8 ≤ 15%`、band ≤ 8）
   - CI 可用 `--strict` 强制全部走严格阈值
7. 进入 `rawfile/effects/index.json` 与 README 效果表

## 9. 风险

| 风险 | 处理 |
|---|---|
| GLES 3.0 无 guarantee 的浮点渲染目标 | capability-probe 检查 `EXT_color_buffer_float`；缺失时降级到 8-bit 或半分辨率 |
| 观感偏差（Y 翻转 / sRGB 二次编码 / premultiply alpha / highp 退化） | 参考图 diff 作为门禁；四个已知点写成 checklist |
| `Blur` 等 filter 在 map driver 下走 compute | spec 只暴露标量/颜色参数，不暴露 map driver |
| Shape Effects ALU 重（中位 369 行，最大 823） | 半分辨率 RTT + 降 octave；1.0 只取 6 个并全部实测帧率 |
| GitHub Actions 无法跑 hvigor | JS 侧门禁（naga + ANGLE）跑在 GitHub runner；hvigor 构建走自托管或人工发布清单 |
