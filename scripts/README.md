# Scripts 目录治理

`scripts/` 根目录当前是历史入口区，不再作为新增脚本的默认落点。npm scripts、GitHub Actions、文档和测试已经大量直接引用根目录脚本，物理迁移必须分批做；在迁移完成前，根目录用冻结基线守住，不允许继续变大。

## 当前分类

- `current`：`scripts/lib/` 中的共享实现、被 `package.json` / CI 明确引用的根入口脚本、与守卫绑定的测试脚本
- `compat`：仍在根目录但需要长期按领域迁移的历史入口脚本
- `deprecated`：只服务旧迁移、旧发布或旧宿主证据的脚本，后续只能下线或并入 current 入口
- `dead`：已删除或只允许作为 fail-fast fixture 出现的旧脚本 / 旧产物路径

## 新增规则

1. 新增可执行脚本默认不得放在 `scripts/` 根目录。
2. 领域脚本放到 `scripts/<domain>/`；共享库放到 `scripts/lib/`；属于某个 package 的脚本优先放回对应 package。
3. 根目录只允许保留历史入口、`README.md`、`script-root-governance-baseline.json` 和 `check-scripts-governance.mjs` 这类目录治理文件。
4. 每新增脚本都要有稳定调用入口：优先通过 `package.json`、测试、CI workflow 或对应文档引用，不保留孤立手动脚本。
5. 跨平台脚本优先使用 Node / TypeScript；Shell、PowerShell、Python 只在目标平台或现有工具链明确需要时使用，并在入口文档说明平台边界。
6. 新脚本命名使用领域名，不使用 `Lime` / `lime_` / `lime-` 品牌前缀，除非对外资产名或第三方生态已经固定。

## 根目录冻结守卫

根目录允许列表在：

```text
scripts/script-root-governance-baseline.json
```

检查入口：

```bash
npm run governance:scripts
```

该检查会：

- 拒绝新增的已纳入 git 跟踪的 `scripts/*` 根文件
- 对未跟踪的 `scripts/*` 根文件输出本地警告，避免并行工作区误挡；这些文件不得直接写入基线
- 输出当前根目录脚本数量和领域桶统计
- 提示已经迁走但仍留在基线里的文件，便于后续缩小基线

如果确实需要新增根入口，必须满足三个条件：

- 它是公开稳定入口，而不是一次性工具
- 不能放入已有 `scripts/<domain>/`、`scripts/lib/` 或 package 内
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

### MCP 脚本

MCP current 使用链路 smoke 位于 `scripts/mcp/`。对外继续使用 `package.json` 里的稳定入口：

```bash
npm run smoke:mcp-current
npm run smoke:mcp-current -- --allow-write-fixture
```

默认入口只通过 `app_server_handle_json_lines -> App Server JSON-RPC` 验证 `mcpServer/list`、`mcpServerStatus/list`、`mcpTool/list|listForContext|search`、`mcpPrompt/list`、`mcpResource/list` 读链，并禁止旧 `mcp_*` / `get_mcp_servers` Tauri facade 作为成功证据。`--allow-write-fixture` 会创建临时 stdio MCP server，覆盖 `mcpServer/create|start|stop|delete`、`mcpTool/call` 与 `mcpResource/read`，用于复验迁移后 MCP 获取和使用流程。

新增 MCP 脚本继续进入 `scripts/mcp/` 或复用现有 `smoke:mcp-current` npm script；共享实现仍放在 `scripts/lib/`。

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

`npm run smoke:agent-runtime-current-fixture` 是 Claw / Agent Runtime current 主路径的离线 fixture 回归聚合入口，覆盖历史 / 缓存恢复、流式终态收尾、Claw 终态 UI、Electron session history / 代码产物工作台 fixture guard、Claw GUI current fixture guard，以及真实 Electron `cancel-then-continue` 场景。它默认禁止 live Provider 和 mock backend，只能作为进入 Electron / Playwright 真实闭环前的快速回归门槛，不能替代完整 GUI E2E。

`npm run smoke:agent-session-history-electron-fixture` 是真实 Electron 历史恢复 fixture：通过 preload `app_server_handle_json_lines` 验证 App Server current `agentSession/start/read/update/list` 形状、最近对话可见和 hydrate detail 数组；它使用 `APP_SERVER_BACKEND_MODE=unavailable`，不触发 turn，也不调用模型后端。

`npm run smoke:code-artifact-workbench-electron-fixture` 是真实 Electron 代码产物工作台 fixture：使用本地 external backend fixture 生成 `artifact.snapshot` 与 `turn.final_done`，再从 GUI 历史会话打开工作台，验证代码产物入口和工作台面板可用；它不调用正式模型，不走 App Server mock backend。

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
