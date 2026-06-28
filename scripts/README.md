# Scripts 目录治理

`scripts/` 根目录当前是历史入口区，不再作为新增脚本的默认落点。npm scripts、GitHub Actions、文档和测试已经大量直接引用根目录脚本，物理迁移必须分批做；在迁移完成前，根目录和一级领域目录都用冻结基线守住，不允许继续无序变大。

## 当前分类

- `current`：`scripts/lib/` 中的共享实现、被 `package.json` / CI 明确引用的根入口脚本、与守卫绑定的测试脚本
- `compat`：仍在根目录但需要长期按领域迁移的历史入口脚本
- `deprecated`：只服务旧迁移、旧发布或旧宿主证据的脚本，后续只能下线或并入 current 入口
- `dead`：已删除或只允许作为 fail-fast fixture 出现的旧脚本 / 旧产物路径

## 新增规则

1. 新增可执行脚本默认不得放在 `scripts/` 根目录。
2. 领域脚本放到已有 `scripts/<domain>/`；共享库放到 `scripts/lib/`；属于某个 package 的脚本优先放回对应 package。
3. 根目录只允许保留历史入口、`README.md`、`script-root-governance-baseline.json` 和 `check-scripts-governance.mjs` 这类目录治理文件。
4. 新增一级领域目录必须先说明 owner / 使用入口 / 退出条件，并同步本 README、基线和执行计划；不能为了一个临时脚本新增目录。
5. 每新增脚本都要有稳定调用入口：优先通过 `package.json`、测试、CI workflow 或对应文档引用，不保留孤立手动脚本。
6. 跨平台脚本优先使用 Node / TypeScript；Shell、PowerShell、Python 只在目标平台或现有工具链明确需要时使用，并在入口文档说明平台边界。
7. 新脚本命名使用领域名，不使用 `Lime` / `lime_` / `lime-` 品牌前缀，除非对外资产名或第三方生态已经固定。

## 根目录冻结守卫

根目录和一级领域目录允许列表在：

```text
scripts/script-root-governance-baseline.json
```

检查入口：

```bash
npm run governance:scripts
```

该检查会：

- 拒绝新增的已纳入 git 跟踪的 `scripts/*` 根文件
- 拒绝新增的已纳入 git 跟踪的 `scripts/<new-domain>/**` 一级目录
- 对未跟踪的 `scripts/*` 根文件输出本地警告，避免并行工作区误挡；这些文件不得直接写入基线
- 对未跟踪的一级目录输出本地警告；`scripts/__pycache__/` 这类已忽略本地缓存只提示，不得提交
- 对任意 `scripts/**/__pycache__` 或 `*.pyc` Python 缓存文件输出本地提示；如果这类文件被 git 跟踪则直接失败
- 输出当前根目录脚本数量、领域桶统计、一级目录文件数和扩展名分布
- 提示已经迁走但仍留在基线里的文件或目录，便于后续缩小基线

如果确实需要新增根入口或一级领域目录，必须满足三个条件：

- 它是公开稳定入口，而不是一次性工具
- 不能放入已有 `scripts/<domain>/`、`scripts/lib/` 或 package 内；新增领域目录必须代表可长期维护的边界
- 同步更新本 README、执行计划和基线，并说明退出条件

## 迁移顺序

后续迁移按低风险分批：

1. 先迁零引用或仅测试引用脚本
2. 再迁单一领域且只由 `package.json` 引用的脚本
3. 最后迁 release、Electron、harness 这类 CI / 文档 / 测试多侧引用脚本；i18n 主批已迁入 `scripts/i18n/`

每迁一批都要同步：

- `package.json`
- `.github/workflows/*`
- 相关测试 / 文档 / 守卫
- `scripts/script-root-governance-baseline.json`
- 至少运行 `npm run governance:scripts` 和受影响定向测试

## 现有专题说明

### 根目录当前例外

以下根入口已被 `package.json` 明确引用，当前按 `current` 例外纳入冻结基线；后续迁移时优先进入对应领域目录，并同步缩小 `scripts/script-root-governance-baseline.json`：

