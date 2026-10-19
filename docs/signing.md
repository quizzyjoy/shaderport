# 签名与凭据管理

> 原则：**签名材料、密码、绝对路径一律不入库**。仓库里的 `harmony/build-profile.json5` 只保留 `signingConfigs: []`。

## 1. 本地签名怎么配

1. DevEco Studio → `File > Project Structure > Signing Configs`
2. 勾选 **Automatically generate signature**（需登录华为账号）
3. IDE 会把签名块写进 `harmony/build-profile.json5`

此时 `git status` 会显示该文件被修改。**不要提交。**

## 2. 防止误提交（推荐）

在本机执行一次：

```bash
git update-index --skip-worktree harmony/build-profile.json5
```

之后：

- 本地的签名改动不会被 `git add` / `git commit` 带上
- `git status` 保持干净
- `git ls-files -v harmony/build-profile.json5` 显示前缀 `S`

需要**有意**修改（例如升级 SDK 版本）时：

```bash
git update-index --no-skip-worktree harmony/build-profile.json5
# 编辑 -> 只提交非签名部分
git add harmony/build-profile.json5
git commit -m "build: ..."
git update-index --skip-worktree harmony/build-profile.json5
```

> `skip-worktree` 是**本机行为**，不会同步给别人。新克隆的仓库默认是 `signingConfigs: []`，由各自在本机配置签名。

## 3. 已加入 `.gitignore` 的项

```
*.p12  *.p7b  *.cer  *.csr  *.pem  *.key
*.mobileprovision  *_rsa  id_rsa*  ohpmkey*
harmony/build-profile.signing.local.json5
harmony/signing.local.json5
```

如果团队需要共享"签名配置模板"，只共享**字段结构**（不含路径/密码），例如：

```json5
{
  "app": {
    "signingConfigs": [
      {
        "name": "default",
        "type": "HarmonyOS",
        "material": {
          "certpath": "<ABS_PATH_TO_CER>",
          "storeFile": "<ABS_PATH_TO_P12>",
          "profile": "<ABS_PATH_TO_P7B>",
          "keyAlias": "debugKey",
          "signAlg": "SHA256withECDSA",
          "keyPassword": "<LOCAL_ONLY>",
          "storePassword": "<LOCAL_ONLY>"
        }
      }
    ]
  }
}
```

## 4. 如果签名材料曾被提交

1. **立即轮换**密钥/证书（重新生成签名材料）
2. 用 `git filter-repo` 从历史中移除（不要只用 `git rm`，历史仍可见）
3. 强推并通知协作者重新克隆
4. 检查 CI/发布凭据是否也需要轮换

## 5. CI 与发布

- GitHub 托管 runner **不构建** HAP/HAR（没有 HarmonyOS SDK，也没有签名材料）
- 真机/签名构建走**自托管 runner** 或本地发布清单；签名材料只放在该机器的 `~/.ohos/config` 下
- 公开仓只保留 `signingConfigs: []` 与本文档
