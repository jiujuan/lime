# S2s1 AgentMessage Content Parts Live Projection

## 结论

Renderer 的 App Server canonical item reader 现在会从
`payload.content_parts` 保留 AgentMessage 的 typed message parts，并投影为 GUI 现有
`contentParts` 字段。canonical wire 使用生成协议定义的 snake_case；reader 不读取 raw
event payload，也不增加 presentation fallback。

如果 canonical `content_parts` 存在但不是数组，整个 canonical Item fail closed 返回
`null`，避免把 malformed media 静默降级成纯文本消息。数组内部的 reference-only media
校验与 inline payload 拒绝仍由现有 GUI content-part converter 承担，本 slice 没有复制
第二套 sanitizer。

## 根因与边界

Media Gate B 的 fixture 已发出包含 text 与 media reference 的 canonical
AgentMessage。失败基线有两个连续丢失点：Rust materializer/read model 只保留
`text/phase`，前端 live canonical reader 也只投影 `text/phase`。S2s 外部 owner 负责前一
处 protocol/store/read-model 收敛；S2s1 只修复后一处 live notification 投影。

该形状遵循 OpenCode 的多模态边界：Thread/history/read model 保持 typed、
reference-only parts，不把 data URL 或 base64 写入历史；provider 边界后续再负责把
sidecar reference 解析为临时 bytes/base64 并执行 provider-specific lowering。没有把
OpenCode Session `FilePart` 或 provider wire shape 引入 Lime ThreadStore。

## 分类

- `current`：App Server canonical AgentMessage `content_parts` 与 Renderer live
  projection。
- `test-only`：reader regression fixture 与受控 Media Gate B external backend。
- `compat / deprecated`：无新增 surface。
- `dead`：无恢复 raw event payload inference、inline media history 或 production mock
  fallback。

## Gate B 证据

`npm run smoke:claw-chat-current-fixture -- --scenario media-reference` 在当前 cumulative
工作树通过；随后 aggregate 也重新通过同一 media 场景，持久 summary 位于
`.lime/qc/gui-evidence/claw-chat-current-fixture/claw-chat-current-fixture-media-reference-regression-summary.json`：

- proof level 为 `Gate B controlled fixture`；
- read model 观察到 `contentParts`，matching media part 为 `2`；
- URI、MIME、caption、source owner 全部存在；
- GUI 中 `结果图`、`sidecar://media/fixture-image-1`、`image/png` 各出现一次；
- media card 与 Workbench 图片预览可见；
- `data:image` 与 `base64,` 可见命中均为 `0`；
- actionable console error 为 `0`。

Gate B 同时覆盖 S2s Rust owner、S4i4 fixture owner 与 S2s1 live reader，本 slice 只声明
前端 reader 的实现归属。

## 验证

- `npx vitest run src/lib/api/agentRuntime/appServerCanonicalItemReader.test.ts`：
  `16/16`。
- `npx eslint` 精确检查两个 reader 文件：通过。
- `npm run typecheck`：Renderer 与 Node 双 tsconfig 通过。
- `npx prettier --check` 精确检查两个 reader 文件：通过。
- `git diff --check` 精确检查两个 reader 文件：通过。
- `npm run test:contracts`：generated types、App Server client 与命令/模态/脚本守卫
  通过。
- related Rust 验证由 S2s owner 的 cumulative 工作树执行：`agent-protocol 29/29`、
  `agent-runtime 116/116`、`app-server 1113/1113` 及反向依赖通过；不归 S2s1 实现所有。

验证前后 reader 两个文件的 SHA-256 保持不变，证明 fresh 验证期间没有隔壁进程再次
夹写。

## 并行边界

本 slice 实际写集只有 reader 两个文件与本 claim/evidence/handoff/lock。Rust、
protocol/schema/generated client、ThreadStore/read model、media fixture、Electron 与 GUI
组件均为只读或避让范围。S2s、S4i4、S4l 的 active lock 未被本进程释放。
