# shaderport HarmonyOS 示例工程

> 一个可运行的 HarmonyOS 宿主：`entry`（Demo App）+ `library`（`@quizzyjoy/shaderport` HAR）。
> 真机实测：Mate 80（VYG-AL30，HarmonyOS 7.0）。

| 主界面（参数面板展开） | 隐藏参数面板 |
|---|---|
| ![主界面](docs/screenshots/mate-main.jpg) | ![隐藏面板](docs/screenshots/mate-panel-hidden.jpg) |

| 隐藏性能信息 |
|---|
| ![隐藏性能](docs/screenshots/mate-perf-hidden.jpg) |

## 它能演示什么

- 从 HAR 读取 48 个效果的规格与 GLSL，交给 native 渲染
- 多 pass RTT（Blur / Glow / CursorRipples）
- spec 驱动的参数面板（range / color / select / position / boolean）
- 指针（touch / hover / mouse）→ `_sys.pointer`
- 尺寸变化（折叠/旋转）→ RTT 自动重建
- 性能：FPS / CPU 提交时间、1x/0.75x/0.5x 渲染档位
- 确定性抓帧 → 与参考图逐像素对比

## 环境

| 组件 | 版本 |
|---|---|
| DevEco Studio | 26.0.0.821 |
| HarmonyOS SDK | API 26（platform 26.0.0） |
| compatibleSdkVersion | 5.0.0(12) |
| 设备类型 | phone + tablet |

## 目录结构

```
harmony/
├── entry/                        Demo App（唯一包含 native .so 的模块）
│   └── src/main/
│       ├── ets/pages/Index.ets   XComponent + 工具栏 + 参数面板
│       └── cpp/
│           ├── renderer.cpp      EGL/GLES3、UBO 反射、RTT、Scale、指针
│           └── napi_init.cpp     ArkTS ↔ native 桥
├── library/                      HAR：ArkTS API + rawfile 效果资产
│   ├── Index.ets
│   └── src/main/
│       ├── ets/                  api.ets / types.ets
│       └── resources/rawfile/effects/   48 个效果
├── docs/screenshots/             真机截图
├── AppScope/app.json5            bundleName / 版本 / 图标
└── build-profile.json5           ⚠️ 本地签名不要入库（docs/signing.md）
```

## 构建与运行

### 方式 A：DevEco Studio

1. 打开 `harmony/` 工程
2. `File > Project Structure > Signing Configs` → 勾选自动签名（需登录华为账号）
3. 选择设备 → Run `entry`

### 方式 B：命令行

```bash
cd harmony

# 构建（签名配置就绪时会产出 entry-default-signed.hap）
hvigorw assembleHap --mode module -p product=default -p module=entry@default

# 安装并启动
hdc -t <device> install -r entry/build/default/outputs/default/entry-default-signed.hap
hdc -t <device> shell aa force-stop com.quizzyjoy.shaderport.demo
hdc -t <device> shell aa start -a EntryAbility -b com.quizzyjoy.shaderport.demo
```

> 未签名 HAP 只能装模拟器；真机需要 DevEco 自动签名。
> 签名块会写进 `build-profile.json5`，**不要提交**；本机可用
> `git update-index --skip-worktree harmony/build-profile.json5` 隐藏。

## Demo 使用教程

### 顶部

```
Plasma · 13 params                    60.2 fps · 1.65 ms
Textures · main · medium · 1p
```

- 左：当前效果 + 参数数量
- 右：FPS 与 CPU 提交时间（由 `Perf` 控制显隐）
- 第二行：分类 · 用途层 · 成本档 · pass 数

### 工具栏（始终可见）

| 控件 | 作用 |
|---|---|
| **效果下拉** | 48 个效果，选中即切换 |
| **Scale** | `1x → 0.75x → 0.5x → 1x`；整条效果链低分辨率渲染后线性上采样 |
| **Perf** | 显示/隐藏 FPS + CPU 时间（激活为紫色） |
| **Panel** | 显示/隐藏下方参数面板 |

### 参数面板

由 `spec.props[].ui` 自动生成：

- `range` → Slider（带数值）
- `color` → hex 输入
- `select` → 下拉
- `position` → x / y 双 Slider
- `boolean` → Switch

底部：`Reset`（恢复默认）、`Pause/Play`（冻结/恢复时间）、`Capture`（抓帧）。

### 指针

在画布上触摸/拖动（或鼠标悬停）会更新 `_sys.pointer`；`CursorRipples` 会随之产生涟漪。

## 抓帧与像素对比

```bash
# 1) 在 demo 里点 Capture
# 2) 拉取沙箱里的原始帧（真实路径以 shell 可读的 /data/app/... 为准）
hdc -t <device> file recv \
  /data/app/el2/100/base/com.quizzyjoy.shaderport.demo/haps/entry/files/capture-plasma.rgba \
  /tmp/capture-plasma.rgba

# 3) 与参考渲染器逐像素比较
node tools/render-reference/run.mjs --capture /tmp/capture-plasma.rgba
```

- `--strict`：强制严格阈值
- `--only <id>`：只处理单效果
- `--time <t>`：覆盖参考时间

阈值默认 `meanAbs ≤ 1`、`over8 ≤ 1%`、band ≤ 2；高频噪声（PerlinNoise）在 spec 中放宽。

## 性能与 Scale

模拟器（Plasma）：

| Scale | FPS |
|---|---|
| 1x | 34.1 |
| 0.75x | 37.4 |
| 0.5x | 41.1 |

真机（Mate 80）：

| 效果 | FPS | cost |
|---|---|---|
| SolidColor / 轻渐变 | 120 | very-low |
| Plasma / PerlinNoise / Aurora | ~60 | medium |
| Blur / Glow（2 pass） | 56–58 | medium |
| FlowingGradient | 54 | medium |
| MeshGradient | **11.8** | **high** |

> 背景层（MeshGradient / FlowingGradient / Aurora）建议用 `Scale` 降到 0.5–0.75 或半分辨率 RTT。

## 排障

| 现象 | 处理 |
|---|---|
| `EGL init failed` | 检查 XComponent 是否 `SURFACE`、`nativeInit` 是否在 `onLoad` 后调用 |
| 黑屏但状态正常 | 看 hilog `ShaderPort`：编译/链接/UBO 是否报错；确认 `nativeSetEffect` 已收到 pass |
| 真机安装失败 `no signature file` | 在 DevEco 配置自动签名 |
| `hdc` 找不到真机 | 打开无线调试或换 USB；`hdc list targets` 确认 target |
| 切换效果后参数面板为空 | `getParamDescriptors` 依赖 spec 的 `props`，确认 rawfile 已更新 |
| 画面被裁切/拉伸 | 确认 `onAreaChange` 的 resize 已到 native；Scale 档位下不要改 viewport |

## 相关文档

- [包的 README（API / 渲染契约）](../README.md)
- [效果规格格式](../docs/spec-format.md)
- [转换与验证指南](../docs/conversion-guide.md)
- [设备矩阵](../docs/device-matrix.md)
- [签名管理](../docs/signing.md)