- `scripts/check-file-size-governance.mjs`：文件体量治理入口，后续可迁到 `scripts/governance/`
- `scripts/check-import-boundaries.mjs`：导入边界治理入口，后续可迁到 `scripts/governance/`
- `scripts/generate-protocol-types.mjs`：App Server 协议类型生成入口，后续可迁到 `scripts/app-server/`

### Governance 脚本

文件体量棘轮的检查入口仍是历史根脚本 `scripts/check-file-size-governance.mjs`，对外使用：

```bash
npm run governance:file-size
```

基线刷新入口位于 `scripts/governance/update-file-size-baseline.mjs`，只在 R-60 维护或拆分收口后手动执行：

```bash
npm run governance:file-size:update
```

该脚本会重扫非测试、非生成的前端 / Rust 源文件，更新 `governance/file-size-baseline.json`，不进入 CI 自动链路。

### i18n 脚本

i18n workflow、report、benchmark、检测脚本和测试已整体迁到 `scripts/i18n/`。对外仍优先使用 `package.json` 里的 `detect-translations` 与 `i18n:*` npm scripts，不直接依赖根目录脚本路径。

历史 Python 翻译辅助脚本也位于 `scripts/i18n/`：

- `scripts/i18n/extract_remaining_todos.py`
- `scripts/i18n/import_translations.py`
- `scripts/i18n/translate_all.py`

新增 i18n 脚本继续进入 `scripts/i18n/` 或复用现有 `i18n:*` npm scripts。

### Knowledge 脚本

Knowledge release scope 审计入口已迁到 `scripts/knowledge/`。对外继续使用 `package.json` 里的 `knowledge:*` npm scripts，不直接依赖根目录脚本路径。

新增 Knowledge 脚本继续进入 `scripts/knowledge/` 或复用现有 `knowledge:*` npm scripts；共享实现仍放在 `scripts/lib/`。

### App Server 脚本

App Server release manifest 与 sidecar smoke 脚本已迁到 `scripts/app-server/`。对外继续使用 `package.json` 里的 `app-server:*` 与 `smoke:app-server-*` npm scripts，不直接依赖根目录脚本路径。

新增 App Server 脚本继续进入 `scripts/app-server/` 或复用现有 App Server npm scripts；涉及 Electron packaged sidecar / release asset 的脚本仍按 Electron / release 批次单独迁移。

### Rust 测试脚本

Rust 测试分层入口仍复用已登记的根脚本 `scripts/run-rust-layer.mjs` 与 `scripts/rust-test-layer-classifier.mjs`，变更范围推导共享实现位于 `scripts/lib/rust-test-scope-core.mjs`，不新增根脚本。对外优先使用 `package.json` 中的稳定入口：

```bash
npm run test:rust:changed
npm run test:rust:related -- <paths...>
npm run test:rust:unit
npm run test:rust:integration
npm run test:rust:layers:stats
```

`test:rust:changed` 默认比较 `HEAD`，也可通过 `npm run test:rust:unit -- --changed=<ref>` 指定 ref；`test:rust:related -- <paths...>` 按显式路径推导受影响 crate。二者都会把 `lime-rs/crates/**` 路径映射到 workspace package，再通过 `cargo metadata` 扩展反向依赖；触碰根 `Cargo.toml`、`Cargo.lock` 或 workspace 配置时自动扩大到 `--workspace`；命中 Rust 路径但无法映射 current workspace crate 时失败，避免静默通过 0 个测试。

新增 Rust 测试治理脚本优先进入 `scripts/lib/` 或未来已登记的 `scripts/governance/` / Rust 领域目录；不要继续向 `scripts/` 根目录添加平级 runner。

### Browser Runtime 脚本

`npm run smoke:browser-runtime` 是既有根 smoke 入口，当前只保留为稳定 npm script。它已迁到 `app_server_handle_json_lines -> browserSession/*` App Server current 主链，不再调用 `launch_browser_session`、`close_chrome_profile_session` 或旧 Tauri / Electron browser runtime facade。真实运行前必须先启动 Electron DevBridge 和带 CDP 端口的 Chrome / Chromium，例如：

```bash
npm run smoke:browser-runtime -- --remote-debugging-port 9222
```

