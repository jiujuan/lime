# Agent App v2 发布执行手册

更新时间：2026-05-19

## 目的

本手册用于把 AgentAPP standalone 从“工程门禁已完成”推进到“真实发布可执行”。它不保存任何 secret value，只列出发布环境必须具备的 GitHub Secrets / Vars、手动 workflow 输入、真实执行顺序和最终 evidence 要求。

适用范围：

- Content Factory standalone 首个产品化发布。
- 后续 Lime 官方 AgentAPP standalone `.app / .pkg / .dmg / Windows installer` 发布。
- 不适用于第三方 Team 自行签名分发；第三方发布必须使用第三方 Apple Developer Team / Windows signing identity，并重新审查 App Group / Keychain group。

## 当前阻断

当前本机 release preflight 已验证为 `blocked`：

```bash
node scripts/agent-app-standalone-release-secret-preflight.mjs \
  --platform all \
  --package-format pkg \
  --channel stable \
  --remote-upload \
  --check
```

当前缺少 13 项发布 secret / ref：

| 名称 | 用途 | 来源 |
| --- | --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` 或 `TAURI_SIGNING_PRIVATE_KEY_RAW` | Tauri updater artifact 签名私钥。 | `npx tauri signer generate --write-keys` 生成后存入 GitHub Secrets。 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 解锁 Tauri updater 私钥。 | 生成 updater key 时设置。 |
| `LIME_AGENT_APP_PREVIOUS_RELEASE_REF` | stable channel rollback 需要上一版 release / manifest ref。 | 上一版已验证发布产物或 rollback manifest。 |
| `LIME_AGENT_APP_RELEASE_UPLOAD_TOKEN` | 远端 updater / artifact upload 授权。 | R2 / GitHub Release / 发布后端的最小权限 token。 |
| `APPLE_CERTIFICATE` | Developer ID 证书 `.p12` 的 base64 内容。 | Apple Developer 账号导出证书和私钥后 base64。 |
| `APPLE_CERTIFICATE_PASSWORD` | 解锁 `.p12`。 | 导出 `.p12` 时设置。 |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application` identity 名称。 | macOS keychain 中的 codesign identity。 |
| `APPLE_ID` | notarytool 认证 Apple ID。 | Apple Developer Team 成员账号。 |
| `APPLE_PASSWORD` | Apple app-specific password 或等价 notary 凭证。 | Apple ID 安全设置生成。 |
| `APPLE_TEAM_ID` | Apple Developer Team ID。 | Apple Developer Membership。 |
| `APPLE_INSTALLER_SIGNING_IDENTITY` | `.pkg` 的 `Developer ID Installer` identity。 | Apple Developer 证书。 |
| `WINDOWS_SIGNING_CERTIFICATE` | Windows installer signing certificate。 | 代码签名证书或 CI 可用证书引用。 |
| `WINDOWS_SIGNING_CERTIFICATE_PASSWORD` | Windows signing certificate password。 | 证书导出或密钥服务配置。 |

## GitHub 远程环境只读复核

2026-05-19 使用 `gh secret list --repo "limecloud/lime"`、`gh variable list --repo "limecloud/lime"` 和 `git ls-tree -r --name-only "origin/main" ".github/workflows"` 做了只读复核。该复核只读取 secret / variable 名称，不读取 secret value。

远程 `limecloud/lime` 当前已有 8/13 个必需名称：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

仍缺 5 个发布必需名称：

- `LIME_AGENT_APP_PREVIOUS_RELEASE_REF`
- `LIME_AGENT_APP_RELEASE_UPLOAD_TOKEN`
- `APPLE_INSTALLER_SIGNING_IDENTITY` 或别名 `APPLE_SIGNING_IDENTITY_INSTALLER`
- `WINDOWS_SIGNING_CERTIFICATE`
- `WINDOWS_SIGNING_CERTIFICATE_PASSWORD`

补充：同日尝试读取 org-level Actions secrets / variables，`gh secret list --org "limecloud" --app actions` 与 `gh variable list --org "limecloud"` 均返回 `HTTP 403`，当前 token 不是 org admin 且没有 actions secrets / variables 细粒度读取权限。因此本节只能证明 repo-level 可见配置；如果缺失项实际配置在 org-level selected repos，需要 org admin 复核或用远程 workflow evidence 证明注入成功，不能把未知 org-level 配置当作 ready。

同日使用 `gh api "repos/limecloud/lime/environments"` 复核 GitHub Environments，当前仅存在 `github-pages`，未发现 standalone release 专用 environment；本 workflow 也未声明 `environment`，因此不会自动读取 environment-level secrets。

当前 `origin/main` 尚未包含 `.github/workflows/agent-app-standalone-release-gate.yml`，因此即使补齐 secret，也需要先把该 workflow 进入主干后才能在 GitHub Actions 手动触发 `Agent App Standalone Release Gate`。在用户明确确认前，本地不执行 `git commit` / `git push`。

说明：

- 独立 AgentAPP 必须使用独立 Bundle ID / App ID。
- Lime 官方发布可以复用同一 Team 的 `Developer ID Application` 证书签多个独立 App。
- `.pkg` 需要 `Developer ID Installer`；这不是每个 App 一张，而是 Team 级 installer identity。

