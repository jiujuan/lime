# 性能分析与火焰图

## 目标

Lime 的卡顿来源通常不是单点：

- Rust 后端 CPU 热点
- Tokio 异步任务等待、锁竞争或阻塞
- Tauri 命令边界过慢
- React / WebView 主线程重渲染或长任务

因此仓库内采用分层诊断，而不是只依赖单一火焰图工具。

## 当前内置能力

所有内置 profiling 能力都只面向开发环境：

- 只建议通过 `npm run tauri:dev:profile:*` 这组命令启用
- release / 生产构建默认不启用这些 feature
- 即使手动设置 `LIME_PROFILE=*`，release / 生产构建也会忽略这些开发诊断开关

### 1. Rust Trace 导出

开发环境下如果设置 `LIME_PROFILE=trace`，并以 `dev-profiling` feature 启动，应用会把 span 导出为 Perfetto / Chrome Trace 可读的 JSON 文件。

- 输出目录：应用运行时目录下的 `profiles/`
- 自定义路径：`LIME_PROFILE_TRACE_PATH=/abs/path/to/trace.json`
- 调试时自动打开主窗口 DevTools：`LIME_OPEN_WEBVIEW_DEVTOOLS=1`

### 2. Tokio Console 遥测

开发环境下如果设置 `LIME_PROFILE=console`，并且以 `tokio-console` feature + `RUSTFLAGS=--cfg tokio_unstable` 编译，应用会暴露 Tokio Console 诊断端点。

- 默认地址：`127.0.0.1:6669`
- 自定义地址：`TOKIO_CONSOLE_BIND=127.0.0.1:7777`
- 适合排查 task 长时间不推进、锁等待、资源等待、`never-yielded` 等问题

### 3. 前端 Invoke User Timing

`safeInvoke` 会在浏览器 Performance 面板中写入 `lime:safeInvoke:*` 的 User Timing 条目，便于把前端交互和 Tauri 命令耗时对齐。

### 4. 关键慢链路 Span

当前优先覆盖了以下链路：

- `chat_send_message`
- `send_message_with_aster`
- `launch_browser_session_global`
- `mcp_call_tool`
- `mcp_start_server`
- `mcp_list_tools`

这些 span 适合回答“慢在哪一段”，而不是“哪一行代码最吃 CPU”。

## 推荐工作流

### A. 先看整条链路

适用场景：

- 发送消息很慢
- 浏览器协助启动慢
- MCP 工具调用卡住

命令：

```bash
npm run tauri:dev:profile:trace
```

如果需要一起开 WebView DevTools：

```bash
npm run tauri:dev:profile:trace:devtools
```

如果要复用 headless 配置：

```bash
npm run tauri:dev:profile:trace:headless
```

结束应用后，把生成的 trace 文件导入 Perfetto：

- https://ui.perfetto.dev/

重点查看：

- `chat_send_message`
- `send_message_with_aster`
- `launch_browser_session_global`
- `mcp_call_tool`

## B. 看 Tokio 异步任务阻塞

适用场景：

- UI 主观很卡，但 CPU 没打满
- 某个命令耗时很长，trace 看起来主要在“等”
- 怀疑锁竞争、task 堵塞、future 从未 yield

先启动应用：

```bash
npm run tauri:dev:profile:console
```

如果还要同时看 trace：

```bash
npm run tauri:dev:profile:trace-console
```

然后在另一个终端连接：

```bash
tokio-console 127.0.0.1:6669
```

如果本机还没装 CLI：

```bash
cargo install tokio-console
```

重点查看：

- 哪些 task 长时间 Busy / Idle 但不推进
- 是否存在 `never-yielded`
- 哪些资源等待时间长
- 是否有异常频繁自唤醒的 task

## C. 再看 CPU 火焰图

适用场景：

- App 明显吃满 CPU
- 界面冻结，但不像纯网络等待
- 怀疑某个 Rust 热路径在自旋或大量计算

优先使用 `samply`：

```bash
samply record npm run tauri:dev
```

如果偏好传统 flamegraph，也可以使用 `cargo flamegraph`。

重点：

- 这一步回答的是“哪段栈最耗 CPU”
- 它不擅长解释 React 重渲染或异步等待

## D. WebView / React 卡顿

适用场景：

- UI 掉帧
- 输入有明显延迟
- 面板切换卡顿但 Rust 侧不一定忙

建议：

1. 打开 WebView DevTools 的 Performance 面板
2. 查看 `lime:safeInvoke:*` 的 User Timing 条目
3. 同时用 React DevTools Profiler 观察重渲染热点

重点：

- 是不是某个组件反复 commit
- 是否存在长任务阻塞主线程
- 是否某次 invoke 响应后触发了级联重渲染

## 排障顺序

1. 先录一次 trace，确认慢链路属于 `chat`、`browser runtime`、`mcp` 还是前端。
2. 如果 trace 显示命令链路很长但 CPU 不高，优先接 `tokio-console` 查等待、锁、外部调用。
3. 如果 CPU 很高，再上 `samply` / flamegraph。
4. 如果主观感受是 UI 卡顿，必须同时看 WebView Performance 和 React Profiler。

## 设计约束

- 不把 profiling 默认常驻开启，避免正常开发时引入额外噪声与开销
- 只记录诊断必要字段，不把 prompt、完整参数直接写入 trace
- 所有 profiling 产物走应用运行时目录，不写死平台路径
- profiling feature 仅在显式启动的 debug 诊断流程下编译进应用，不进入默认 release / 生产构建