后续新增 Browser 脚本默认进入 `scripts/browser/` 或复用现有 npm script；共享实现进入 `scripts/lib/`。

### MCP 脚本

MCP current 使用链路 smoke 位于 `scripts/mcp/`。对外继续使用 `package.json` 里的稳定入口：

```bash
npm run smoke:mcp-current
npm run smoke:mcp-current -- --allow-write-fixture
npm run smoke:mcp-current -- --allow-oauth-fixture
npm run smoke:mcp-config-electron-fixture
npm run smoke:mcp-context7-live-electron-fixture
```

默认入口只通过 `app_server_handle_json_lines -> App Server JSON-RPC` 验证 `mcpServer/list`、`mcpServerStatus/list`、`mcpTool/list|listForContext|search`、`mcpPrompt/list`、`mcpResource/list` 读链，并禁止旧 `mcp_*` / `get_mcp_servers` Tauri facade 作为成功证据。`--allow-write-fixture` 会创建临时 stdio MCP server，覆盖 `mcpServer/create|start|stop|delete`、`mcpTool/call` 与 `mcpResource/read`，并断言工具 `outputSchema` 暴露 `structuredContent`、调用结果保留 `structuredContent`，用于复验迁移后 MCP 获取和使用流程。
`--allow-oauth-fixture` 会创建本地 OAuth provider，覆盖 `mcpServer/oauth/login`、Electron `open_external_url` 系统浏览器网关、callback token exchange 与 `runtime_status.auth_status` 授权回流，用于复验动态 OAuth current 链路；该模式不依赖真实外部账号或 live Provider。

`npm run smoke:mcp-config-electron-fixture` 是真实 Electron 设置页配置闭环 fixture：从桌面壳侧栏进入设置页，切到 MCP 配置管理，选择 Context7 preset，编辑 streamable HTTP URL 与 `env_http_headers` 环境变量名并保存，再通过 preload `app_server_handle_json_lines -> mcpServer/list` 验证 App Server current read model。该入口不启动 Context7、不调用真实 provider、不读取或写入真实 key，不走 App Server mock backend、renderer mock fallback 或旧 `mcp_*` Desktop facade。

`npm run smoke:mcp-context7-live-electron-fixture` 是真实 Electron + 远程 Context7 live fixture：复用设置页 GUI 创建 Context7 配置，经 `app_server_handle_json_lines` 启动 server、通过 `mcpTool/search` 找到 `resolve-library-id` / `query-docs`，再调用 `mcpTool/call` 查询 “AI Agent 是什么”。该入口会访问远程 Context7；summary 只记录 host、工具名、header 名、env var 名、content 类型 / 数量和 `isError`，不记录 key、header value 或工具正文。

新增 MCP control-plane 脚本继续进入 `scripts/mcp/` 或复用现有 `smoke:mcp-current` npm script；涉及真实 Electron Desktop Host GUI 的 MCP fixture 进入 `scripts/electron/`。共享实现仍放在领域子目录或 `scripts/lib/`。

### Electron 脚本

Electron release / updater 领域新增脚本进入 `scripts/electron/`。当前 `scripts/electron/update-feed-r2-upload-plan.mjs` 负责 R2 updater 上传计划，`scripts/electron/make-zip-local-feed.mjs` 负责用本地临时 feed 验证 Forge macOS ZIP / `RELEASES.json` 生成链路，`scripts/electron/release-workflow-guard.mjs` 负责结构化校验 GitHub Actions release workflow 的 Forge maker、签名、公证、Windows Squirrel 与旧链路拒绝规则。

对外优先使用 `package.json` 里的 `electron:*` npm scripts。`npm run electron:make:zip-local-feed -- --arch arm64` 只写 `.tmp/electron-forge-local-feed`，不能替代 `electron:dist`、release workflow、DMG、签名、公证或 Windows Squirrel 实机证据。

### Harness 脚本

Harness eval、history、trend、analysis brief 与 replay promote 入口已迁到 `scripts/harness/`。对外继续使用 `package.json` 里的 `harness:*` npm scripts，不直接依赖根目录脚本路径。

