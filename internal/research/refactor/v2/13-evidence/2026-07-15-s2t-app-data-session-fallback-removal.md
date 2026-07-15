# S2t App-data session fallback removal

## 结论

RuntimeCore、EventLog 与 ProjectionStore/ThreadStore 是 session identity/read/resume 的唯一 current owner。`SessionAppDataSource::read_agent_session`、`load_app_data_session`、session/thread identity 的 app-data fallback 与 `session_hydration.rs` 已删除；objective 与 session-file app-data 能力保持 current。

## 改动

- 删除 app-data `AgentSessionReadResponse` hydration trait method 和 RuntimeCore fallback branches。
- 删除 681 行 `runtime/session_hydration.rs` 及 module wiring。
- restart 输出/文件 checkpoint 回归改为真实 EventLog + ProjectionStore + sidecar 链。
- 测试 data source 与 constructor 清除 persisted `AgentSessionReadResponse` fixture。
- legacy catalog 增加 removed path/symbol guard，禁止 fallback 回流。

## 验证

- focused App Server groups：`100/100` passed：objectives 8、memory 5、session list 8、read model 27、plugin worker 7、sessions 20、right surface 16、output snapshots 6、handoff review 3。
- 输出/文件 checkpoint restart：`6/6` passed。
- 当前 cumulative App Server library：`1118/1118` passed。
- `npm run verify:gui-smoke`：passed，真实 Electron/App Server sidecar 初始化并加载 workbench/memory surface。
- `npm run governance:legacy-report`：零引用候选 `0`、分类漂移 `0`、边界违规 `0`。
- claimed Rust files `rustfmt --check`：passed。
- 全工作树 `git diff --check`：passed。

## 治理分类

- `current`：RuntimeCore + EventLog + ProjectionStore/ThreadStore session read/resume。
- `current`：objective/session-file app-data methods。
- `dead / deleted / forbidden-to-restore`：app-data `AgentSessionReadResponse` hydration、`load_app_data_session`、`session_hydration.rs`。
- `compat` / `deprecated`：无新增。