## GitHub Actions 门禁

手动 workflow：

```text
Agent App Standalone Release Gate
```

文件：

```text
.github/workflows/agent-app-standalone-release-gate.yml
```

推荐输入：

| 输入 | 推荐值 | 说明 |
| --- | --- | --- |
| `platform` | `all` | 同时检查 macOS 与 Windows 发布 secret。 |
| `package_format` | `pkg` | Content Factory 首发如果走 pkg，则必须检查 Installer identity。 |
| `channel` | `stable` | stable 必须有 rollback ref。 |
| `remote_upload` | `true` | 发布必须具备远端上传 token。 |
| `updater_enabled` | `true` | 发布必须生成 signed updater artifacts。 |
| `release_evidence_path` | 真实 release evidence JSON 路径 | 可选；提供后会运行 final release evidence checker。 |
| `artifact_root` | 真实产物根目录 | 可选；提供后会验证 artifact path、存在性和 `.pkg/.dmg/.exe` sha256。 |

workflow 只执行门禁，不执行真实 build / signing / notarization / installer verify / upload。

## 真实发布顺序

1. **写入 standalone Tauri config / env**
   - `scripts/agent-app-standalone-tauri-config-writer.mjs`
   - 输出 writer evidence。
2. **执行 Tauri build**
   - `scripts/agent-app-standalone-tauri-build-runner.mjs --execute`
   - 输出 build evidence 和 artifact refs。
3. **macOS 签名 / 公证**
   - `scripts/agent-app-standalone-macos-release-commands.mjs --execute`
   - 输出 application signing、installer signing、notarytool、stapler evidence。
4. **安装器验证**
   - `scripts/agent-app-standalone-installer-verify.mjs --execute`
   - macOS 验证 `codesign / spctl / pkgutil 或 hdiutil / stapler validate`。
   - Windows 验证 `signtool verify /pa /v`。
5. **发布 updater manifest / rollback manifest**
   - `scripts/agent-app-standalone-updater-publisher.mjs --write`
   - 上传到远端后必须记录 remote upload evidence，并绑定目标 distributable artifact ref。
6. **最终 evidence check**
   - `scripts/agent-app-standalone-release-evidence-check.mjs --check`
   - 只有 `readyToRelease=true` 才能宣布 standalone release-ready。

## Final Release Evidence 最小结构

最终 evidence JSON 必须只包含引用、hash、状态和非敏感日志路径，不得包含证书、token、password 或私钥。

```json
{
  "appId": "content-factory-app",
  "version": "0.8.0",
  "channel": "stable",
  "platform": "macos",
  "packageFormat": "pkg",
  "secretPreflightEvidence": { "status": "ready" },
  "buildEvidence": {
    "status": "completed",
    "artifactRefs": [
      {
        "kind": "app_bundle",
        "path": "dist/Content Factory.app",
        "contentHash": "sha256:<app-or-bundle-hash>",
        "signed": true
      },
      {
        "kind": "pkg",
        "path": "dist/Content Factory.pkg",
        "contentHash": "sha256:<64-hex-file-hash>",
        "signed": true,
        "notarized": true,
        "stapled": true
      }
    ]
  },
  "signingEvidence": {
    "applicationSignedArtifactRefs": ["sha256:<app-or-bundle-hash>"],
    "installerSignedArtifactRefs": ["sha256:<64-hex-file-hash>"],
    "evidenceRef": ".lime/releases/content-factory/signing.json"
  },
  "notarizationEvidence": {
    "acceptedArtifactRefs": ["sha256:<64-hex-file-hash>"],
    "stapledArtifactRefs": ["sha256:<64-hex-file-hash>"],
    "logRef": ".lime/releases/content-factory/notarization.json"
  },
  "installerVerificationEvidence": {
    "status": "completed",
    "commandsRun": [
      { "id": "codesign-verify-app", "exitCode": 0 },
      { "id": "spctl-assess-app", "exitCode": 0 },
      { "id": "pkgutil-check-signature", "exitCode": 0 },
      { "id": "stapler-validate", "exitCode": 0 }
    ]
  },
  "updaterPublishEvidence": {
    "status": "uploaded",
    "manifestRef": "r2://lime-agent-apps/content-factory/stable/latest.json",
    "artifactRefs": ["sha256:<64-hex-file-hash>"]
  },
  "rollbackEvidence": {
    "manifestRef": "r2://lime-agent-apps/content-factory/stable/rollback.json",
    "previousArtifactRef": "sha256:<previous-release-hash>"
  }
}
```

## 最终验收命令

```bash
node scripts/agent-app-standalone-release-evidence-check.mjs \
  --evidence .lime/releases/content-factory/final-release-evidence.json \
  --artifact-root .lime/releases/content-factory/artifacts \
  --output .lime/releases/content-factory/final-release-audit.json \
  --check
```

验收条件：

- `status=ready`
- `readyToRelease=true`
- `blockers=[]`

只要仍为 `blocked`，不得宣布 AgentAPP standalone 发布完成。