新增 Harness 脚本继续进入 `scripts/harness/` 或复用现有 Harness npm scripts；共享实现仍放在 `scripts/lib/`。

### Agent QC 脚本

Agent QC report、GUI flow、qcloop、evidence、release summary 与 owner/checklist 入口已迁到 `scripts/agent-qc/`。对外继续使用 `package.json` 里的 `agent-qc:*` npm scripts，不直接依赖根目录脚本路径。

新增 Agent QC 脚本继续进入 `scripts/agent-qc/` 或复用现有 Agent QC npm scripts；共享实现仍放在 `scripts/lib/`。

### Agent Runtime 脚本

Agent Runtime smoke 与 Service Skill 入口 smoke 已迁到 `scripts/agent-runtime/`。对外继续使用 `package.json` 里的 `smoke:agent-runtime-*` 与 `smoke:agent-service-skill-entry` npm scripts，不直接依赖根目录脚本路径。

`npm run smoke:agent-runtime-current-fixture` 是 Claw / Agent Runtime current 主路径的离线 fixture 回归聚合入口，覆盖历史 / 缓存恢复、流式终态收尾、Claw 终态 UI、Electron session history / 代码产物工作台 fixture guard、真实 GUI coding 输入到 Coding Workbench Electron fixture、Claw GUI current fixture guard，以及真实 Electron `cancel-then-continue` 场景。它默认禁止 live Provider 和 mock backend，只能作为进入 Electron / Playwright 真实闭环前的快速回归门槛，不能替代完整 GUI E2E。

`npm run smoke:expert-skills-live-gate` 是专家 Skills Runtime 的证据门禁：默认只读取 `.lime/qc` 中的确定性 Electron fixture summary，确认专家 declared / selected / invoked、`skill_search -> SKILL.md body read -> Skill gate -> Skill invocation`、Harness GUI Evidence Pack 导出与专家面板复盘证据完整；缺少显式 live Provider summary 时返回 `pending_live_provider`，不调用真实模型，也不把 deterministic fixture 误当完整 live 验收。

`npm run smoke:expert-skills-live-runner` 是专家 Skills Runtime 的 live Provider 验收入口骨架：默认 fail-fast，必须显式传 `--allow-live-provider` 或设置 live Provider smoke 环境变量。它可用 `--live-summary <path>` 归一化已有 live evidence，也可在额外传 `--execute-live-runtime` 时通过 App Server current JSON-RPC 提交真实 Provider turn，并输出 `.lime/qc/expert-skills-live-runner-summary.json` 供 `smoke:expert-skills-live-gate -- --live-summary <path>` 审计。

`npm run smoke:agent-session-history-electron-fixture` 是真实 Electron 历史恢复 fixture：通过 preload `app_server_handle_json_lines` 验证 App Server current `agentSession/start/read/update/list` 形状、最近对话可见和 hydrate detail 数组；它使用 `APP_SERVER_BACKEND_MODE=unavailable`，不触发 turn，也不调用模型后端。

`npm run smoke:codex-import-continuation-electron-fixture` 是真实 Electron 本地历史导入续聊 fixture：通过 preload `app_server_handle_json_lines` 导入一条本地 rollout fixture，验证 `agentSession/read.detail.items` 能恢复 reasoning、command、patch、web search、approval，再在同一个导入 session 上调用 `agentSession/turn/start` 继续对话。它使用本地 external backend fixture，不调用正式模型，不走 App Server mock backend、renderer mock fallback 或 legacy runtime command。

`npm run smoke:codex-import-click-through-electron-fixture` 是真实 Electron 本地历史导入点击闭环 fixture：使用临时 `CODEX_HOME` 写入 `session_index.jsonl` 与 rollout JSONL，从侧边栏点击“本地历史导入”，在确认弹窗预览“导入细节还原”后点击确认，稳定进入导入会话页，验证导入消息、reasoning、友好命令记录、patch、web search、approval 默认可见，再通过真实输入框发送 follow-up。该入口同时覆盖 commit 后导航不被 task-center 旧 tab fallback 抢回、imported timeline 工具细节默认展开、预览不暴露 raw source event / payload 字段、续聊不暴露 fixture 哨兵、消息列表主线不展示 `imported-source-banner` 或“本地历史导入 / 已还原”独立状态条；环境信息弹层不重复展示导入主线卡，也不暴露 `Approve Codex command` / `npm test` / 原始 thread id 等内部细节，以及同一 session 的 `agentSession/turn/start` backend ledger。脚本还会在 `visual-audit/` 下输出 `desktop / compact / narrow` 三种视口截图，并把输入框可见性、消息列表可见性、导入细节可见性和无导入主线卡写入 summary。它使用本地 external backend fixture，不读取真实 `~/.codex`，不调用正式模型，不走 App Server mock backend、renderer mock fallback 或 legacy runtime command。

