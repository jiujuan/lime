## Lime v1.46.0

发布日期：`2026-05-21`
递交范围：当前完整 worktree，包含 tracked 与新增文件；本次继续补齐技能包本地安装链路、Agent App Host Bridge / runtime surface、i18n 文案对齐、release note 事实源与版本同步。

> 发布说明：上一版 release note 事实源为 `v1.45.1`。本版升级到 `v1.46.0`，并继续按 current release note 口径清理旧历史堆叠内容：`RELEASE_NOTES.md` 只保留当前版本说明，旧 `v1.45.1` 及更早发布说明不再作为当前 release note 事实源保留。

### 发布概览

- 应用版本从 `1.45.1` 升级到 `1.46.0`，同步 `package.json`、`package-lock.json`、`packages/lime-cli-npm/package.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`、`src-tauri/tauri.conf.json` 与 `src-tauri/tauri.conf.headless.json`。
- Skills 主链补齐本地 skill package 检查、安装、打开请求清理与可视化预览，新增 `SkillPackageInstallDialog`、`useSkillPackageOpenRequests`、`skillsApi` 的 package 入口、mock 映射与文件关联状态。
- Agent App / Host Bridge 继续收敛到 current 命令与 typed bridge surface，补齐 runtime page、apps page、bridge client、cloud bootstrap 与 command catalog 的一致性。
- 多语言文案继续对齐 current 五语言，覆盖 skills、settings、agent / runtime 页面新增 presentation copy。
- Release note current 事实源、版本一致性检查与 packaging 配置同步完成。

### 用户可见更新

- Skills 页面现在可以直接审查并安装本地 `.skill/.skills` 包，安装前能看到包内文件、`SKILL.md` 预览和标准合规校验结果。
- 处理技能包文件关联与外部打开请求时，浏览器模式和 Tauri 模式的行为更一致。
- Agent Apps / Runtime 页面继续补齐对 host bridge、投影、安装状态和能力面板的可读性。
- 新增或改动的用户可见文案已同步 Lime current 五语言 `zh-CN / zh-TW / en-US / ja-JP / ko-KR`。

### 开发者与治理更新

- `src/components/skills/` 新增本地技能包安装对话框与 Markdown 预览组件。
- `src/hooks/useSkillPackageOpenRequests.ts` 将技能包打开请求统一成可复用 hook，避免散落处理逻辑。
- `src/features/agent-app/`、`src/lib/api/skills.ts`、`src/lib/tauri-mock/skillManagementMocks.ts` 与 `src/lib/dev-bridge/mockPriorityCommands.ts` 同步新的安装、打开和 bridge 行为。
- `docs/roadmap/agentapp/capability-sdk.md` 继续跟进能力 SDK 与发布路径说明，保持文档和实现对齐。

### 当前校验状态

- 已通过 `npm run verify:app-version`
- 已通过 `cargo fmt --manifest-path "src-tauri/Cargo.toml" --all`
- 已通过 `cargo clippy --manifest-path "src-tauri/Cargo.toml" --all-targets --all-features -- -D warnings`
- 已通过 `cargo test --manifest-path "src-tauri/Cargo.toml"`
- 已通过 `npm run lint`
- 已通过 `npm test`

---

**完整变更**: `v1.45.1` -> `v1.46.0`
