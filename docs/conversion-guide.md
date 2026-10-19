# 转换与验证指南

> 从上游 `shader-effects-inc/shaders`（`v4.0.4`，MIT）生成 GLSL ES 3.00 效果包，并在设备上做像素级验证。

## 1. 前置条件

| 组件 | 版本/位置 |
|---|---|
| Node.js | ≥ 24.12（本机 24.14.1） |
| pnpm | `corepack pnpm`（12.x） |
| Chrome / Edge | 用于 WebGL2 参考渲染与编译门禁 |
| DevEco Studio | 26.0.0.821（hvigor 6.26.4 / ohpm 26.0.0.630） |
| 上游仓库 | 默认 `../shaders`（可用 `SHADERS_DIR` 覆盖），tag `v4.0.4` |

首次安装工具依赖：

```bash
cd tools/wgsl2glsles && npm ci
cd ../glsl-gate && npm ci
cd ../render-reference && npm ci
cd ../..
node tools/export-wgsl/run.mjs   # 首次会自动 pnpm install 上游依赖
```

## 2. 完整流水线

```bash
# 1) 导出全量 WGSL（200 → 193）+ 最终 uniform 值
node tools/export-wgsl/run.mjs

# 2) WGSL → GLSL ES 3.00（239 pass → 234）
node tools/wgsl2glsles/run.mjs

# 3) 真实编译器门禁（234/234 编译+链接）
node tools/glsl-gate/run.mjs

# 4) 只把 effects.config.json 里列出的效果落盘，并镜像到 HAR rawfile
node tools/sync-effects/run.mjs

# 5) 生成参考图（单 pass + 多 pass RTT）
node tools/render-reference/run.mjs
```

产物：

```
build/wgsl/       WGSL + manifest.json（含 resolved / passes / failures）
build/glsl/       GLSL + report.json（naga 反射）+ gate.json（编译门禁）
effects/          落地效果包（spec / passes / reference）
harmony/library/src/main/resources/rawfile/effects/   镜像 + index.json
```

> `build/` 不入库；`effects/` 与 rawfile 镜像入库。

## 3. 新增一个效果

1. 在 `tools/sync-effects/effects.config.json` 追加：

   ```json
   { "name": "Plasma", "id": "plasma", "layer": "main", "cost": "medium" }
   ```

   高频噪声可加 `"validation": { "pixelDiff": { "meanAbs": 8, "over8Ratio": 0.15, "bandMean": 8 } }`。

2. 重新跑 `sync-effects` + `render-reference`。
3. 构建并安装 HAP：

   ```bash
   cd harmony
   hvigorw assembleHap --mode module -p product=default -p module=entry@default
   hdc -t <device> install -r entry/build/default/outputs/default/entry-default-unsigned.hap
   ```

4. 在 demo 里手动切到该效果，点 `Capture` 抓帧。
5. 拉取抓帧并对比：

   ```bash
   hdc -t <device> file recv \
     /data/app/el2/100/base/com.quizzyjoy.shaderport.demo/haps/entry/files/capture-<id>.rgba \
     /tmp/capture-<id>.rgba

   node tools/render-reference/run.mjs --capture /tmp/capture-<id>.rgba
   ```

   - `--only <id>`：只处理单个效果（参考图渲染）
   - `--strict`：强制严格阈值（忽略 spec 中的放宽）
   - `--time <t>`：覆盖参考时间

## 4. 设备侧注意事项

- **未签名 HAP 只能装模拟器**；真机需要 DevEco 自动签名（否则 `9568320 no signature file`）。
- 沙箱文件的实际路径是
  `/data/app/el2/100/base/com.quizzyjoy.shaderport.demo/haps/entry/files/`
  （不是 `/data/storage/el2/...` 虚拟路径）。
- 长时间批量验证前执行：

  ```bash
  hdc shell power-shell wakeup
  hdc shell power-shell setmode 602
  ```

  否则 >30 个效果的轮播会被熄屏打断。
- 折叠屏尺寸变化（`devecocli emulator fold close/open`）会触发 `resize`，RTT 自动重建，可用来验证多 pass。

## 5. 已知限制

| 限制 | 说明 |
|---|---|
| `meshAnchors` 依赖 aspect | 导出时按 1:1 烘焙；任意 aspect 下跨端一致，但与上游"每帧按实际 aspect 重算"略有偏移 |
| 每帧 CPU 字段 | 目前只覆盖 `scatteredAnchors` / 预转换色；其他 host 模拟（Smoke、ReactionDiffusion、Boids）仍需跨帧状态支持 |
| 有状态交互 | `CursorRipples` 指针激活时是历史相关模拟，只做定性验证 |
| 排除效果 | 7 个媒体/数据纹理 + 6 个坏 WGSL + 2 个 external texture（见路线图 §7） |
| 噪声驱动差异 | `PerlinNoise` 的 hash 对 GPU 驱动敏感，使用放宽阈值 |