`npm run smoke:local-history-import-visual-audit` 是本地历史导入的产品视觉边界审计：复用真实 Electron 点击闭环 fixture，再检查 `desktop / compact / narrow` 三视口的消息列表、输入框、导入命令 / 补丁 / 搜索 / 审批记录、无导入主线 banner / run control 卡，并扫描 GUI 可见文本，确保除导入来源 / provenance / fixture / 协议枚举外不泄漏来源品牌字眼。该入口仍使用临时本地历史 fixture 和 external backend，不读取真实用户历史目录，不调用正式模型。

`npm run smoke:local-history-import-real-sample-visual-audit` 是真实样本 GUI 审计入口：启动真实 Electron Desktop Host 与隔离 App Server data 目录，从真实 content-studio 本地历史源只读 scan/preview，选择最长/最复杂线程导入后从侧边栏打开会话，采集 `desktop / compact / narrow` 三视口与 `top / middle / bottom` 滚动截图，并验证输入框、消息列表、导入命令 / 补丁 / 搜索 / 审批记录可见，普通 GUI 不暴露 source path、source thread id、raw event 字段或来源品牌字眼。该入口使用 `APP_SERVER_BACKEND_MODE=unavailable`，不调用正式模型，不走 App Server mock backend、renderer mock fallback，也不把真实对话正文写入证据 JSON。

`npm run smoke:code-artifact-workbench-electron-fixture` 是真实 Electron 代码产物工作台 fixture：使用本地 external backend fixture 生成 `artifact.snapshot`、标准 coding facts 与 `turn.final_done`，再从 GUI 历史会话打开工作台，验证代码产物入口、变更 / 输出 / 日志面板和工作台可见性；传入 `--scenario gui-coding-input` 时会先通过真实 GUI 输入框发送 coding 请求，再验证同一套 Workbench 证据。它不调用正式模型，不走 App Server mock backend。

`npm run smoke:claw-chat-current-fixture` 是更重的真实 Electron GUI fixture：通过真实输入框发送“整理今天的国际新闻”，验证用户输入可见、assistant 完成态输出可见、输入框不消失、App Server `agentSession/turn/start` 走 current JSON-RPC、WebSearch 不按关键词强制 required，并使用本地 external backend fixture 代替正式模型后端。修 Agent Runtime / Claw 输入、流式卡住、历史 hydrate 或新闻请求链路时，先跑聚合 guard，再按需要显式跑该入口；修无法停止或停止后无法继续输出时，还必须跑 `--scenario cancel-then-continue`，证明同一 current session 停止后能再次从 GUI 输入“继续输出”并完成第二轮。

新增 Agent Runtime 脚本继续进入 `scripts/agent-runtime/` 或复用现有 Agent Runtime npm scripts；共享实现仍放在 `scripts/lib/`。

### Agent App 脚本

Agent App smoke、runtime fixture、connector production gate、standalone release helper 与配套测试已迁到 `scripts/agent-app/`。对外继续使用 `package.json`、GitHub Actions 或路线图文档里的稳定入口，不直接依赖根目录脚本路径。

新增 Agent App 脚本继续进入 `scripts/agent-app/` 或复用现有 `smoke:agent-apps`、`smoke:agent-app-lab`、`agent-app:*` npm scripts；共享实现仍放在 `scripts/lib/`。

### 项目热力图

静态项目观察报告继续使用：

```bash
npm run heatmap:project
```

完整流程见：

- `internal/aiprompts/project-heatmap.md`
