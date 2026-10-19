# shaderport HarmonyOS 示例工程

> 这是 `shaderport` 的 HarmonyOS 宿主示例：一个 DevEco 工程，包含 `entry`（Demo App）与 `library`（`@quizzyjoy/shaderport` HAR）。

## 目录

```
harmony/
├── entry/                       Demo App（唯一包含 native .so 的模块）
│   └── src/main/
│       ├── ets/pages/Index.ets  XComponent + 效果选择 + 参数面板
│       └── cpp/                 EGL/GLES3 渲染器 + NAPI 桥
├── library/                     HAR：ArkTS API + rawfile 效果资产
│   ├── Index.ets
│   └── src/main/
│       ├── ets/                 api.ets / types.ets
│       └── resources/rawfile/effects/   48 个效果（spec + pass + reference）
├── AppScope/app.json5           bundleName / 版本 / 图标
└── build-profile.json5          ⚠️ 本地签名不要入库（见 docs/signing.md）
```

## 环境

| 组件 | 版本 |
|---|---|
| DevEco Studio | 26.0.0.821 |
| HarmonyOS SDK | API 26（platform 26.0.0） |
| compatibleSdkVersion | 5.0.0(12) |
| 设备类型 | phone + tablet |

## 构建与运行

```bash
cd harmony

# 构建 HAP（签名由 DevEco 的 Signing Configs 提供）
hvigorw assembleHap --mode module -p product=default -p module=entry@default

# 安装并启动
hdc -t <device> install -r entry/build/default/outputs/default/entry-default-signed.hap
hdc -t <device> shell aa force-stop com.quizzyjoy.shaderport.demo
hdc -t <device> shell aa start -a EntryAbility -b com.quizzyjoy.shaderport.demo
```

签名：DevEco → `File > Project Structure > Signing Configs` → 自动签名。  
**签名块会写进 `build-profile.json5`，不要提交**；本机用 `git update-index --skip-worktree harmony/build-profile.json5` 隐藏。

## Demo 功能

- **效果选择**：下拉列表（48 个效果）+ `‹` / `›` 逐个切换
- **信息行**：分类 · 用途层 · 成本档 · pass 数
- **参数面板**：由 `spec.props[].ui` 自动生成
  - `range` → Slider
  - `color` → hex 输入
  - `select` → 下拉
  - `position` → x/y 双 Slider
  - `boolean` → Switch
- **Reset**：恢复当前效果默认参数
- **Pause / Play**：冻结/恢复动画时间
- **Scale**：`1x / 0.75x / 0.5x`；低分辨率渲染整条效果链后线性上采样到屏幕（重背景效果的性能出口）
- **Capture**：把当前帧写成 `capture-<id>.rgba`（`uint32 w/h + RGBA`）到应用沙箱
- **FPS / CPU**：右上角显示 EMA 帧率与 CPU 提交时间

## 抓帧与像素对比

```bash
hdc -t <device> file recv \
  /data/app/el2/100/base/com.quizzyjoy.shaderport.demo/haps/entry/files/capture-plasma.rgba \
  /tmp/capture-plasma.rgba

node tools/render-reference/run.mjs --capture /tmp/capture-plasma.rgba
```

- `--only <id>`：单效果迭代
- `--strict`：强制严格阈值
- 参考图规格见 `docs/spec-format.md`；真机/模拟器差异见 `docs/device-matrix.md`

## 性能提示

- 背景层（`MeshGradient` / `FlowingGradient` / `Aurora`）建议 **1/2–1/4 分辨率**渲染后再上采样；`MeshGradient` 在 Mate 80 全分辨率仅约 12 fps（cost=`high`）。
- 轻量渐变/纯色可跑满 120 fps；`Plasma` / `PerlinNoise` / RTT 滤镜在 55–60 fps 档。
- native 侧纹理/RTT 在 `onAreaChange` 时会按新尺寸重建，折叠/旋转无需重启。

## 相关文档

- [效果规格格式](../docs/spec-format.md)
- [转换与验证指南](../docs/conversion-guide.md)
- [设备矩阵](../docs/device-matrix.md)
- [签名管理](../docs/signing.md)
