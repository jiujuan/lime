# Agent App 远程安装证据 2026-07-03

## 目标

复核 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 上传云端后的 Lime Desktop 远程安装闭环，并追踪 LimeCore 服务端签名契约缺口。

## 已打通

- 云端发布：`content-factory-app@2.2.1` 已发布到生产更新源。
- Release：`agent-app-release-6129`。
- Package URL：`https://updates.limeai.run/agent-apps/content-factory-app/20260702185636.772661353-content-factory-app-2.2.1.lapp`。
- Package hash：`sha256:dae16bc01398b95df627afe7ae26003538901a042ee7aeed23f88499a589b615`。
- Manifest hash：`sha256:e54afd14d0fc9e1c65c6a4120b8366e84cefbfe0a933f802e154f0f49ffd444f`。
- 租户启用：`tenant-0001` 的 `client/agent-apps` 与 `client/bootstrap` 均返回 `content-factory-app@2.2.1`，registrationState 为 `active`。
- App Server 下载验包：`agentAppPackage/fetchCloud` 真实下载 `.lapp` 并返回 `sourceKind=cloud_release`、`manifestName=content-factory-app`、`manifestVersion=2.2.1`；packageHash / manifestHash 均匹配。

## 未打通

GUI 确认安装未完成。当前生产云端响应仍是 `content-factory-app@2.2.1`，缺少 Agent App 签名证据：

- `client/agent-apps` 未返回 `signatureRef` / `signatureProof`。
- `client/bootstrap` 未返回 `signatureRef` / `signatureProof`。
- bootstrap 未返回 `agentAppSignatureTrustRoots`。

Lime Desktop current 策略对 `catalogSource=remote` 默认 `signaturePolicy=required`。在 packageHash 与 manifestHash 均已验证的情况下，实际 release evidence 为：

```json
{
  "status": "blocked",
  "blockerCodes": ["signature_missing"],
  "warningCodes": [],
  "signaturePolicy": "required",
  "signatureVerificationStatus": "not_configured",
  "packageHashMatched": true,
  "manifestHashMatched": true
}
```

## LimeCore 本地修复

2026-07-03 已在 `/Users/coso/Documents/dev/ai/limecloud/limecore` 本地补齐服务端契约：

- Agent App release 支持结构化 `signatureProof`，`client/agent-apps` 与 `client/bootstrap.agentAppCatalog.apps[]` 会透传。
- `client/bootstrap` 顶层支持 `agentAppSignatureTrustRoots`。
- `agentApp.signatureTrustRoots` 配置与 `AGENT_APP_SIGNATURE_TRUST_ROOTS_JSON` 环境变量可下发可信根。
- OpenAPI source fragments、bundle、`packages/types` 与 API 文档已同步。

该修复尚未部署到生产，也未配置真实 production trust roots，因此不能替代 GUI production 安装证据。

## 内容工厂发布侧修复

2026-07-03 已在 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 本地补齐 signed release 生成工具：

- 新增 `npm run release:sign`，入口为 `scripts/sign-release.mjs`。
- 生成 Lime Host verifier 使用的 canonical payload 与 `signatureProof`，输出 `app.signature.yaml`。
- 私钥只从 `AGENT_APP_SIGNING_PRIVATE_KEY_PEM` 或 `--private-key-file` 读取，不写入仓库。
- 可选输出 `agent-app-signature-trust-root.json`，用于后续配置 LimeCore `agentAppSignatureTrustRoots`。
- Lime 内 `src/features/agent-app/testing/fixtures/package-root` 已同步该工具链，且 `contentFactoryFixtureSync.unit.test.ts` 覆盖 `plugin.json` / `package.json` 版本一致、`release:sign` 入口、签名脚本、签名测试和发布文档关键字段。
- Lime Host `cloudReleaseSignature.test.ts` 直接加载 package-root `scripts/sign-release.mjs` 生成 proof，并用 `verifyCloudReleaseSignature(...)` 验证通过，证明发布脚本输出与宿主验签 payload 规则一致。

该修复只证明发布工具链已具备生成 `signatureProof` 的能力；尚未使用 production key 签名、尚未把 trust root 配置到生产 LimeCore，也尚未发布新的 signed release。

## 结论

上传、目录发现、注册码激活和远程包下载验包已打通；真实 GUI 安装确认被签名门禁按设计阻断。LimeCore 本地契约和内容工厂发布侧签名工具均已补齐，但还需要发布 / 部署服务端变更、配置可信根、用 production key 重新发布带 `signatureProof` 的 signed release，并复走 Lime Desktop GUI 确认安装。

不得通过客户端绕过或把 `remote` 源降级为 optional 来宣称安装成功。

## 验证

- 生产控制面只读复核：`client/agent-apps` 与 `client/bootstrap` 均返回 `2.2.1`、`agent-app-release-6129`、registrationState `active`。验证过程中未输出 session token。
- App Server current 主链复核：`app-server --stdio --backend unavailable` 调 `agentAppPackage/fetchCloud` 通过，真实下载并校验远程 `.lapp`。
- 定向回归：`npx vitest run "src/features/agent-app/install/cloudReleaseEvidence.test.ts" "src/features/agent-app/ui/AgentAppsPage.test.tsx" --silent=passed-only --disableConsoleIntercept` 通过，2 files / 37 tests。
- LimeCore 服务端契约验证：`go test ./services/control-plane-svc/configs ./services/control-plane-svc/internal/repo ./services/control-plane-svc/internal/controller -run "AgentApp|Signature|Snapshot|ClientBootstrap" -count=1`、`go test ./services/control-plane-svc/internal/service -run "AgentApp|ClientBootstrap" -count=1`、`make verify-contracts`、`make verify-client-contract-sync`、`make verify-version-sync` 均通过。
- LimeCore 已知非本轮阻塞：`go test ./services/control-plane-svc/internal/service -count=1` 仍被既有 plugin marketplace 脏改动的 authentication policy 断言阻断，和 Agent App 签名契约无关。
- 内容工厂发布工具验证：外部 `/Users/coso/Documents/dev/ai/limecloud/content-factory-app` 已通过 `npm test`、`npm run validate:app`；Lime package-root 快照已通过 `npm test`、`npm run validate:app`、`npm test -- src/features/agent-app/testing/contentFactoryFixtureSync.unit.test.ts`；Host 验签兼容性已通过 `npm test -- src/features/agent-app/install/cloudReleaseSignature.test.ts`。
- 文档格式：`npx prettier --check "internal/roadmap/agentapp/remote-install-evidence-2026-07-03.md"` 通过。
