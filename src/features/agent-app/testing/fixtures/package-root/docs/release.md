# 内容工厂 App 发布说明

内容工厂通过 Lime 应用中心发布，不提供旧 Tauri 包、iframe-only runtime 或独立旧桌面入口。

## 发布前检查

```bash
npm run validate:app
```

生成远程上架签名证明：

```bash
AGENT_APP_SIGNING_PRIVATE_KEY_PEM="$PRIVATE_KEY_PEM" npm run release:sign -- \
  --package-url https://updates.limeai.run/agent-apps/content-factory-app-2.2.2.lapp \
  --package-hash sha256:<package-sha256> \
  --manifest-hash sha256:<manifest-sha256> \
  --release-id agent-app-release-xxxx \
  --signature-ref sigstore:content-factory-app@2.2.2 \
  --public-key-id agent-app-root-2026 \
  --out app.signature.yaml \
  --trust-root-out agent-app-signature-trust-root.json
```

`app.signature.yaml` 可以随发布包进入 LimeCore 上传 / release 创建流程，LimeCore 会从 `signature.package` 派生 `signatureProof`；`agent-app-signature-trust-root.json` 只用于配置 LimeCore / OEM runtime 的 `agentAppSignatureTrustRoots`，不能放进 remote catalog 让 App 自签通过。生产私钥只能通过环境变量或本地密钥文件传入，不得提交到仓库。

发布包必须包含：

- `plugin.json`
- `app.workbench.yaml`
- `app.runtime.yaml`
- `app.operations.yaml`
- `app.requirements.yaml`
- `app.boundary.yaml`
- `app.install.yaml`
- `src/runtime/content-factory-worker.mjs`
- `artifacts/content-factory-workspace-patch.schema.json`
- `examples/workspace-patch.sample.json`
- `examples/runtime-request.sample.json`
- `locales/*.json`
- `resources/icons/icon.svg`

## 上架口径

- `distribution.primaryInstallSurface` 必须是 `lime-app-center`。
- `profiles` 必须包含 `workbench`。
- `agentRuntime.bridge.kind` 必须是 `app-server-json-rpc`。
- `workbench.historyRestore.fallback` 必须保留 `artifactPreview`。
- `runtimePackage.worker.entrypoint` 必须指向 `src/runtime/content-factory-worker.mjs`。
- `runtimePackage.worker.sampleRequest` 与 `agentRuntime.tasks[]` 必须能被 Lime 宿主投影为 task runtime readiness。
- 发布到 remote catalog 时必须提供 package hash、manifest hash、`signatureRef` 和 `signatureProof`；catalog 只提供 proof，不能自带可信公钥。`signatureProof.publicKeyId` 必须命中 Lime 宿主运行时配置或 bootstrap 快照中的 `agentAppSignatureTrustRoots`，且签名 payload 必须绑定 `appId / version / packageUrl / packageHash / manifestHash / releaseId / signatureRef / signatureProof.publicKeyId / signatureProof.algorithm / signatureProof.signedAt`，安装审查生成 `releaseEvidence.signatureVerificationStatus=verified` 后才允许确认安装。
- `signatureProof.signedAt` 必须是 ISO 8601 时间；当宿主可信根声明 `notBefore / notAfter` 时，`signedAt` 必须落在有效期内。可信根声明 `revoked=true` 或 `revokedAt` 后，宿主必须拒绝该根，发布方需要切换到新的 `publicKeyId` 重新签名。
- Lime 宿主可信根只允许来自 `window.__LIME_OEM_CLOUD__.agentAppSignatureTrustRoots`、`window.__LIME_BOOTSTRAP__.agentAppSignatureTrustRoots` 或 `window.__LIME_BOOTSTRAP__.agentApps.signatureTrustRoots`。可信根字段支持 `publicKeyId / algorithm / publicKey / appIds / notBefore / notAfter / revoked / revokedAt`；日期字段格式错误时应按无可信根处理。
- `releaseEvidence.status=blocked` 会进入 Lime 应用中心 source state 发布策略，安装审查不可确认；`warning` 允许继续审查但必须显示为需要复核。
- Lime 应用中心会把 package hash、manifest hash、签名验证和包校验聚合成发布审计摘要；发布方应把阻断 / 复核项当作 release 修复入口，不要绕过应用中心直接写 installed state。
- 安装审查中的发布审计摘要可以复制为 Markdown 报告；发布方应把该报告作为上架排障和发布留证材料的一部分。
- 发布说明只声明能力和合同，不承诺旧代码兼容。
