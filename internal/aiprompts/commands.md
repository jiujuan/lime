# Desktop Host / App Server 命令边界

## 这份文档回答什么

本文件用于说明 Lime 中 Electron Desktop Host bridge、App Server JSON-RPC、前端网关、DevBridge 诊断通道、测试 mock 与 legacy desktop facade 的工程边界，主要回答：

- 命令改动应该从哪里进入，而不是到处直接 `invoke`
- 哪些文件共同构成命令契约的事实源
- 新增、迁移、下线命令时，最低要同步哪些位置
- 怎样避免 compat / deprecated 路径重新长出新表面

如果本轮改动不仅涉及 Desktop Host / App Server 命令边界，还涉及 `@` / 产品型 `/`、聊天轻卡、右侧 viewer、`ServiceSkill` 场景或命令恢复主链，请同时阅读：

- `internal/aiprompts/command-runtime.md`

## 快速复核口径

用户问“结论 / 复核 / 是否能删 / 是否 dead”时，先给 `3-8` 行可执行结论和证据，不自动扩展成全量命令 inventory、文档治理或契约重跑。

整目录旧命令 / 旧主 crate 如果同时满足：已脱离 Cargo workspace / 构建图、当前工作树已物理删除或 staged delete、已有 Electron Desktop Host / App Server / `lime-rs/crates/**` current owner 承接、契约或边界守卫能阻止回流，可直接按目录级 `dead / deleted / forbidden-to-restore` 处理；不要求逐文件证明旧实现“业务语义无价值”。

`internal/exec-plans/**`、旧路线图和 git history 中的旧 `lime-rs/src/**` 路径默认是历史 evidence，不是 current owner 引用；只在它们出现在当前规则段落、当前状态摘要或 active checklist 并被写成现役落点时才清理。

## 推荐调用路径

前端业务代码**不应直接散落 `invoke`**。

推荐路径是：

`组件 / Hook -> src/lib/api/* 网关 -> safeInvoke -> Electron Desktop Host bridge -> App Server JSON-RPC -> RuntimeCore / backend`

这条路径是 current 事实源。Electron 只负责 Desktop Host bridge：preload / IPC 白名单、窗口、托盘、Dock、菜单、updater、签名发布、sidecar 生命周期和少量 renderer-safe projection。Electron 不是第二套后端，也不要把它命名成后端适配层；App Server JSON-RPC 才是 backend 事实入口。

Updater 是明确的 Desktop Host 壳能力，不进入 App Server，也不得回流 Rust Tauri command facade。旧 updater command 面已删除：旧 `update_cmd` 文件不再存在，`lime-rs/src/commands/mod.rs` 不再声明 `update_cmd`，`runner.rs` 不再注册旧 updater handler 或后台检查任务。后续若调整更新体验，只能改 Electron Desktop Host updater current 链路、前端 `src/lib/api/appUpdate.ts` 网关和 release / Forge 文档，不得在 `lime-rs/src/commands/` 新增 updater stub、compat wrapper 或业务实现。

生产路径不能 mock。`safeInvoke` / `invoke`、Electron Host、App Server sidecar、GUI smoke 和业务 E2E 必须进入真实 Electron Desktop Host IPC / App Server JSON-RPC；无真实通道时 fail-closed。`mockPriorityCommands`、`defaultMocks`、`invokeMockOnly`、`explicitMockFallback`、内存事件 / 窗口 / 快捷键夹具和 mock backend 只允许测试文件或显式测试夹具使用，不能作为产品降级、浏览器模式兜底或交付证据。

macOS 真实 Electron E2E / GUI smoke 可以使用 Chromium `--use-mock-keychain` 隔离系统钥匙串。这只隔离测试进程的 Keychain backend，不等于业务 mock；目的是避免隔离 `HOME / ELECTRON_E2E_USER_DATA_DIR` 时触发“找不到用于储存 `Lime Key` 的钥匙串”系统弹窗或污染用户真实钥匙串。生产 App 和普通开发预览不得依赖该参数。

新增命令和对应前端网关命名必须使用领域名，不要加 `Lime` / `lime_` / `lime-` 品牌前缀。例如 App Server 入口使用 `app_server_*`，不要写成带品牌前缀的命名。只有历史兼容、对外品牌标识或外部生态已固定的名字才允许例外，并在路线图或执行计划写明原因和退出条件。

新增 AI Agent / runtime / host integration / 跨 App 复用能力默认走 App Server JSON-RPC current 主链。Electron main / preload 只作为 Desktop Host bridge，负责桌面壳能力、sidecar 生命周期与白名单 IPC；旧 `agent_runtime_*` / Aster legacy command facade 只允许作为 retired guard、历史 evidence、test-only fixture 或受控迁移残留，不得承接新业务逻辑，也不得作为新增能力入口。

`lime-rs/src/**` 旧主 crate / legacy facade / 迁移来源目录已于 `2026-06-10` 物理删除，当前 Cargo workspace 只以 `lime-rs/crates/**` 为 Rust 事实源。不得恢复该目录、不得新增 bootstrap / runner / compat facade / tombstone / stub，也不得把历史路径当新增后端业务、领域服务、runtime 分支、API adapter、数据访问或跨 App 复用能力的落点。需要参考旧实现时只读 git history / 执行计划，落地必须进入 App Server、RuntimeCore、services、core、agent、协议/client crate 或 Electron Desktop Host。

`lime-rs/src/commands/**` 已随 `lime-rs/src/**` 删除；旧 Tauri command wrapper、runner / dispatcher / catalog / mock 注册只能作为 retired guard / 历史引用存在。新增 Rust 后端能力必须落到 App Server crates / RuntimeCore / services 等 current 事实源；桌面壳能力落到 Electron Desktop Host。任何恢复旧 wrapper、fail-closed stub、compat wrapper 或退场 stub 的改动都应被视为旧路回流。

前端 `src/lib/dev-bridge/**` 不是旧 Tauri DevBridge 本体，也不是整体删除对象。当前分类固定如下：

- `current`：`safeInvoke.ts`、`http-client.ts`、`index.ts` 作为 renderer 到 Electron Desktop Host / App Server JSON-RPC 的集中传输、可用性探测和诊断出口；`app_server_handle_json_lines` 与 App Server method timeout/profile 分类也属于 current bridge 边界。
- `compat / deprecated`：`commandPolicy.ts` 中仍服务迁移期的 legacy command truth / no-mock fallback 分类；它只允许 fail closed、委托 current 传输或作为迁移阻塞记录，不得继续承接业务事实。
- `dead`：已经迁到 Electron Desktop Host 或 App Server current 的旧命令名；不得回到 `bridgeTruthCommands`、`noMockFallbackCompatCommands`、`mockPriorityCommands`、前端生产 `safeInvoke` 或治理 catalog。
- `test-only`：负向测试、retired command guard、explicit test fixture。它们只能证明旧命令没有回流，不能成为生产 fallback。

清理 `src/lib/dev-bridge` 时先按命令组收缩 `commandPolicy`、`mockPriorityCommands`、`explicitMockFallback`、相关测试和 contract guard；不要把删除整个目录当作治理第一刀。删不动的 legacy policy / mock residual 必须同步写入当前执行计划和 `internal/exec-plans/tech-debt-tracker.md` 的 `CCD-012`，记录命令名、当前分类、阻塞文件、退出条件和验证入口，不能只停留在聊天、handoff 或临时备注里。只有当所有前端 API 网关都已经迁出 `safeInvoke` 当前传输，并且有新的 renderer bridge 事实源接替 `app_server_handle_json_lines`、事件监听和可用性探测后，才允许单独开计划讨论目录级退场。

这样做的目的不是“多包一层”，而是为了保证：

- 前端只有一个可治理的调用出口
- Electron Host bridge、App Server、legacy desktop facade 可以按 `current / compat / deprecated / dead-candidate` 演进
- 新旧命令并存时，迁移边界清晰，不会继续扩散
- 契约检查脚本能稳定扫描并阻止回流

Connect deep link 已切到 Electron Desktop Host URL bridge 与 App Server JSON-RPC current 主链。当前唯一生产路径为：

`Electron protocol/open-url -> src/lib/desktop-host/plugin-deep-link.ts -> src/hooks/useDeepLink.ts -> src/lib/api/connect.ts -> connectDeepLink/resolve | connectOpenDeepLink/resolve | connectRelayApiKey/save | connectCallback/send -> App Server RuntimeCore / LocalAppDataSource`

固定约束：

- Electron main / preload 只负责接收 `lime://` URL、缓存启动期 pending URL、派发 renderer-safe `onOpenUrl/getCurrent`，不得承接 Connect registry、API Key 保存或 webhook 业务事实
- Connect registry 不再由 renderer 启动期预加载；`lime://connect` 实际发生时才由 App Server 按需读取缓存 / 远程 registry，保存 Relay API Key 时必须经 `connectRelayApiKey/save` 做 registry 校验
- `lime://open` 官网入口同样走 `connectOpenDeepLink/resolve`，不要回退到旧 Desktop 命令
- `deep-link://new-url`、`deep-link-connect`、`deep-link-error`、`handle_deep_link`、`handle_open_deep_link`、`save_relay_api_key`、`send_connect_callback`、`list_relay_providers`、`refresh_relay_registry` 都不得重新接回前端生产路径、Electron Desktop Host 白名单、DevBridge mock 或 renderer mock
- 如未来需要展示中转商列表，必须先补 App Server current method 与前端 `src/lib/api/connect.ts` 网关；不能复活旧 Tauri registry list / refresh 命令

浏览器连接器设置页同样遵循这条路径。当前主入口为 `src/lib/webview-api.ts` 中的浏览器连接器网关，统一承接：

- `get_browser_connector_settings_cmd`
- `set_browser_connector_install_root_cmd`
- `set_browser_connector_enabled_cmd`
- `set_system_connector_enabled_cmd`
- `set_browser_action_capability_enabled_cmd`
- `get_browser_connector_install_status_cmd`
- `install_browser_connector_extension_cmd`
- `open_browser_extensions_page_cmd`
- `open_browser_remote_debugging_page_cmd`
- `open_browser_connector_guide_window`
- `disconnect_browser_connector_session`

这些命令属于当前设置主路径，不应再在页面组件里散落裸 `invoke`。

旧设置页里“安全与性能 / 容错配置”那组命令已经下线。`get_retry_config`、`update_retry_config`、`get_failover_config`、`update_failover_config`、`get_switch_log`、`clear_switch_log`、`get_rate_limit_config`、`update_rate_limit_config`、`get_conversation_config`、`update_conversation_config`、`update_hint_routes`、`get_pairing_config`、`update_pairing_config` 都应视为 `dead`，不允许重新接回前端网关、Rust 注册或 mock。提示路由当前只保留只读的 `get_hint_routes` 读取面；如果未来确实要恢复编辑入口，必须重新定义 `current` 主链，而不是直接复活旧设置页命令。

旧 onboarding 插件安装流与 Provider Switch 命令链也已经下线。`get_switch_providers`、`get_current_switch_provider`、`add_switch_provider`、`update_switch_provider`、`delete_switch_provider`、`switch_provider`、`import_default_config`、`read_live_provider_settings`、`check_config_sync_status`、`sync_from_external_config` 都应视为 `dead`；初装引导当前只保留语音体验流程，不再允许通过 `config-switch`、插件推荐或配置切换 UI 重新接回这条旧链。

插件中心与桌面插件安装 / 管理命令族已经下线。`get_plugin_status`、`get_plugins`、`get_plugin_info`、`enable_plugin`、`disable_plugin`、`update_plugin_config`、`get_plugin_config`、`reload_plugins`、`unload_plugin`、`get_plugins_dir`、`list_plugin_tasks`、`get_plugin_task`、`cancel_plugin_task`、`get_plugin_queue_stats`、`install_plugin_from_file`、`install_plugin_from_url`、`uninstall_plugin`、`list_installed_plugins`、`get_installed_plugin`、`is_plugin_installed`、`get_plugins_with_ui`、`get_plugin_ui`、`handle_plugin_action`、`read_plugin_manifest_cmd`、`launch_plugin_ui`、`frontend_debug_log`、`plugin_rpc_connect`、`plugin_rpc_disconnect`、`plugin_rpc_call` 都应视为 `dead`；不得重新接回前端插件中心、DevBridge、mock 或 legacy host 注册。

图库素材链路也遵循同一原则。当前主入口为 `src/lib/api/galleryMaterials.ts`，统一承接：

- `create_gallery_material_metadata`
- `get_gallery_material_metadata`
- `get_gallery_material`
- `list_gallery_materials_by_image_category`
- `list_gallery_materials_by_layout_category`
- `list_gallery_materials_by_mood`
- `update_gallery_material_metadata`
- `delete_gallery_material_metadata`

旧 `poster_material_*` 命名只允许停留在 schema 迁移与治理守卫中，不应重新出现在前端网关、Rust 命令模块或运行时代码里。

模型 Provider 真相集同样遵循单一事实源。当前前端入口为 `src/lib/api/modelRegistry.ts` 与 `src/lib/api/apiKeyProvider.ts` 中的 App Server JSON-RPC methods：

- `model/list`
- `modelPreferences/list`
- `modelSyncState/read`
- `modelProvider/list`
- `modelProvider/catalog/list`
- `modelProvider/read`
- `modelProvider/create`
- `modelProvider/update`
- `modelProvider/delete`
- `modelProvider/sortOrders/update`
- `modelProvider/fetchModels`
- `modelProvider/testConnection`
- `modelProvider/testChat`
- `modelProviderConfig/export`
- `modelProviderConfig/import`
- `modelProviderKey/create`
- `modelProviderKey/update`
- `modelProviderKey/delete`
- `modelProviderKey/next`
- `modelProviderKey/usage/record`
- `modelProviderKey/error/record`
- `modelProviderUiState/read`
- `modelProviderUiState/write`
- `modelProviderAlias/read`
- `modelProviderAlias/list`

`lime-rs/resources/models` 本地模型 catalog 已下线；Provider 元信息以 `modelProvider/catalog/list` 为事实源，Provider 配置 / API Key / UI state / 连接测试 / 模型实时拉取均以 `modelProvider*` / `modelProviderKey*` / `modelProviderUiState*` App Server method 为事实源。Provider 实时 `/models` 的成功结果可以由 `ModelRegistryService` 持久化缓存 10 天，所有读取先查缓存再访问上游，但该缓存只保存真实接口结果，不得退化成本地 catalog 兜底。`get_model_registry_provider_ids` 仅作为兼容命令保留空结果，不应再读取本地资源、数据库或运行态缓存去“猜” provider 集合。旧 Provider façade 命令族已判为 `dead`：`get_api_key_providers`、`get_system_provider_catalog`、`get_api_key_provider`、`read_api_key_provider_config`、`add_custom_api_key_provider`、`create_api_key_provider`、`update_api_key_provider`、`delete_custom_api_key_provider`、`delete_api_key_provider`、`update_provider_sort_orders`、`update_api_key_provider_sort_orders`、`export_api_key_providers`、`export_api_key_provider_config`、`import_api_key_providers`、`import_api_key_provider_config`、`test_api_key_provider_connection`、`test_api_key_provider_chat`、`fetch_provider_models_auto`、`add_api_key`、`create_api_key_provider_key`、`delete_api_key`、`delete_api_key_provider_key`、`toggle_api_key`、`update_api_key_alias`、`update_api_key_provider_key`、`get_next_api_key`、`next_api_key_provider_key`、`record_api_key_usage`、`record_api_key_provider_key_usage`、`record_api_key_error`、`record_api_key_provider_key_error`、`get_provider_ui_state`、`read_api_key_provider_ui_state`、`set_provider_ui_state`、`write_api_key_provider_ui_state`；不得重新接回前端网关、Electron Host、DevBridge truth、mock priority、runtime surface、Tauri runner 或 Rust dispatcher。
同理，聊天运行时初始化的 `aster_agent_init` 在浏览器 DevBridge 模式下也不能再被放进 `mockPriorityCommands`。只要桥接在线，它就必须优先读取后端真实 `provider_name / model_name`，让聊天入口拿到当前运行时模型。
进一步地，围绕运行时模型解析的真相入口：`aster_agent_init`、`get_default_provider`、`model/list`、`modelProvider/list`、`modelProvider/catalog/list`、`modelProvider/fetchModels`、`modelProviderAlias/read`、`modelProviderAlias/list`、`get_model_registry_provider_ids`，在浏览器 DevBridge 模式下如果桥接失败，必须直接抛错，不能再通过 `safeInvoke` 静默退回 mock；否则前端会把“后端未连上 / 命令失败”误显示成假的 Provider / 模型列表。旧 `get_provider_pool_overview` 属于凭证池命令面，已随凭证池退役，不得重新作为运行时模型解析事实源。
同时要明确，`aster_agent_init` 只负责初始化 Agent，并不保证已经完成 Provider 配置；当它未返回 `provider_name / model_name` 时，前端不得把本地硬编码默认值当作真实模型，而应继续回退到 `get_default_provider` + 已配置 Provider/模型注册表解析链，拿到当前工作区真正可用的 `provider/model`。
同一条约束也适用于 Prompt Cache 能力判断：运行时与前端都不得因为某个自定义 Provider “长得像 Anthropic 协议”就推断它支持官方 Anthropic Automatic Prompt Caching。当前事实源必须继续按 ProviderType 判断：`anthropic` 走自动缓存能力，`anthropic-compatible` 只保留显式 `cache_control` 语义；若上游没有实现 Automatic Prompt Cache，`cached_input_tokens` 为空不能直接归因到 Lime 没发字段。

文档导出链路同样遵循这条路径。当前主入口为 `src/lib/api/document-export.ts`，统一承接：

- `save_exported_document`

`Artifact Workbench`、文档工作台与其他导出入口如需把内容落到用户选择的本地路径，应继续复用这条主链，不要在业务组件里重新扩散 `Blob + a.download` 式浏览器旁路。

AI 图层化设计工程目录落盘继续走 current `LayeredDesignDocument` 主链。当前前端入口为 `src/lib/api/layeredDesignProject.ts`，统一承接：

- `save_layered_design_project_export`
- `read_layered_design_project_export`

这组命令只允许把 `canvas:design` 导出的 `design.json / export-manifest.json / psd-like-manifest.json / preview.svg / preview.png / assets/` 写入或读回项目根目录下 `.lime/layered-designs/<document>.layered-design/`；它不是 provider adapter、不是旧 poster 协议，也不应回流 `poster_generate / canvas:poster / ImageTaskViewer`。

当前命令 owner 是 Electron Desktop Host 本地文件壳能力，前端只能经由 `src/lib/api/layeredDesignProject.ts -> safeInvoke(...) -> Electron Host IPC` 进入；旧 Rust `layered_design_cmd.rs` 只能作为 cleanup-only 迁移残留 / inner 测试来源，不得恢复旧命令宏 wrapper、runner 注册或 Rust DevBridge dispatcher 分支。

当 `export-manifest.json` 中存在 `source=reference` 且 `originalSrc` 为 `http/https` 的远程图片资产时，`save_layered_design_project_export` 可以在同一条 current 命令内把它们持久化缓存到 `assets/`，并把 manifest / PSD-like projection 更新为 `source=file + filename + originalSrc`。`read_layered_design_project_export` 读回时则优先从这些缓存文件水合 `design.json` 返回给前端，同时返回 `export-manifest.json` 与 `psd-like-manifest.json` JSON，确保 `DesignCanvas` 重新打开工程时继续得到可显示、可编辑的图片层，工程 smoke 也能核对专业投影质量事实，而不是再次依赖远程 URL 在线可达。

AI 图层化设计扁平图 OCR 分析同样继续走 current `LayeredDesignDocument.extraction` 主链。当前前端入口为 `src/lib/api/layeredDesignAnalysis.ts`，统一承接：

- `recognize_layered_design_text`
- `analyze_layered_design_flat_image`

`recognize_layered_design_text` 只服务 `analyzeLayeredDesignFlatImage` 的 OCR provider seam，把 native OCR 结果投影成可编辑 `TextLayer` 候选；非支持平台、非 `data:image/*;base64` 来源或无结果必须返回 unsupported/fallback，不应让拆层任务整体失败。
`analyze_layered_design_flat_image` 只服务 structured analyzer provider seam，把 native host 侧的 image / mask / clean plate 结构化结果投影回同一份 `LayeredDesignDocument.extraction`；不支持的来源必须返回 unsupported/fallback，不应绕过 `canvas:design -> DesignCanvas` 主链。它们都不是 provider adapter、不是旧 poster 协议，也不应回流 `poster_generate / canvas:poster / ImageTaskViewer`。
当前 Electron Host 可返回显式 `unsupported` fallback 作为 current 壳能力的 fail-closed 结果；native OCR / structured analyzer provider 未接入时，不得回退旧 Rust wrapper、mock 或 poster 协议伪造成功。

命令目录与输入补全链路同样需要单一事实源。当前前端主入口为 `src/lib/api/skillCatalog.ts`，统一承接：

- `bootstrap.skillCatalog`
- `GET /v1/public/tenants/{tenantId}/client/skills`
- 本地 seeded `SkillCatalog`

当前目录协议固定收敛到 `SkillCatalog.entries`：

- `entries.kind=command` 用于 `@` 原子命令
- `entries.kind=scene` 用于产品型 `/` 场景命令
- `entries.kind=skill` 用于首页与技能入口

固定约束：

- `CharacterMention`、`builtinCommands`、场景 slash 补全不得再各自维护一套业务命令静态常量
- 服务端尚未返回 `entries` 时，允许网关层从 legacy `items` 兼容投影出 `entries`
- 客户端必须保留 seeded fallback，不能因为服务端暂时不可用就让 `@配图`、`@海报`、`@配音`、`@浏览器`、`@PPT`、`@表单`、`@网页`、`@代码`、`@渠道预览`、`@上传`、`@发布`、`@发布合规`、`@搜索`、`@深搜`、`@研报`、`@站点搜索`、`@读PDF`、`@总结`、`@翻译`、`@分析`、`@转写` 这类主链入口失能
- `src/components/agent/chat/commands/catalog.ts` 只继续承接 Lime 本地 / Codex 原生命令；产品型 `/` 场景不应再长期硬编码在这里
- 若服务端下发的 `renderContract` 超出 Lime 当前支持范围，优先由服务端回退到已支持类型，客户端也必须退化到通用 timeline / artifact 展示
- `scene` 的展示命名、推荐文案和补参标题应继续围绕创作生产语义收敛；`@发布合规` 只是发布前风控检查，不应被产品文案扩写成独立“法务场景”，也不要在目录里长出“建立”这类脱离创作目标的泛入口

`SceneApp` 独立应用面已经下线，Plugin 是应用目录与运行时装配的 current 事实源。以下旧命令统一判为 `dead`，不得重新接回前端网关、Rust `generate_handler!`、DevBridge、mock 或启动关键真相命令：

- `sceneapp_list_catalog`
- `sceneapp_get_descriptor`
- `sceneapp_plan_launch`
- `sceneapp_save_context_baseline`
- `sceneapp_create_automation_job`
- `sceneapp_list_runs`
- `sceneapp_get_run_summary`
- `sceneapp_prepare_run_governance_artifact`
- `sceneapp_get_scorecard`

固定约束：

- 不再恢复 `sceneapps` 独立页面、`SceneAppsPageParams`、最近访问恢复或目录页运行时；应用入口继续收敛到 `plugin-lab` / Plugin 主链
- 不再恢复 `src/lib/sceneapp/catalog.ts`、`listSceneAppCatalog`、`SceneAppCatalog`、目录统计卡或目录卡片 view model；应用目录与运行装配继续由 Plugin current 协议承接
- 历史 `sceneapp_execution_summary` 只允许作为 Agent Chat / Automation 的只读结果摘要与灵感沉淀上下文保留，不能再触发新的 SceneApp 运行前规划、自动化创建、runs/scorecard 轮询或治理 artifact 动态准备
- 若后续需要应用级目录、安装、运行、复盘或治理摘要，应扩展 Plugin current 协议，而不是复活 `sceneapp_*` 命令族

Plugin current 安装 / package / UI runtime 主链不得在页面或 feature island 里直接 `safeInvoke` / `invoke`。应用中心的 package、installed lifecycle、uninstall 与 UI runtime 生命周期统一经由 `src/lib/api/plugins.ts -> AppServerClient.request(...)` 进入 App Server JSON-RPC：

- `pluginLocalPackage/inspect`
- `pluginPackage/fetchCloud`
- `pluginInstalled/save`
- `pluginInstalled/list`
- `pluginInstalled/disabled/set`
- `pluginInstalled/uninstall/rehearsal`
- `pluginInstalled/uninstall`
- `pluginHostLifecycle/list`
- `pluginShell/prepare`
- `pluginUiRuntime/start`
- `pluginUiRuntime/status`
- `pluginUiRuntime/stop`

旧 Tauri lifecycle facade 已退役，以下命令不得重新接回前端网关、Electron Host、Rust `generate_handler!`、DevBridge truth、mock priority 或 runtime surface：`plugin_inspect_local_package`、`plugin_fetch_cloud_package`、`plugin_save_installed_state`、`plugin_list_installed`、`plugin_set_disabled`、`plugin_uninstall_rehearsal`、`plugin_uninstall`。它们只允许作为 `agentCommandCatalog.deprecatedCommandReplacements`、contract forbidden snippet 或历史测试负向断言存在。

Plugin 仍有两类 Desktop Host 壳能力保留 legacy command name，但事实源不是旧 Tauri wrapper：

- `plugin_select_directory`：Electron Desktop Host directory picker current 能力，前端只能经由 `src/lib/api/plugins.ts -> selectPluginDirectory(...)` 使用。
- `plugin_launch_shell`：Electron Desktop Host App Shell window current 能力，前端只能经由 `src/lib/api/plugins.ts -> launchPluginShell(...)` 提交 `ShellDescriptor`；Electron Host 必须通过 App Server `pluginShell/prepare` 校验 descriptor、installed state、package / manifest hash、install mode、runtime profile shell kind 与只读隔离策略，再通过 `pluginUiRuntime/start` 启动 UI runtime 并打开独立 BrowserWindow。它不是第二套 Runtime，也不得让 Standalone App 绕过 `@lime/app-sdk`、Host Bridge、policy 或 evidence 主链。

`pluginPackage/fetchCloud` 只负责 `packageUrl -> staging/cache -> APP.md manifest extraction -> sha256 package / manifest verification`，不生成 projection、不绕过 P17.2 install review；installed state 写入只走 `pluginInstalled/save`。Cloud / LimeCore 仍只提供 release metadata。

`pluginUiRuntime/start` 启动 App UI 子进程时只能注入 Lime 本机 Gateway 的短期 Plugin scoped token；不得把上游 Provider API Key 或全局 `server.api_key` 原样下发给 App。当前 token scope 固定为 `model-generation`，只允许 App 侧通过 `LIME_GATEWAY_BASE / LIME_ACCESS_TOKEN` 调 Lime Gateway 标准 `/v1/chat/completions` 或 `/v1/messages` 生成端点；图片、count tokens、Gemini 原生和其他控制面端点仍只接受全局 Gateway key。

`pluginUiRuntime/start/status/stop` 可以返回 `taskRuntime` readiness 合同，用于说明 installed state 中声明的 `runtimePackage.worker` / `agentRuntime.worker/tasks` 是否可被后续 Plugin task worker executor 使用。该字段只做宿主能力投影和启动链证据，不执行 worker、不下发 Provider Key、不替代 `plugin_runtime_* -> agentSession/turn/start` 的 current task 主链。

Claw / Aster 原完整执行链是 Agent 对话 runtime 的 current 参考实现，不应被前端 `agentRuntime` 模块或 Plugin UI runtime 替代。迁移方向是把 Claw 原链整体直迁到 App Server `RuntimeCore -> AsterBackend -> backend host`，让 Claw 与 Plugin 后续对话 turn 共用 `agentSession/start + agentSession/turn/start + agentSession/event + agentSession/read`。`src/lib/api/agentRuntime/*` 只允许作为前端 thin client gateway / compat projection，负责把旧 UI 形状投影到 App Server current method；它不是第二套业务 runtime，不得在其中补模型执行、事件合成、read model 拼装或 mock fallback。`pluginUiRuntime/*` 只负责 Plugin UI 子进程 `start/status/stop/entryUrl` 生命周期，不承接对话 turn、tool runtime、evidence 或 Claw/Aster 私有请求合同。

当前 `AppServerBackendMode::Runtime` 已承接真实 Claw / Aster 执行链，但它只能被视为 App Server 内部的受控 runtime backend adapter，不是继续在 App Server 顶层复制 Aster / Agent runtime 的许可。直接 Aster 耦合、tool 注册与 `stream_reply` 执行流只能停留在已登记的 `runtime_backend` 适配边界并继续向 `lime-agent` / RuntimeCore 收缩；已知越界文件必须回挂执行计划并只许减少，不许扩展。新增同类执行能力优先迁入 `lime-agent`、`runtime-core`、`lime-rs/crates/agent` 或既有 `runtime_backend/**` 子模块。独立 `backend_mode=aster` 继续按 `dead / forbidden-to-restore` 处理，不得回到 CLI、daemon、Electron Host 或发布配置。

`ExternalBackend` 不是生产第二 runtime。它只允许作为 `compat / controlled-fixture` 留在 standalone CLI、SDK smoke、Electron dev 显式 override 和受控外部事件接入测试中；Electron Host 与开发 sidecar 默认必须继续使用 `runtime`，SDK standalone 默认必须继续是 `unavailable`。使用 `external` 时必须显式提供 `APP_SERVER_BACKEND_COMMAND` / `--backend-command`，不得把 external 写成 Electron packaged 默认、发布配置默认或 App Server current 执行链的替代 owner。

这条边界参考 `/Users/coso/Documents/dev/rust/codex/codex-rs`：Codex app-server 只把 JSON-RPC `turn/start` 投影成 core `Op::UserInput` 并交给 `ThreadManager / CodexThread`，模型采样、tool router、审批 / 沙箱与执行循环都在 core / exec-server 边界。Lime 后续应按同样分层收敛，不能把 `AppServerBackendMode::Runtime` 理解成 App Server 顶层继续复制 Aster turn loop 的许可。

App Server 初始化 Agent runtime 时只能通过 `lime-rs/crates/app-server/src/agent_runtime_registry.rs` 触发 `lime_agent` runtime 初始化；LocalAppDataSource、命令处理与其他数据源层不得直接 import `lime_agent::initialize_aster_runtime`。Skill 安装、导入、卸载或脚手架创建后需要刷新运行时 Skill registry 时，LocalAppDataSource 只能通知 `lime-rs/crates/app-server/src/skill_registry.rs`。`local_data_source/skills/**` 不得直接 import `lime_agent::AsterAgentState` 或调用 `lime_agent::reload_lime_skills`；这类调用属于 runtime / skill registry 边界，不属于数据源层职责。

Knowledge Builder 的真实 Skill prompt / workflow 执行边界已下沉到 `lime-rs/crates/agent/src/knowledge_builder_skill.rs`。App Server 侧 `lime-rs/crates/app-server/src/runtime_backend/knowledge_builder_runtime.rs` 只允许做 `KnowledgeBuilderRuntimePlan -> KnowledgeBuilderSkillRequest -> KnowledgeBuilderRuntimeExecution` 投影和 adapter 接线，不得重新直接 import 或调用 `execute_skill_prompt`、`execute_skill_workflow`、`SkillPromptExecution`、`SkillWorkflowExecution`。后续若要统一到 `agentSession/turn/start`，应继续向 RuntimeCore / lime-agent 主链收敛，而不是在 App Server 新增平行 Skill 执行器。

主 Agent turn 的真实 Aster streaming loop 调用边界已下沉到 `lime-rs/crates/agent/src/turn_execution.rs`。App Server `runtime_backend.rs` 可以继续负责 provider route、request tool policy 与 RuntimeEvent 投影，但不得直接 import / 调用 `stream_reply_with_policy`、自行创建 cancel token 生命周期或重新实现回合 streaming loop。`lime-rs/crates/app-server/src/runtime_backend/request_context.rs` 已拆成主 facade 加 `request_context/session_config.rs`、`turn_context.rs`、`workspace_scope.rs` 三个职责子模块；后续不得把 SessionConfig / TurnContext / workspace scope 逻辑折回主文件，继续治理时应优先把可下沉的 turn context / provider selection 语义迁到 `lime-agent` 或 RuntimeCore。

主 Agent turn 的 Aster `SessionConfig` 构造边界已下沉到 `lime-rs/crates/agent/src/session_configuration.rs`。App Server `runtime_backend/request_context/session_config.rs` 只允许准备 system prompt、turn context 和 trace 开关，然后调用 `build_agent_session_config`；不得直接使用 `SessionConfigBuilder` 或返回 `aster::agents::SessionConfig`。

主 Agent turn 的 Aster `TurnContextOverride` / `TurnOutputSchemaSource` 类型构造边界已下沉到 `lime-rs/crates/agent/src/turn_context_configuration.rs`。App Server `runtime_backend/request_context/turn_context.rs` 只允许把 cwd、model、effort、approval / sandbox、collaboration mode、user-visible input、output schema 和 metadata 投影成 `AgentTurnContextConfigurationRequest`，再调用 `build_agent_turn_context`；image presentation、workspace patch host tool 和 live execution process 只能通过 `set_agent_turn_output_schema`、`insert_agent_turn_metadata`、`agent_turn_context_metadata` 等 `lime-agent` façade 读写 turn context 语义，不得直接引用 `TurnContextOverride` 或 `TurnOutputSchemaSource`。后续若继续收缩，应优先把 provider route selection 继续迁入 `lime-agent` / RuntimeCore，而不是让 App Server 重新承接 Aster session 配置细节。

运行时 Provider 配置 façade 已下沉到 `lime-rs/crates/agent/src/provider_configuration.rs`。App Server `runtime_backend/provider_config.rs` 只允许传递 App Server `ProtocolKind`、保留 runtime database 初始化、`model.effective` 事件构造和 `configure_provider_for_session` 接线；`ProtocolKind -> ModelProviderProtocol -> RuntimeProviderProtocol` 映射与 direct `ProviderConfig` 的协议回填都属于 `lime-agent` provider_configuration 边界。App Server 不得直接调用 `AsterAgentState.configure_provider` / `configure_provider_from_pool`，不得直接引用 `AsterProviderProtocol` 或 `RuntimeProviderProtocol`，也不得恢复 `provider_config_from_pool` / `provider_config_with_route_protocol` 这类 App Server 本地配置 helper。

禁用工具的受控文本生成边界已下沉到 `lime-rs/crates/agent/src/direct_text_generation.rs`。Plugin worker host-managed generation 的声明解析、prompt 拼装、多段文本生成 loop 和 status envelope helper 已进一步下沉到 `lime-rs/crates/agent/src/host_managed_generation.rs`；App Server `runtime_backend/plugin_worker_generation.rs` 只允许解析 provider route、配置本回合 provider，并调用 `run_host_managed_generation`。Image task presentation adapter 只允许解析 provider route、构造 presentation turn context 并调用 `run_direct_text_generation`。这些 App Server adapter 不得重新直接 import `stream_reply_with_policy`、`resolve_request_tool_policy_with_mode`、`RequestToolPolicyMode`、`SessionConfigBuilder` 或 `DirectTextGenerationRequest` 来复制一段 Aster streaming loop。若后续需要新的受控模型首刀，应复用 `host_managed_generation` / `direct_text_generation` 的 lime-agent 边界或统一进入 `agentSession/turn/start`，不能在 App Server adapter 里新开平行执行器。

Image / memory 原生 Tool 实现边界已下沉到 `lime-rs/crates/agent/src/native_tools/**`。`lime-agent` 负责 Aster `Tool` 实现、工具 schema、参数解析、权限检查和 `ToolResult` 投影；App Server 侧 `runtime_backend/image_tools.rs` 与 `runtime_backend/memory_tools.rs` 只允许实现 `ImageTaskGateway` / `MemoryStoreGateway`，把 `AppDataSource` 调用投影给 `lime-agent`。这两个 App Server adapter 不得重新出现 `impl Tool for`、`ToolContext`、`ToolError`、`PermissionCheckResult`、`ToolOptions` 或本地 `input_schema`，也不得把 media / memory 工具执行扩成新的 App Server runtime。

Workspace patch host tool request 的解析、Aster tool registry 批执行与 evidence 拼装边界已下沉到 `lime-rs/crates/agent/src/agent_tools/workspace_patch_host.rs`。`lime-agent` 负责读取 `hostToolRequests` / legacy `searchRequests`、读取 Aster `tool_registry()`、执行 planned tool batch、生成 planned tool evidence、回写 workspace patch；App Server 侧 `runtime_backend/workspace_patch_host_tools.rs` / `workspace_patch_host_execution.rs` 只允许提取 RuntimeEvent 中的 artifact patch、构造 turn context、初始化当前 host tool surface 并包装 tool runtime event，不得重新承接 host tool request parser、直接读取 Aster tool registry、直接调用 planned batch executor 或拼装 `hostToolEvidence`。

Tool inventory 的 Aster registry / extension snapshot 边界已下沉到 `lime-rs/crates/agent/src/agent_tools/tool_inventory_runtime_snapshot.rs`，inventory 投影仍由 `lime-rs/crates/agent/src/agent_tools/inventory.rs` 承接。`lime-agent` 负责读取 Aster `tool_registry()`、`get_extension_configs()`、`list_tools()`，并把 MCP bridge tools 合并为 runtime extension surface；App Server 侧 `runtime_backend/tool_inventory.rs` 只允许读取 AppDataSource 的 MCP server/tool snapshot、合并 persisted/runtime metadata，并调用 `read_agent_tool_inventory_runtime_snapshot` + `build_tool_inventory` 投影 `agentSession/toolInventory/read` read-model，不得重新直接引用 `ExtensionConfig`、`ExtensionToolInventorySeed` 或读取 Aster tool registry。

Execution process 的 shell tool canonicalization、Aster `BashTool` / `PowerShellTool` registry 权限预检和本地进程启动 façade 属于 `lime-rs/crates/agent/src/agent_tools/tool_orchestrator.rs` / `agent_tools/execution` 边界。App Server `execution_process.rs` 只允许实现 JSON-RPC process control / stdin / interrupt / terminate / drain 输出 read-model，并调用 `check_shell_tool_permissions` / `start_local_execution_process` 等 `lime-agent` façade；不得直接 import `aster::tools`、注册 `BashTool` / `PowerShellTool`、构造 `ToolRegistry` 或在 App Server 复制 shell tool permission surface。

前端从本地存储恢复出的 Agent session id 在发送前必须先被 App Server `agentSession/read` 确认存在且归属当前 workspace。明确 `session not found` 或 workspace mismatch 时只能丢弃本地恢复快照并创建新的 App Server session；普通 bridge / network error 必须 fail closed，不得静默创建会话或继续轮询 stale session。Electron `safeInvoke` 返回的 App Server JSON-RPC result envelope 也必须在 `src/lib/api/appServer.ts` 网关层统一解包，业务页面不得各自猜测 `{ result: { lines } }` / `{ lines }` 形状。

`plugin_runtime_*` 是 Plugin 进入 App Server / AgentRuntime 主链的 Desktop facade：`plugin_runtime_start_task` 必须经 App Server JSON-RPC `agentSession/turn/start` 进入 `RuntimeCore -> AsterBackend -> backend host`，不能再直接复制 `AsterChatRequest -> build_queued_turn_task` 提交流程。`startTask.turnConfig` 必须随 facade 透传，并写入 `RuntimeOptions.hostOptions.asterChatRequest`：扁平 `AsterChatRequest` 字段供 Desktop Aster host 恢复 Claw 原链，`turn_config` 镜像供外部 App Server backend 读取 provider*config / system_prompt / reasoning / sandbox 等配置。cancel / read / host response 必须继续向 App Server current method 收敛；App Server protocol 尚未覆盖时应 fail closed 或登记阻塞，不得继续适配到既有 `agent_runtime*_`读写命令，不得复制 Claw`skill_launch.rs`，不得新增垂直 `content_factory`Agent 命令，也不得把`LIME_GATEWAY_\*` 直接模型调用宣称为完整 Agent 能力。

P17.3 之前禁止真实删除 Plugin 本地数据：`plugin_uninstall_rehearsal` 只生成 keep-data / delete-data 演练，`plugin_uninstall` 只能返回同一演练摘要和未删除的 installed list，不得执行 `remove_file` / `remove_dir_all` 或移除 installed state。真实 delete-data 必须等后续路线图单独打开并补齐 evidence / residual audit / confirmation gate。

技能脚手架创建同样只允许走当前命令网关主链：

- 前端统一经由 `src/lib/api/skills.ts -> create_skill_scaffold_for_app`
- 参数统一放在嵌套 `request` 对象里，不要再散落平铺字段
- 当前允许的结构化骨架字段除了 `target / directory / name / description` 之外，还包括：
  - `whenToUse`
  - `inputs`
  - `outputs`
  - `steps`
  - `fallbackStrategy`
- 聊天结果沉淀为技能时，只能继续扩这组说明型字段，不要再平行发明第二套“技能草稿协议”

Skill Forge Capability Draft 命令链也必须停留在独立的生成 / 验证 / 注册边界：

- 前端统一经由 `src/lib/api/capabilityDrafts.ts` 承接：
  - `capability_draft_create`
  - `capability_draft_list`
  - `capability_draft_get`
  - `capability_draft_verify`
  - `capability_draft_register`
  - `capability_draft_list_registered_skills`
  - `capability_draft_submit_approval_session_inputs`
  - `capability_draft_execute_controlled_get`
- `capability_draft_create/list/get/verify/register/list_registered_skills` 只服务 `Capability Draft -> Workspace-local Skill package -> registered discovery` 的事实链，不是 runtime 执行入口
- `capability_draft_submit_approval_session_inputs` 只做 session-scoped approval 输入校验；`capability_draft_execute_controlled_get` 只做一次性受控 GET 门禁并返回当前命令 evidence，正向 / `request_failed` 只落非敏感 evidence artifact，不保存 endpoint/token/response preview、不进入 scheduler 或默认 tool surface
- `capability_draft_register` 只允许把 `verified_pending_registration` 草案复制到当前 `workspaceRoot/.agents/skills`，并记录来源、verification report 与权限摘要；它不得调用 Skill reload、不得修改 seeded skill、不得把能力直接放进默认 tool surface
- `capability_draft_list_registered_skills` 只能显式按 `workspaceRoot` 读取当前项目 `.agents/skills` 中带 `.lime/registration.json` 的 P3A 注册能力；它只做 catalog discovery / provenance projection，不得把能力合并进默认已安装方法列表、不得触发 runtime binding、不得展示运行或自动化入口
- App Server `evidence/export` 可以按当前 session 消费 `.lime/capability-drafts/controlled-get-evidence/*.json` 的非敏感摘要；旧 `agent_runtime_export_evidence_pack` 只允许作为 retired guard / 历史 evidence。该摘要只用于 evidence pack 可读性，不代表 capability draft 已进入 Query Loop、runtime、scheduler 或 default tool surface
- 注册后的执行仍必须回到 `agentSession/turn/start -> Query Loop -> tool_runtime -> artifact/evidence` 主链，不能在 Capability Draft 命令里新增平行运行、调度或外部写协议

Skill Forge P3C runtime binding 第一刀必须回到 App Server current 主链：

- 当前前端入口为 `src/lib/api/agentRuntime/inventoryClient.ts` 中的 `listWorkspaceSkillBindings`
- current App Server method 为 `workspaceSkillBindings/list`；旧 `agent_runtime_list_workspace_skill_bindings` 只允许作为 retired guard / 历史 evidence / test-only mock 名称存在，不得作为新增 runtime / binding 能力入口
- 该 method 只做 `workspaceRoot -> P3B registered skills -> binding readiness / next gate` 的只读投影
- 返回结果必须默认标记 `queryLoopVisible=false`、`toolRuntimeVisible=false`、`launchEnabled=false`，不能因为出现 `ready_for_manual_enable` 就把 skill 自动注入 Query Loop、SkillTool registry 或默认 tool surface
- 它可以说明哪些 registered skill 已经具备后续接入候选资格，但真正执行仍只能通过后续 `agentSession/turn/start -> Query Loop -> tool_runtime -> artifact/evidence` 完成
- 不得把这类 runtime binding 状态继续塞回 `capability_draft_*` 命令族；`capability_draft_*` 只到 generation / verification / registration / discovery

Skill Forge P3D Query Loop metadata 第一刀继续走 App Server `agentSession/turn/start`，不是新增命令面：

- 当前 metadata contract 为 `request_metadata.harness.workspace_skill_bindings`，兼容读取 `workspaceSkillBindings`
- 前端裁剪入口为 `src/components/agent/chat/utils/workspaceSkillBindingsMetadata.ts`；它只输出 snake_case metadata fragment，不写入 `allow_model_skills`
- 当前 prompt 投影 owner 是 Agent Runtime / RuntimeCore current 主链与 `lime-rs/crates/agent/src/turn_input_envelope.rs` 的 prompt stage contract；旧 `lime-rs/src/commands/aster_agent_cmd/workspace_skill_binding_prompt.rs` 只允许从 git history / 执行计划只读参考，不是新增 prompt 投影落点
- 该投影最多展示 5 个 binding，只用于说明候选能力、`binding_status`、`next_gate`、权限摘要和来源；不得把它当作 Query Loop 已启用工具清单
- 当 `query_loop_visible=false`、`tool_runtime_visible=false` 或 `launch_enabled=false` 时，模型不得声称已运行、不得调用未授权 Skill、不得创建 automation / scheduler / job
- P3D 不注入 `SkillTool` registry，不改变 `agentSession/turn/start` 的默认 tool surface；真正执行仍必须等后续 `tool_runtime` 授权裁剪和 session 显式 enable

Skill Forge P3E tool_runtime authorization 第一刀仍继续走 App Server `agentSession/turn/start`，不是新增命令面：

- 当前 enable metadata contract 为 `request_metadata.harness.workspace_skill_runtime_enable`，兼容读取 `workspaceSkillRuntimeEnable`
- 前端裁剪入口继续收在 `src/components/agent/chat/utils/workspaceSkillBindingsMetadata.ts` 与 `buildHarnessRequestMetadata`；该 metadata 输出 `source=manual_session_enable`、`approval=manual`、`workspace_root` 和 ready binding 列表，但不写入 `allow_model_skills`
- Runtime binding readiness owner 是 App Server `workspaceSkillBindings/list` 与 `lime-rs/crates/app-server/src/local_data_source/skills/workspace.rs`；它只投影 current workspace 的 `ready_for_manual_enable` 候选，并继续要求 registered skill directory 位于当前 workspace `.agents/skills` 下且带 verification provenance
- SkillTool 授权 gate owner 是 `lime-rs/crates/agent/src/tools/skill_tool_gate.rs`；Runtime 只在当前 session scope 内加载 workspace-local skills，并把 `SkillTool` 裁剪到 `project:<directory>` / `<directory>` allowlist；未列入 allowlist 的 Skill 调用必须被拒绝
- P3E 只表示“当前 session 显式启用并可调用”；不得把它扩写为长期 Agent、automation、scheduler、marketplace 或跨 workspace 共享
- `workspace_skill_bindings` 仍是只读候选 metadata；只有 `workspace_skill_runtime_enable` 才能触发 session SkillTool enable 与授权裁剪

当前 `/scene-key` 的发送主链也已经固定：

- 发送前由 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 统一拦截 slash 场景
- 运行时只从统一 catalog 解析 `scene -> linkedSkillId -> ServiceSkillHomeItem`，并把结构化上下文写入 `request_metadata.harness.service_scene_launch`
- Agent Runtime current 主链会把这类 turn 统一切到 `workbench`，并通过 prompt context 强约束当前回合直接按本地 `service_scene_launch` 上下文执行；如果实现里仍保留 `lime_run_service_skill` 这类历史命名，也只允许视为 compat 护栏，不属于 current 主链
- `service_scene_launch` 只表达“目录命中 + 本地运行时路由提示”，不表达服务端 run / poll；slash scene 不应在前端或 Rust 侧继续扩成云端执行协议
- 客户端当前职责固定为 catalog 解析、metadata 注入、seeded/fallback 托底与本地 runtime dispatch
- 未命中统一 scene 目录的 slash 文本必须继续回到普通 slash / Codex 命令流，不能误报本地 Skill 不存在
- `/scene` 的长期产品真相应落在 `Scene Skill`；`site_adapter` 只是 step provider，不是独立执行面
- 如果 scene 缺少 URL、项目等必填输入，前端不应只 toast 结束；应打开统一 `scene gate`，由 `slotSchema` / `readinessRequirements` 驱动补参
- 如果某个 scene 背后绑定的是 `site_adapter / browser_assist` 型技能，前端可以继续只暴露 `scene`，不必把底层 site skill 再平铺成首页目录项；但运行时解析 `scene -> linkedSkillId` 时必须能回退完整 `ServiceSkill` 目录，而不是只看首页可见 skill 列表，否则会出现目录可见但执行找不到 skill 的协议漂移
- 如果某个 `site_adapter / browser_assist` scene 还声明了 `readinessRequirements.requiresProject=true`，或 `saveMode=project_resource` 需要真实项目目录，输入框 slash 发送时必须沿用当前选中的项目；若当前没有项目，前端必须通过 `scene gate` 收集项目，不能静默 `getOrCreateDefaultProject()` 把结果写进 default 项目
- scene 或技能补参继续只声明 `slotSchema`；若后续要在 GUI 里补 `a2ui` 表单，也只能作为渲染层实现细节，不能把 `a2ui` 类型耦合进 `SkillCatalog`、`request_metadata.harness` 或宿主命令契约

如果这轮改动触达了 `client/skills` 协议，不仅要改 Lime 前端 selector，还要同步检查 `limecore` 的：

- OpenAPI source fragments
- `packages/types`
- `packages/api-client`
- `control-plane-svc` skill catalog service 与路由测试

媒体生成任务链路同样需要单一事实源。当前真正的事实源应收敛到标准 `.lime/tasks/<task_type>/*.json` artifact + 同一条 worker 执行链；CLI、App Server / Desktop command 和 agent tool 都只能作为这条事实源的不同入口，不能各自演化协议。现有外部 CLI 入口至少覆盖：

- `lime media image generate`
- `lime media cover generate`
- `lime media video generate`

这些命令统一产出 `.lime/tasks/<task_type>/*.json` artifact 与稳定 JSON 输出。仓库内现有 `lime_create_*_generation_task`、`social_generate_cover_image` 与相关 legacy adapter / agent tool 入口在兼容期内允许保留，但也必须继续委托同一套任务文件与输出契约，不要再长出第三套“媒体任务协议”。

`Claw` 的图片任务当前已经收敛到同一条 current 主链：

- Agent 驱动的图片命令与显式图片动作：`@配图` / `@修图` / `@重绘` / `@image` / `/image`，以及文稿 inline 配图、封面位、图片工作台编辑/变体、带引用图或带参考图的动作，都必须先进入 Agent turn。纯文本入口由 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 保留原始用户文本发送；显式动作则由 `src/components/agent/chat/workspace/useWorkspaceImageWorkbenchActionRuntime.ts` 组装同构的 `image_task` 上下文后，再复用统一发送主线。两类入口都会把结构化 `image_task` 写入 `request_metadata.harness.image_command_intent.image_task`。App Server RuntimeBackend 会在普通聊天模型路由前识别 ImageCommandWorkflow，并创建标准 `image_generate` task artifact + worker 执行链；旧 `request_metadata.harness.image_skill_launch` 只允许作为短期输入桥被标准化，不能作为 current 事实源、正向断言或新入口命名。统一目录显式声明的图片模型绑定标签，例如用户在“设置 -> AI 服务商”里从已配置 Provider 模型创建的 `@Nano Banana 2` / `@GPT Images 2`，或 Lime Cloud 下发的同构 command entry，也必须进入同一 `image_command_intent` 回合；这些标签只表示“用户指定了图片执行模型”，发送边界必须把 `entry_source / provider_id / model / executor_mode / modality_contract_key / runtime_contract / routing_slot` 作为路由上下文并入 `image_task`，不得绕过 Agent / workflow 编排去前端创建任务。未在 catalog 中声明的任意 `@模型名` 不得自动变成图片 API 入口。当前 `@配图` / `@海报` 的唯一 current 执行面是 `ImageCommandWorkflow -> mediaTaskArtifact/image/create -> image task worker`；旧的 `Skill(image_generate)` 首发链、`Bash -> lime media image generate --json` 与 `lime task create image --json` 只允许停留在 compat / manual guard 或人工 CLI 场景，不能再被当成首发路径。即使经过 compat 入口，最终也必须复用同一个 `image_generate` task artifact + worker 执行链，且忽略 `outputPath` 这类非标准落盘出口，最终仍只落到标准 task file。
- 显式图片动作如果先在前端补好了 `image_command_intent` metadata，也必须继续复用统一发送边界去绑定真实 `session_id`。不要在图片动作侧为了拿 `session_id` 再额外 `createFreshSession(...)`，否则一次 `@配图` 会被拆成两个对话；当前正确做法是允许 metadata 先带本地 draft key，再在发送前统一替换成真实会话 ID。
- 图片结果展示固定继续走 `聊天轻卡 -> 图片工作台` 主链：通用 `tool_result` 只保留 timeline 与轻卡，不应把空内容的 `.jpg/.png/.webp` 二进制结果再镜像成通用 artifact 卡片；否则会出现重复 `output_image.jpg`、路径不一致导致去重失败、以及点击后无法在文本 workbench 打开的错误体验。
- 通用 artifact 层对同一路径必须做等价归一：`basename / 相对路径 / 绝对路径` 在前端应视作同一文件；`tool_result` 来源的产物默认后台更新，不自动选中、不自动展开工作台，避免命令执行过程中抢焦点。
- 图片 task 控制面：`src/lib/api/mediaTasks.ts` 继续承接 task control / replay / recovery，而不是首发入口：

- `create_image_generation_task_artifact`
- `get_media_task_artifact`
- `list_media_task_artifacts`
- `cancel_media_task_artifact`

无论入口来自纯文本命令、图片模型绑定标签、slash scene 组合还是显式图片动作，最终都只允许写入当前项目根目录下的标准 `image_generate` task file，并写入 `session_id / project_id / content_id / entry_source / mode` 等上下文。若当前来源是图片模型绑定标签，还必须额外保留显式 `provider_id / model / executor_mode`，不能从当前聊天模型选择里推断图片执行模型。若当前来源是文稿 inline 配图，还会继续写入 `usage=document-inline`，并以 `relationships.slot_id` 作为正文占位块与后续任务回填的正式绑定字段；payload 中的 `slot_id` 仅保留兼容读取。若前端已经能推断目标小节，还应继续把 `anchor_section_title` 写入 task payload；若还能识别用户当前选中的具体段落，还应继续把裁剪后的 `anchor_text` 一并写入，用于正文占位图与最终图片的 paragraph 级原位落位。聊天区动态占位、正文占位替换、结果回填、刷新恢复都必须继续以 `.lime/tasks` 为唯一事实源，不允许重新回到前端直调图片服务。

- `.lime/tasks/**/*.json` 本身是内部任务状态快照，不是面向用户的正式产物。聊天区 artifact 卡片、时间线 file artifact 与默认文件面板都应把这类 JSON 隐藏掉；它们只服务恢复、轮询、取消、重试和诊断，真正给用户看的应该是轻量结果卡、tool timeline 与右侧 viewer。

当 binding registry 判定某个能力属于 `typed local_cli` 时，Workspace `Bash` 运行时才负责解析同名 `lime` 入口：开发态优先回落到 `cargo run -p lime-cli`，打包态优先使用随应用提供的 CLI 二进制。这里的 `Lime CLI` 是统一执行 facade，不是模型规划语言；如果某个能力当前仍属于原生结构化 binding 或 `server_api / hybrid`，CLI 只能停留在 compat / ops 兜底，不应抢 current 首发路径。

Skill 执行链路同样遵循单一命令边界。当前前端入口为 `src/lib/api/skill-execution.ts`，统一承接：

- `execute_skill`
- `list_executable_skills`
- `get_skill_detail`

其中 `execute_skill` 当前除了 `skillName / userInput`，也允许继续携带 `images` 与 `requestContext`。这条扩展仍服务带图片输入、显式 skill 执行或 compat 续接场景，但它已经不是 `Claw @配图` 纯文本命令的 current 主链。当前主链必须优先保留原始用户消息进入 Agent turn，再由 App Server `ImageCommandWorkflow` 在普通聊天模型路由前创建标准图片任务；不要重新回到前端预翻 slash skill、模型首刀调用 `Skill(image_generate)`、前端直建图片任务或其它并行入口。

`Claw` 的纯文本封面命令也应沿同一条 current 主链收敛：

- Agent 驱动的封面命令：`@封面` / `@cover` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `cover_task` 写入 `request_metadata.harness.cover_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会把当前 turn 固定为 workbench chat mode，并注入只允许首刀优先调用 `Skill(cover_generate)` 的系统提示；当前封面 launch 还会在 session permission 中显式压制 `ToolSearch / WebSearch / Read / Write / Edit / Bash / Glob / Grep / social_generate_cover_image / lime_create_image_generation_task` 这类偏航工具，并在当前 session registry 中直接移除这些 detour tools，避免模型在 `@封面` 首刀前先去搜索工具目录、生成 HTML/SVG 假封面，或把封面退回普通 image task。后续默认 skill 必须先进入 `cover_generate` 的 current binding，并通过 `lime_create_cover_generation_task` 回写标准 `cover_generate` task file；旧的自由 Bash / CLI 拼接只允许停留在人工 ops 或 compat 场景，不能再作为模型首发路径。

`Claw` 的纯文本海报命令也应沿同一条 current 主链收敛：

- Agent 驱动的海报命令：`@海报` / `@poster` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把解析后的平台、风格、尺寸 / 比例重新组装进 `request_metadata.harness.image_command_intent.image_task`；它不是新的 `poster_task` 协议，而是继续委托 `ImageCommandWorkflow` 创建标准 `image_generate` task artifact。当前 `@海报` 会默认补齐“海报设计”语义，并将默认尺寸收敛为 `4:5 -> 864x1152`，同时把 `entry_source` 写为 `at_poster_command`。当前 workflow 必须直接调用 `mediaTaskArtifact/image/create`；旧的 Skill/Bash/CLI 图片入口只允许停留在 compat 或手工 CLI 场景，最终仍只允许落到标准 `image_generate` task file。

`Claw` 的纯文本视频命令也应沿相同心智收敛：

- Agent 驱动的视频命令：`@视频` / `@video` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `video_task` 写入 `request_metadata.harness.video_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(video_generate)` 的系统提示；当前视频 launch 还会在 session permission 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类偏航工具，并在当前 session registry 中直接移除这些 detour tools，避免模型在 `@视频` 首刀前先去搜索工具目录。后续默认 skill 必须先进入 `video_generate` 的 current binding，并最终落到 App Server `mediaTaskArtifact/video/create|get|list|cancel` 任务 artifact 主链；若当前 binding family 被注册为 `typed local_cli`，runtime 可以结构化组装 `lime media video generate --json` 作为 skill executor，但该 executor 也必须写回同一条 task artifact 主链。`lime_create_video_generation_task` / `create_video_generation_task` 旧视频 facade 已归类为 `dead / retired guard-only`，不得作为 Skill 不可用时的 fallback；Skill 或 binding 不可用时应 fail closed 并报告视频生成绑定不可用，不能伪造任务已提交。
- 前端消费层不再把 `@视频` 当成图片任务特判。当前聊天区通过统一 `taskPreview` 消费 `video_generate` 任务摘要，点击结果卡后直接复用现有 `VideoCanvas / VideoWorkspace` 打开右侧 viewer；运行中的视频任务则由 `useWorkspaceVideoTaskPreviewRuntime` 基于 `videoGenerationApi.getTask(...)` 轮询回流状态与结果 URL。

`Claw` 的纯文本播报命令也应沿同一条 current 主链收敛：

- Agent 驱动的播报命令：`@播报` / `@播客` / `@broadcast` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `broadcast_task` 写入 `request_metadata.harness.broadcast_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(broadcast_generate)` 的系统提示；当前播报 launch 还会在 session permission 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类偏航工具，并在当前 session registry 中直接移除这些 detour tools，避免模型在 `@播报` 首刀前先去搜索工具目录。后续默认 skill 必须先进入 `broadcast_generate` 的 current binding；若当前 binding family 被注册为 `typed local_cli`，则由 runtime 结构化组装等价的 `lime` 播报任务命令；CLI 不可用时再回退 `lime_create_broadcast_generation_task`。无论选择哪种 executor，最终仍只允许落到标准 `broadcast_generate` task file；若当前上下文缺少待整理原文，允许 Agent 最多追问 1 个关键问题，但不能伪造“播报已完成”。

`Claw` 的纯文本素材命令也应沿同一条 current 主链收敛：

- Agent 驱动的素材命令：`@素材` / `@资源` / `@resource` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `resource_search_task` 写入 `request_metadata.harness.resource_search_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(modal_resource_search)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类 detour tools，避免模型卡在“先搜技能/工具目录”而不是立刻进素材技能主链。若 `resource_type=image` 且 query 明确，默认 skill 必须优先调用 `lime_search_web_images`，直接复用现有“设置 -> 系统 -> 网络搜索 -> Pexels API Key”返回候选，并保留真实 tool timeline；只有 `Pexels API Key` 未配置、无结果，或用户明确要求继续异步追踪时，才允许 runtime 进入 task 型执行 binding。对 `bgm / sfx / video` 等非图片素材，当前应直接走 `modal_resource_search` 的 task 主链；若该 binding family 被注册为 `typed local_cli`，则由 runtime 结构化组装 `lime task create resource-search --json`，CLI 不可用时再回退 `lime_create_modal_resource_search_task`。最终仍只允许落到标准 `modal_resource_search` task file；若当前上下文缺少明确资源类型或检索关键词，允许 Agent 最多追问 1 个关键问题，但不能伪造“素材已检索完成”。

`Claw` 的纯文本搜索命令也应沿同一条 current 主链收敛：

- Agent 驱动的搜索命令：`@搜索` / `@search` / `@research` / `@调研` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `research_request` 写入 `request_metadata.harness.research_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(research)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / Read / Glob / Grep` 这类“工具目录发现/本地文件偏航”工具，避免模型在 `@搜索` 首刀前先去查工具名或误读本地文件，但会保留真实联网检索主链。后续默认 skill 必须沿 `research` prompt skill -> `search_query` / `WebSearch` 主链先真实联网检索，再输出结论、来源与建议；当前上下文缺少明确搜索主题时，允许 Agent 最多追问 1 个关键问题，但不能伪造“已完成搜索”，也不能直接凭记忆跳过检索。

`Claw` 的纯文本深搜命令也应沿同一条 current 主链收敛：

- Agent 驱动的深搜命令：`@深搜` / `@deep` / `@deepsearch` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `deep_search_request` 写入 `request_metadata.harness.deep_search_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(research)`、且至少执行多轮扩搜的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / Read / Glob / Grep` 这类“工具目录发现/本地文件偏航”工具，避免模型在 `@深搜` 首刀前先去查工具名或误读本地文件，但会保留真实联网检索主链。后续默认 skill 仍必须沿 `research` prompt skill -> `search_query` / `WebSearch` 主链先真实联网检索，再输出事实、推断与待确认项；当前上下文缺少明确搜索主题时，允许 Agent 最多追问 1 个关键问题，但不能伪造“已完成深搜”，也不能退化成只搜一次的普通搜索。

`Claw` 的纯文本研报命令也应沿同一条 current 主链收敛：

- Agent 驱动的研报命令：`@研报` / `@report` / `@research_report` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `report_request` 写入 `request_metadata.harness.report_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(report_generate)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / Read / Glob / Grep` 这类“工具目录发现/本地文件偏航”工具，避免模型在 `@研报` 首刀前先去查工具名或误读本地文件，但会保留真实联网检索主链。后续默认 skill 必须沿 `report_generate` prompt skill -> `search_query` / `WebSearch` 主链先真实联网检索，再写出结构化研究报告；当前上下文缺少明确研报主题时，允许 Agent 最多追问 1 个关键问题，但不能伪造“研报已完成”，也不能直接退回普通聊天长文。

`Claw` 的纯文本竞品命令也应沿同一条 current 主链收敛：

- Agent 驱动的竞品命令：`@竞品` / `@competitor` / `@competitive` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `report_request` 写入 `request_metadata.harness.report_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链，强约束首刀优先调用 `Skill(report_generate)`，并继续压制 `ToolSearch / Read / Glob / Grep` 这类本地偏航工具，保留真实联网检索主链。与 `@研报` 的差异只在用户侧语义层：`@竞品` 会默认补齐竞品分析的 `focus` 与 `output_format`，并将 `entry_source` 写为 `at_competitor_command`；它不是新的协议，也不能绕开 `report_generate -> search_query / WebSearch` 主链直接凭记忆生成所谓“竞品结论”。

`Claw` 的纯文本站点搜索命令也应沿同一条 current 主链收敛：

- Agent 驱动的站点搜索命令：`@站点搜索` / `@站点` / `@site_search` / `@site` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `site_search_request` 写入 `request_metadata.harness.site_search_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(site_search)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类通用搜索/本地文件偏航工具，同时拦住 `mcp__lime-browser__* / browser_* / mcp__playwright__*` 这类底层浏览器兼容面，避免模型在 `@站点搜索` 首刀前先去搜工具目录或退回浏览器底层执行。后续默认 skill 必须沿 `site_search` prompt skill -> `lime_site_info / lime_site_run / lime_site_search` 主链先执行真实站点适配器，再输出摘要与来源；当前上下文缺少明确站点或检索关键词时，允许 Agent 最多追问 1 个关键问题，但不能伪造“已完成站点搜索”，也不能先退回 `research / WebSearch`。

`Claw` 的纯文本读 PDF 命令也应沿同一条 current 主链收敛：

- Agent 驱动的读 PDF 命令：`@读PDF` / `@pdf` / `@read_pdf` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `pdf_read_request` 写入 `request_metadata.harness.pdf_read_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(pdf_read)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Grep` 这类工具目录发现、联网搜索或内容检索偏航工具，但会保留 `Read / Glob` 这类本地 PDF 读取主链能力。后续默认 skill 必须沿 `pdf_read` prompt skill -> `list_directory / read_file` 主链先真实读取本地或工作区 PDF，再输出结构化解读结果；当前上下文只有远程 PDF URL 或缺少明确 PDF 来源时，允许 Agent 最多追问 1 个关键问题请求本地路径或导入路径，但不能伪造“PDF 已读完”，也不能退回普通聊天总结。

`Claw` 的纯文本总结命令也应沿同一条 current 主链收敛：

- Agent 驱动的总结命令：`@总结` / `@summary` / `@summarize` / `@摘要` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `summary_request` 写入 `request_metadata.harness.summary_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(summary)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Grep` 这类工具目录发现、联网检索或内容检索 detour tools，但会保留 `Read / Glob` 这类显式路径读取主链能力。后续默认 skill 必须沿 `summary` prompt skill 主链先总结显式正文或当前对话相关上下文；只有当用户显式给出本地路径或目录时，才允许最小化使用 `list_directory / read_file` 读取必要内容并保留真实 tool timeline。当前上下文缺少显式正文时，允许 Agent 优先总结当前对话；只有在显式正文和对话上下文都不足时，才最多追问 1 个关键问题，但不能伪造“已完成总结”，也不能在前端直接生成摘要绕过 skill。

`Claw` 的纯文本翻译命令也应沿同一条 current 主链收敛：

- Agent 驱动的翻译命令：`@翻译` / `@translate` / `@translation` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `translation_request` 写入 `request_metadata.harness.translation_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(translation)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Grep` 这类工具目录发现、联网检索或内容检索 detour tools，但会保留 `Read / Glob` 这类显式路径读取主链能力。后续默认 skill 必须沿 `translation` prompt skill 主链先翻译显式正文或当前对话相关上下文；只有当用户显式给出本地路径或目录时，才允许最小化使用 `list_directory / read_file` 读取必要内容并保留真实 tool timeline。当前上下文缺少显式正文时，允许 Agent 优先翻译当前对话；只有在显式正文和对话上下文都不足时，才最多追问 1 个关键问题，但不能伪造“已完成翻译”，也不能在前端直接生成译文绕过 skill。

`Claw` 的纯文本分析命令也应沿同一条 current 主链收敛：

- Agent 驱动的分析命令：`@分析` / `@analysis` / `@analyze` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `analysis_request` 写入 `request_metadata.harness.analysis_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(analysis)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Grep` 这类工具目录发现、联网检索或内容检索 detour tools，但会保留 `Read / Glob` 这类显式路径读取主链能力。后续默认 skill 必须沿 `analysis` prompt skill 主链先分析显式正文或当前对话相关上下文；只有当用户显式给出本地路径或目录时，才允许最小化使用 `list_directory / read_file` 读取必要内容并保留真实 tool timeline。当前上下文缺少显式正文时，允许 Agent 优先分析当前对话；只有在显式正文和对话上下文都不足时，才最多追问 1 个关键问题，但不能伪造“已完成分析”，也不能在前端直接生成分析结论绕过 skill。

`Claw` 的纯文本发布合规命令也应沿同一条分析主链收敛：

- Agent 驱动的发布合规命令：`@发布合规` / `@合规` / `@compliance` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会继续把结构化 `analysis_request` 写入 `request_metadata.harness.analysis_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。与 `@分析` 的区别只在用户侧语义层：`@发布合规` 会默认补齐 `focus=广告法、版权、平台发布风险`、`style=合规审校`、`output_format=风险等级、风险点、修改建议、待确认项`，并把 `entry_source` 写为 `at_publish_compliance_command`；它不是新的协议，也不能绕开 `analysis` 主链直接在前端拼一段所谓“合规结论”。

`Claw` 的纯文本转写命令也应沿同一条 current 主链收敛：

- Agent 驱动的转写命令：`@转写` / `@transcribe` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `transcription_task` 写入 `request_metadata.harness.transcription_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(transcription_generate)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类 detour tools，避免模型在 `@转写` 首刀前先去搜工具目录、联网检索或误读本地文件。后续默认 skill 必须先进入 `transcription_generate` 的 current binding；若当前 binding family 被注册为 `typed local_cli`，则由 runtime 结构化组装 `lime task create transcription --json`；CLI 不可用时再回退 `lime_create_transcription_task`。最终仍只允许落到标准 `transcription_generate` task file；若当前上下文缺少 `source_url` / `source_path`，允许 Agent 最多追问 1 个关键问题，但不能伪造“已完成转写”。

`Claw` 的纯文本链接解析/网页抓取命令也应沿同一条 current 主链收敛：

- Agent 驱动的链接解析/抓取/网页读取命令：`@链接解析` / `@链接` / `@url_parse` / `@抓取` / `@网页读取` / `@web_scrape` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `url_parse_task` 写入 `request_metadata.harness.url_parse_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(url_parse)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类 detour tools，避免模型在 `@链接解析` / `@抓取` / `@网页读取` 首刀前先去搜工具目录、联网检索或误读本地文件。后续默认 skill 必须先进入 `url_parse` 的 current binding；若当前 binding family 被注册为 `typed local_cli`，则由 runtime 结构化组装 `lime task create url-parse --json`；CLI 不可用时再回退 `lime_create_url_parse_task`。最终仍只允许落到标准 `url_parse` task file；其中 `@抓取` 只是用户侧更偏正文抓取的入口，默认 `extract_goal = full_text`；`@网页读取` 是用户侧更偏阅读总结的入口，默认 `extract_goal = summary`；它们都不是新的 task 协议。若当前上下文缺少 URL，允许 Agent 最多追问 1 个关键问题，但不能伪造“链接已解析完成”“网页已抓取完成”或“网页已读取完成”。

`Claw` 的纯文本排版命令也应沿同一条 current 主链收敛：

- Agent 驱动的排版命令：`@排版` / `@typesetting` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `typesetting_task` 写入 `request_metadata.harness.typesetting_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(typesetting)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类 detour tools，避免模型在 `@排版` 首刀前先去搜工具目录、联网检索或误读本地文件。后续默认 skill 必须先进入 `typesetting` 的 current binding；若当前 binding family 被注册为 `typed local_cli`，则由 runtime 结构化组装 `lime task create typesetting --json`；CLI 不可用时再回退 `lime_create_typesetting_task`。最终仍只允许落到标准 `typesetting` task file；若当前上下文缺少待排版正文，允许 Agent 最多追问 1 个关键问题，但不能伪造“排版已完成”。

`Claw` 的纯文本网页命令也应沿同一条 current 主链收敛：

- Agent 驱动的网页命令：`@网页` / `@webpage` / `@landing` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `webpage_request` 写入 `request_metadata.harness.webpage_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(webpage_generate)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类 detour tools，避免模型在 `@网页` 首刀前先去搜工具目录、联网检索或误读本地文件。后续默认 skill 必须沿 `webpage_generate` prompt skill 主链直接产出单文件 HTML artifact，并通过 `<write_file>` 落到工作区；当前上下文缺少明确网页目标时，允许 Agent 最多追问 1 个关键问题，但不能只给口头方案、不能伪造“网页已生成”却没有真实 `.html` 文件。

`Claw` 的纯文本 PPT 命令也应沿同一条 current 主链收敛：

- Agent 驱动的演示稿命令：`@PPT` / `@ppt` / `@slides` / `@演示` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `presentation_request` 写入 `request_metadata.harness.presentation_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(presentation_generate)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类 detour tools，避免模型在 `@PPT` 首刀前先去搜工具目录、联网检索或误读本地文件。后续默认 skill 必须沿 `presentation_generate` prompt skill 主链直接产出单文件 Markdown 演示稿 artifact，并通过 `<write_file>` 落到工作区；当前上下文缺少明确演示目标时，允许 Agent 最多追问 1 个关键问题，但不能只给口头提纲、不能伪造“PPT 已生成”却没有真实演示稿文件。

`Claw` 的纯文本表单命令也应沿同一条 current 主链收敛：

- Agent 驱动的表单命令：`@表单` / `@form` / `@survey` / `@问卷` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会把结构化 `form_request` 写入 `request_metadata.harness.form_skill_launch`，同时打开 `request_metadata.harness.allow_model_skills = true`。Agent Runtime current 主链会给当前 turn 注入只允许首刀优先调用 `Skill(form_generate)` 的系统提示，并在当前 session permission 与 registry 中显式压制 `ToolSearch / WebSearch / Read / Glob / Grep` 这类 detour tools，避免模型在 `@表单` 首刀前先去搜工具目录、联网检索或误读本地文件。后续默认 skill 必须沿 `form_generate` prompt skill 主链直接产出一份可被现有 A2UI parser 识别的 simple form JSON，并以 ` ```a2ui ` 代码块回到聊天流；current render contract 必须是 `form + json`，不能回退成单文件 HTML artifact，也不能再发明另一套表单 DSL。当前上下文缺少明确表单目标时，允许 Agent 最多追问 1 个关键问题，但不能只给口头字段建议、不能伪造“表单已生成”却没有真实 A2UI 表单结果。

`Claw` 的自然语言编程能力应沿同一条 current 主链收敛：

- 编程底座主路径：普通自然语言代码任务直接进入 current `react` Agent runtime，发送边界保留原始用户文本，不维护“修复 / 重构 / 评审 / 解释”等正文关键词 parser，也不写入 `request_metadata.harness.code_command`。`@代码` / `@code` / `@coding` / `@开发` 只是 command catalog 中 `code_runtime` 的 mention 快捷入口，发送边界通过通用 `parseMentionCommand(...)` 与 `mentionCommandPrefixKeyMap` 识别 catalog route；命中后仍归一到 `react` Agent runtime，不再切换本轮 `execution_strategy`，也不再通过前端 `resolveCodeOrchestratedRuntimeDefaults(...)` 自动打开 `task/subagent` 或默认代码团队。`code_orchestrated` / `auto` 只允许作为旧会话、旧 catalog 或旧请求的 compat 输入值，在 session store / runtime 边界归一为 `react`；具体是解释、评审、修复还是实现，由同一条运行时基于用户原文、上下文和工具结果判断。

`Claw` 的纯文本发布命令当前应收敛到现有发布工作流，而不是新开一条平行 runtime：

- 工作流入口型命令：`@发布` / `@publish` / `@发文` / `@投稿` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本展示，但把实际 dispatch 改写到现有 `/content_post_with_cover ...` 主链，并把结构化 `publish_command` 写入 `request_metadata.harness.publish_command`。当前实现优先复用已有 `content_post_with_cover` 发布工作流、`content-posts/*.md` / `*.publish-pack.json` 产物链，以及 `detectBrowserTaskRequirement(...)` 推导出的浏览器门禁，而不是再发明新的 `publish_task` 协议。若输入里已明确平台后台，如微信公众号后台，必须继续写入 `browser_requirement=required_with_user_step` 与平台 launch URL；若只是整理发布稿而未指定平台，则允许先在同一工作流里生成发布稿与发布前检查，不强行要求浏览器。后续若统一 agent/workflow runtime 成熟，可以把 `@发布` 从当前 slash workflow 迁走，但在那之前不得同时维护第二套发布入口真相。

`Claw` 的纯文本渠道预览命令应复用同一条发布工作流主链：

- 工作流入口型命令：`@渠道预览` / `@预览` / `@preview` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本展示，但把实际 dispatch 改写到现有 `/content_post_with_cover ...` 主链，并继续把结构化信息写入 `request_metadata.harness.publish_command`。与 `@发布` 的区别只在语义层：`@渠道预览` 会额外写入 `publish_command.intent=preview`，同时在 dispatch body 中明确要求生成“渠道预览稿”，重点突出标题、首屏摘要、排版层级和封面建议，而不是直接走浏览器后台发布动作。当前实现不新建 `channel_preview_task` 协议、不新建 viewer，也不要求真实浏览器门禁；后续若要做平台级 UI 仿真，也必须继续在现有内容交付主链上演进，而不是重新分叉。

`Claw` 的纯文本上传命令也应复用同一条发布工作流主链：

- 工作流入口型命令：`@上传` / `@upload` / `@上架` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本展示，但把实际 dispatch 改写到现有 `/content_post_with_cover ...` 主链，并继续把结构化信息写入 `request_metadata.harness.publish_command`。与 `@渠道预览`、`@发布` 的区别在于语义层：`@上传` 会额外写入 `publish_command.intent=upload`，同时在 dispatch body 中明确要求生成“上传稿与素材清单”，重点突出标题、正文、封面说明、标签建议和上传前检查。若输入里已明确平台后台，如微信公众号后台，必须继续写入 `browser_requirement=required_with_user_step` 与平台 launch URL；若只是整理上传稿而未指定后台，则允许先在同一工作流里生成上传包，不强行要求浏览器。当前实现不新建 `upload_task` 协议，也不新建 viewer。

同时要明确，`publish_command` 不能只停留在发送态 metadata。当前 slash skill 执行层必须继续透传这份 request metadata，把 `preview / upload / publish` 语义写进 `content-posts/*.md` 产物 meta，并由聊天区产物卡片与右侧工作台优先显示“渠道预览稿 / 上传稿 / 发布稿”这类用户语义标题；否则一旦进入 artifact 恢复或历史回访，三类结果又会重新混成同一种普通文稿。会话文件恢复链也必须保留嵌套相对路径与这份产物 metadata，不能只把 `content-posts/...` 当普通文件名恢复，否则右侧工作台仍会退回成普通文稿标题。

`Claw` 的纯文本配音命令也应沿同一条服务型技能主链收敛：

- Agent 驱动的配音命令：`@配音` / `@voice` / `@dubbing` / `@dub` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界会优先从当前 `serviceSkills` / seeded fallback 中解析配音能力；若现有兜底 ID 仍沿用 `cloud-video-dubbing` 之类历史命名，也只允许按“本地 service skill 标识”理解，不得再把它解释成云执行能力。结构化 `service_scene_launch` 只保留 `scene_key=voice_runtime`、`entry_source=at_voice_command` 这类本地路由提示，不再注入 `scene_base_url / session_token` 一类云端运行上下文。当前 `voice_generation` 是 `metadata_only` compat：可以写 GUI / Skill 元数据和 `audio_task` 草稿索引，但不得声称本地 ServiceSkill 已真实生成音频、不得写 `resolved_route` / `model_route_execution`、不得把 `service_skill:voice_runtime` 继续描述成 current 执行桥。接入 audio worker 或 RuntimeCore provider protocol mapper 后，才允许把它恢复为可执行 route。

`Claw` 的纯文本浏览器命令也应沿同一条真实浏览器工具主链收敛：

- Agent 驱动的浏览器命令：`@浏览器` / `@browser` / `@browse` 在 `src/components/agent/chat/workspace/useWorkspaceSendActions.ts` 中保留原始用户文本发送。聊天发送边界不会再改写成另一套 skill 或 scene，而是显式把 `browser_requirement`、`browser_requirement_reason` 与 `browser_launch_url` 写入 `request_metadata.harness`，同时关闭前端本轮 `webSearch` 偏好，确保后续请求优先走 Lime Browser Assist 与 `mcp__lime-browser__*` 工具，而不是退回 WebSearch 或普通聊天。若正文里出现平台后台、登录、扫码等受保护网页步骤，则继续沿用 `required_with_user_step`；否则默认要求 `required`，并把显式 URL 或搜索入口写入 launch URL。当前命令不应伪装成站点型 `service_skill_launch`，也不应重新造一套 browser task 协议。

这些命令如果仍处在 legacy desktop facade 兼容期，也必须继续保持 DevBridge dispatcher 已桥接；current 新能力优先同步 Electron Desktop Host bridge / App Server JSON-RPC，避免浏览器模式、Electron smoke 或 Playwright 续测时回退成 unknown command。

自动化设置链路同样遵循这条路径。当前主入口为 `src/lib/api/automation.ts`，统一经 `AppServerClient.request(...)` 承接：

- `automationScheduler/config/read`
- `automationScheduler/config/update`
- `automationScheduler/status`
- `automationJob/list`
- `automationJob/read`
- `automationJob/create`
- `automationJob/update`
- `automationJob/delete`
- `automationJob/runNow`
- `automationJob/health`
- `automationJob/runHistory`
- `automationSchedule/preview`
- `automationSchedule/validate`

这些 App Server JSON-RPC method 属于当前 `设置 -> 系统 -> 自动化` 主路径，缺少必需 result 时必须 fail closed，不得回退 DevBridge mock、renderer mock 或 legacy desktop facade。`automationJob/runNow` 已进入 current 协议，但 App Server 自动化执行器尚未迁完；当前实现必须 fail closed，不能回退旧 Tauri 执行器。

旧自动化命令统一判为 `dead`，不得重新接回前端网关、Electron Desktop Host 白名单、Rust `generate_handler!`、DevBridge dispatcher、`mockPriorityCommands` 或默认 mock：

- `get_automation_scheduler_config`
- `update_automation_scheduler_config`
- `get_automation_status`
- `get_automation_jobs`
- `get_automation_job`
- `create_automation_job`
- `update_automation_job`
- `delete_automation_job`
- `run_automation_job_now`
- `get_automation_health`
- `get_automation_run_history`
- `preview_automation_schedule`
- `validate_automation_schedule`

Companion 桌宠链路已下线，分类为 `dead`。`src/lib/api/companion.ts`、全局 companion hook、设置页桌宠管理、桌宠能力偏好、provider overview 同步、默认 mock 与 `companion_get_pet_status` / `companion_launch_pet` / `companion_send_pet_command` 命令面均不得重新接回前端网关、Desktop Host、DevBridge 或 App Server current 主链。后续如果重新设计独立桌面伴随能力，必须重新定义 current 事实源和协议边界，而不是复活旧 `companion_*` 命令、`companion-pet-status` 事件或本地 `ws://127.0.0.1:45554/companion/pet` 入口。

## 命令契约的事实源

命令边界不是单文件事实，至少要同时看下面几处：

1. **前端实际调用**
   `src/` 下运行时代码里的 `safeInvoke(...)` / `invoke(...)`

2. **Electron Desktop Host bridge / preload 白名单**
   `electron/`、`src/lib/desktop-host/` 与 `src/lib/electron-host.ts` 中的 IPC channel、preload facade 和 supported command map

3. **App Server JSON-RPC 协议**
   `lime-rs/crates/app-server-protocol/`、`lime-rs/crates/app-server/`、`packages/app-server-client/`

4. **legacy desktop facade 注册**
   仅当改动触碰兼容 facade 时，检查 legacy host 注册表；新增 current 能力不得把这层作为事实源

5. **治理目录册**
   `src/lib/governance/agentCommandCatalog.json`

6. **Bridge mock 优先集合**
   `src/lib/dev-bridge/mockPriorityCommands.ts`

7. **默认 mock 实现**
   `src/lib/desktop-host/` / legacy mock path 中的 `defaultMocks`

只看其中一侧都不够。只要能力仍然依赖命令边界，就至少要同时核对前端调用、Electron Desktop Host bridge 或 App Server 协议、治理目录册、mock 集合这几面。mock 集合只服务测试夹具和契约守卫，不能成为生产 fallback。legacy desktop facade 注册只在兼容层被触碰时检查，不再是新增能力的默认事实源。

旧 `agent_runtime_*` 结构合同生成链已退场：`src/lib/governance/agentRuntimeCommandSchema.json`、`src/lib/api/agentRuntime/commandManifest.generated.*` 与 `scripts/generate-agent-runtime-clients.mjs` 均属于 `dead / deleted / forbidden-to-restore`。旧命令名只允许作为 retired guard、负向测试、test-only fixture 或历史 evidence 出现；不得再恢复成 schema、manifest、mock 策略或前端可调用命令集合。

当前前端 runtime client 目录也已经固定为：

- `current`：`src/lib/api/agentRuntime/types.ts`、`src/lib/api/agentRuntime/index.ts` 与各分域 client
- `compat`：`src/lib/api/agentRuntime.ts`

固定约束：

- `src/lib/api/agentRuntime/**/*.ts` 内部类型依赖只允许从 `./types` 读取，不要再回绕 `../agentRuntime`
- 外部业务模块继续从 `@/lib/api/agentRuntime` 进入 compat barrel，不要直接跳进分域 client
- 禁止新增 `agent_runtime_*` 作为前端主链；新 runtime 能力优先补 App Server schema / protocol / client / 分域 client。不得恢复旧 `agentRuntimeCommandSchema.json` 或 generated command manifest 作为过渡层

## MCP 控制面主链

MCP 管理、发现和调用控制面当前只允许走：

`src/lib/api/mcp.ts -> AppServerClient.request(...) -> app_server_handle_json_lines -> App Server JSON-RPC -> lime-rs/crates/mcp`

current App Server method 固定为：

- `mcpServer/list`
- `mcpServerStatus/list`
- `mcpServer/create`
- `mcpServer/update`
- `mcpServer/delete`
- `mcpServer/enabled/set`
- `mcpServer/importFromApp`
- `mcpServer/syncAllToLive`
- `mcpServer/oauth/login`
- `mcpServer/start`
- `mcpServer/stop`
- `mcpTool/list`
- `mcpTool/listForContext`
- `mcpTool/search`
- `mcpTool/call`
- `mcpTool/callWithCaller`
- `mcpPrompt/list`
- `mcpPrompt/get`
- `mcpResource/list`
- `mcpResource/read`
- `mcpResource/subscribe`
- `mcpResource/unsubscribe`

旧 MCP Desktop facade 已统一归类为 `dead / retired guard-only`：`get_mcp_servers`、`mcp_list_servers_with_status`、`mcp_list_tools`、`mcp_list_tools_for_context`、`mcp_search_tools`、`mcp_call_tool`、`mcp_call_tool_with_caller`、`mcp_list_prompts`、`mcp_get_prompt`、`mcp_list_resources`、`mcp_read_resource`、`mcp_start_server`、`mcp_stop_server`、`add_mcp_server`、`update_mcp_server`、`delete_mcp_server`、`toggle_mcp_server`、`import_mcp_from_app`、`sync_all_mcp_to_live`。这些名字只允许停留在负向测试、retired guard、历史 evidence 或 contract forbidden snippet 中，不得回到 `src/lib/api/mcp.ts`、Electron Host、DevBridge truth、`mockPriorityCommands`、desktop-host 默认 mock、legacy Tauri `generate_handler` 或 Rust DevBridge dispatcher。

MCP smoke 证据也必须沿这条 current 控制面：`smoke:mcp-current` 通过 `app_server_handle_json_lines` 观察 `mcpServer/*`、`mcpTool/*`、`mcpPrompt/*`、`mcpResource/*`，并断言未观察到旧 `mcp_*` / `get_mcp_servers` 命令。不能把旧命令的空 mock、diagnostic facade 或浏览器 fallback 当作 MCP 可用证据。

真实第三方 MCP provider 证据只能通过 `smoke:mcp-current -- --allow-live-provider` 显式打开；缺少 `LIME_MCP_LIVE_SERVER_URL` 时必须在 DevBridge / App Server 调用前 fail closed。`LIME_MCP_LIVE_SERVER_URL` 只允许 `http/https` 且不得包含 username、password、query 或 hash；bearer token 和自定义 HTTP header 只能通过环境变量名引用，不允许 inline secret。live smoke summary 与 `network-invoke.json` 只能记录 provider host、env var 名、header 名、scope、tool/resource 标识、URL / URI 摘要和匹配布尔值，不得写入完整 provider URL、resource URI、token、header value、资源正文或 blob。

MCP 运行时事件同样属于 current Desktop Host bridge truth。`mcp:server_started`、`mcp:server_stopped`、`mcp:server_error`、`mcp:tools_updated`、`mcp:resources_updated`、`mcp:resource_updated` 与 `mcp:oauth_completed` 只能来自真实 MCP manager / rmcp notification / OAuth registry，经 `DynEmitter -> Desktop Host event bridge -> safeListen` 投影给前端；浏览器模式不得静默退回 mock event fallback。

## MCP 工具命名主链

MCP bridge 当前唯一继续演进的工具命名事实源是：

- 工具全名：`mcp__<server>__<tool>`
- extension surface key：`mcp__<server>`
- UI 展示名：继续优先显示 server 原名，例如 `lime-browser`
- deferred 工具需要通过 `ToolSearch` 拉起时，优先使用精确 `select:mcp__<server>__<tool>`；如 `select:mcp__playwright__browser_click`
- `ToolSearch` 空结果后不要继续改写成 `playwright_browser_click`、`read_file`、`system` 之类同义词重试；原生工具直接调用当前可见的 `Read / Write / Edit / Glob / Grep / Bash / WebFetch / WebSearch`

不要再新增或恢复以下旧命名心智：

- 裸 `server__tool`
- 只在重名时才临时拼 `server_tool`
- inventory / mock / GUI 面板里 extension key 与工具前缀各自一套

## 命令分类语言

命令治理统一沿用 `governance.md` 的分类语言：

- `current`：当前主路径，后续能力继续向这里收敛
- `compat`：兼容层，只允许委托、适配、告警，不允许长新逻辑
- `deprecated`：废弃层，只允许迁移与下线，不允许新增依赖
- `dead`：已停用或确认无入口，优先删除

脚本或治理报告里还可能看到：

- `dead-candidate`

它表示“删除候选信号”，不是自动等于 `dead`。

如果本次改动说不清自己属于哪一类，先不要写代码，先读 `internal/aiprompts/governance.md`。

## 新增或改命令的标准步骤

### 1. 先判断是不是应该新增命令

先问三个问题：

- 当前需求能不能落到已有 `current` 主链？
- 这次是补能力，还是只是在给 compat 层续命？
- 有没有已经存在但尚未收口的旧入口？

如果答案是“已有主链可承接”，优先补现有主链，不再新开平级命令。

### 2. 前端只从 API 网关进入

- 在 `src/lib/api/*` 下新增或扩展对应网关
- 页面、组件、普通 Hook 不要直接调用裸 `invoke`
- 尽量把命令名、参数整理、返回类型都收在网关层

推荐写法：

```typescript
// src/lib/api/serverRuntime.ts
import { createAppServerClient } from "@/lib/api/appServer";

export async function getServerDiagnostics() {
  const response = await createAppServerClient().readServerDiagnostics();
  return projectServerDiagnostics(response.result);
}
```

业务层只消费网关：

```typescript
import { getServerDiagnostics } from "@/lib/api/serverRuntime";

const diagnostics = await getServerDiagnostics();
```

共享网关控制面已下线后，`start_server`、`stop_server`、`get_server_status`、`get_available_routes`、`get_route_curl_examples`、`test_api`、`get_network_info`，以及托盘残留 `sync_tray_state`、`update_tray_server_status`、`update_tray_credential_status`、`get_tray_state`、`refresh_tray_menu`、`refresh_tray_with_stats` 都应视为 `dead` 候选，不应重新接回前端主路径；server 兼容面 `/v1/routes`、`/{selector}/v1/messages`、`/{selector}/v1/chat/completions` 也应视为 `dead` 候选，不应重新接回本地共享网关主链；开发者诊断统一继续走 App Server `diagnostics/server/read`，旧 `get_server_diagnostics` 只能作为 retired guard / 负向测试 / cleanup-only residual；托盘只保留 `sync_tray_model_shortcuts`，server 只保留标准 `/v1/messages` 与 `/v1/chat/completions`。

### 3. Electron Host Bridge / App Server / legacy facade 同步

- 新 Desktop host 能力优先在 Electron main / preload 白名单和 `src/lib/desktop-host/` 网关中同步；这层只能做 host bridge，不承接后端业务事实
- 新 Agent / runtime / 跨 App 复用能力优先在 `app-server-protocol`、`app-server`、`app-server-client` 中同步
- 只有 legacy desktop facade 仍需兼容时，才同步 legacy host 注册；这层只允许委托和投影，不允许新增业务逻辑
- 不要只写一侧实现，不补对应 host / protocol / mock / governance 事实源

### 4. 治理目录册与 mock 同步

命令边界发生变化时，按需同步：

- `src/lib/governance/agentCommandCatalog.json`
- `src/lib/dev-bridge/mockPriorityCommands.ts`
- `src/lib/desktop-host/` / legacy mock path

尤其是以下场景：

- 新命令属于 runtime gateway
- 旧命令进入 `deprecated`
- 旧 helper 被替换
- Bridge 优先命令需要本地 mock

同步 mock 不表示生产可回退 mock。新增或迁移命令时，生产入口必须走真实 Electron Desktop Host IPC / App Server JSON-RPC；测试 mock 只能在 `*.test.*`、测试夹具或显式 `invokeMockOnly` 边界中验证形态。

### 5. 文档同步

至少同步更新：

- 本文档 `internal/aiprompts/commands.md`
- `internal/aiprompts/quality-workflow.md`
- 如涉及 GUI 续测，再看 `internal/aiprompts/playwright-e2e.md`

### 6. 跑最低校验

至少运行：

```bash
npm run test:contracts
```

必要时补：

```bash
npm run governance:legacy-report
npm run verify:local
```

如果命令边界改动影响会话运行时恢复语义，例如：

- App Server `agentSession/turn/start.runtimeOptions.hostOptions.asterChatRequest` 新增或调整 `approval_policy / sandbox_policy`
- App Server `agentSession/turn/start.runtimeOptions.hostOptions.asterChatRequest.metadata.harness.team_memory_shadow` 新增或调整 repo-scoped Team 协作记忆注入
- App Server / RuntimeCore / `lime-rs/crates/agent` 子代理 request 字段新增或调整 `name / teamName / runInBackground / mode / isolation / cwd`，或修改 spawn 后的 Team 成员写回、child `working_dir` 与父子会话上下文投影
- App Server `agentSession/update` 新增或调整 `providerName / modelName / executionStrategy / recentAccessMode / recentPreferences / recentTeamSelection`
- App Server `agentSession/read` / `agentSession/list` 的 `execution_runtime` 新增或调整 `recent_access_mode / recent_theme / recent_session_mode / recent_gate_key / recent_run_title / recent_content_id`
- 话题切换时的 provider/model、权限 accessMode、工具偏好、Team 选择，或 `theme / session_mode / gate_key / run_title / content_id` 恢复从本地 fallback 向 `execution_runtime` 收敛

除了契约检查，还应补对应 Hook / UI 稳定回归，确认切换话题后模型选择器恢复的是会话 runtime，而不是陈旧本地缓存。

## 变更完成定义

一次命令边界改动，至少满足以下条件才算完成：

1. 前端调用已经收口到 `src/lib/api/*`
2. App Server protocol / client / processor / RuntimeCore owner 已同步；只有触碰 legacy desktop facade 时才检查旧 host 注册
3. `agentCommandCatalog.json` 中的治理口径已同步
4. `mockPriorityCommands` 与 `defaultMocks` 没有漂移
5. `npm run test:contracts` 通过
6. 涉及 compat / deprecated 的改动，已补 `governance:legacy-report` 或明确说明不需要

## 自动化 `agent_turn` 负载补充约定

当 `automationJob/create` / `automationJob/update` 的 `payload.kind = "agent_turn"` 用于持续产出交付物时，允许并推荐透传以下字段：

- `content_id`：绑定长期内容主线，供自动化版本持续沉淀到同一交付链
- `request_metadata`：与运行时 turn 保持同合同，至少可包含 `artifact` 与 `harness` 两层

推荐形态：

- `request_metadata.artifact`：`artifact_mode / artifact_kind / artifact_stage / workbench_surface`
- `request_metadata.harness`：`theme / session_mode / content_id`

这样做的目的不是给自动化新增第二套协议，而是让自动化直接复用现有 runtime turn 的 Artifact 主链。

## 明确禁止

- 在页面、组件、普通 Hook 中直接散落 `invoke`
- 给 `compat` 路径继续长新业务逻辑
- 恢复 `lime-rs/src/**`，或把历史路径当作新增后端业务、领域服务、runtime 分支、API adapter、数据访问或跨 App 复用能力的落点；旧实现只能通过 git history / 执行计划只读参考，落地必须进入 `lime-rs/crates/**` 或 Electron Desktop Host
- 恢复 `lime-rs/src/commands/**`、旧 Tauri wrapper、runner / dispatcher、compat wrapper、fail-closed stub 或退场 stub
- 继续向超过 `1000` 行的非生成代码文件追加新业务逻辑而不拆分；无法拆分时必须登记 blocker、风险和退出条件
- 把已经进入 `deprecated` / `dead-candidate` / `dead` 的命令重新接回主链
- 只改前端或只改 Rust，一侧通过就宣布完成
- 用“先兼容一下”作为长期保留第二套入口的理由

## 当前主链示例

以下是仓库当前已经明确收敛的几个方向：

- **新增 Agent / Codex 服务化能力主链**：继续收敛到 App Server JSON-RPC；旧 `agent_runtime_*` 只作为 retired guard、历史 evidence 或受控 compat request 形状，其中旧 submit turn facade 不能再成为生产 truth，真实提交必须走 App Server JSON-RPC `agentSession/turn/start`
- **子代理运行时主链**：继续收敛到 App Server / RuntimeCore / `lime-rs/crates/agent` 的 Team / child session 能力；旧 `agent_runtime_spawn_subagent` 与相关命令名只允许作为迁移残留或 retired guard。current request surface 使用 `name / teamName / runInBackground / mode / isolation / cwd` 等字段，其中 `teamName` 需要与 `name` 搭配并依附现有 Team 上下文，`cwd` 必须是绝对目录，并稳定投影到 child session 的 `working_dir` 与 Team 成员展示；当前 runtime 仍会明确拒绝非空 `mode / isolation`
- **Team runtime 工具主链**：当前协作工具面继续收敛到 `Agent / TeamCreate / TeamDelete / SendMessage / ListPeers`；不要把已删除的 `SubAgentTask` compat 工具重新接回新的多代理主路径
- **用户可见消息工具主链**：继续收敛到 `SendUserMessage`，用于把回复、进度同步、主动提醒和附件送到用户主可见消息面；不要再把这类能力拆到其它平行工具名或旁路协议里
- **会话状态回写主链**：继续收敛到 App Server `agentSession/update`，用于名称、执行策略、session provider/model、`recent_access_mode`、`recent_preferences` 以及 `recent_team_selection` 的轻量持久化回写；旧 `agent_runtime_update_session` 不得重新接回生产入口，只允许作为 retired guard / 历史 evidence 出现
- **会话权限主链**：App Server `agentSession/turn/start.runtimeOptions.hostOptions.asterChatRequest.approval_policy / sandbox_policy` 是正式 turn context 权限协议；旧前端 `turn_config` 只作为 compat request 投影来源。App Server `agentSession/read` 返回的 `execution_runtime.recent_access_mode` 负责承接会话最近一次 accessMode。当前端已命中同一 steady-state 权限时，不应继续依赖 `harness.access_mode` 作为唯一事实源；聊天发送主路径默认也不再主动发这个 compat 字段
- **会话权限默认值**：当前默认 accessMode 固定收敛到 `full-access -> never + danger-full-access`；`current -> on-request + workspace-write` 与 `read-only -> on-request + read-only` 只允许来自用户显式切换、会话恢复或边界层迁移，不允许把 formal policy 留空后再让工具层自行猜默认；provider / thread-start 适配层也不得私自回退为 `workspace-write`
- **自动化 `agent_turn` 权限主链**：自动化任务 payload 也应直接写 `approval_policy / sandbox_policy`；`request_metadata.harness.access_mode` 只允许作为 legacy / compat 输入兜底，不应继续由新的自动化编辑入口主动写回
- **运行时 Provider 能力快照主链**：App Server `agentSession/turn/start.runtimeOptions.hostOptions.asterChatRequest.provider_config` 允许携带 `model_capabilities / tool_call_strategy / toolshim_model` 这组三个运行时字段；后端会在真正发起 turn 前刷新它们，尤其是 `ollama` 会根据当前模型真实能力在原生 tools 与 `tool_shim` 之间做最终决策。前端不得把模型目录里的静态 tools 标记当作唯一真相
- **运行时交接导出主链**：继续收敛到 App Server `agentSession/handoffBundle/export`；前端统一通过 `src/lib/api/agentRuntime/exportClient.ts` 网关进入，当前 GUI 入口位于 `HarnessStatusPanel`
- **运行时证据导出主链**：继续收敛到 App Server `evidence/export`，用于把 runtime / timeline / artifacts 打包成最小问题证据
- **运行时 replay 样本主链**：继续收敛到 App Server `agentSession/replayCase/export`，复用 handoff bundle + evidence pack 生成 `input / expected / grader / evidence-links`
- **运行时外部分析交接主链**：继续收敛到 App Server `agentSession/analysisHandoff/export`，复用 handoff bundle + evidence pack + replay case 生成 `analysis-brief.md / analysis-context.json / copy_prompt`，供外部诊断代理直接诊断与最小修复；当前 GUI 入口位于 `HarnessStatusPanel`
- **运行时人工审核记录主链**：继续收敛到 App Server `agentSession/reviewDecisionTemplate/export` + `agentSession/reviewDecision/save`；前者复用 `analysis handoff` 生成 `review-decision.md / review-decision.json` 模板，后者把开发者的接受 / 延后 / 拒绝与回归要求回写到同一份工作区制品；当前 GUI 入口位于 `HarnessStatusPanel`
- **会话主题上下文主链**：App Server `agentSession/read` 返回的 `execution_runtime.recent_theme / recent_session_mode` 负责承接最近一次运行态主题上下文；当前端已命中同一 steady-state theme/workbench mode 时，不应继续每回合重复携带 `harness.theme / harness.session_mode`
- **会话运行阶段上下文主链**：App Server `agentSession/read` 返回的 `execution_runtime.recent_gate_key / recent_run_title` 负责承接最近一次通用工作区运行阶段上下文；当前端已命中同一 steady-state gate/run 时，不应继续每回合重复携带 `harness.gate_key / harness.run_title`
- **会话内容上下文主链**：App Server `agentSession/read` 返回的 `execution_runtime.recent_content_id` 负责承接最近一次运行态 `content_id`；当前端已命中同一 steady-state 内容时，不应继续每回合重复携带 `harness.content_id`
- **运行态摘要主链**：Aster `runtime_status` item -> timeline `turn_summary`
- **上下文压缩策略主链**：`workspace.settings.auto_compact` 是运行时自动压缩的唯一 workspace 级开关；App Server `agentSession/turn/start` 与 `agentSession/action/respond` 都会把该设置注入 turn context。值为 `false` 时，Lime 不会做发起前自动压缩，并会显式告诉 Aster 关闭当前回合的内部自动压缩 / overflow recovery 自动压缩；此时只允许用户通过 App Server `agentSession/compact` 手动压缩。
- **旧 `chat_*` 命令**：已停止注册，不应重新回到 `commands::mod` 或 `generate_handler!`
- **旧 `general_chat_*` 边界**：前端 compat 网关与 Rust 命令都已移除，不应重新接入
- **记忆系统**：长期记忆优先走文件化 memory store、`MEMORY.md`、`memory_summary.md`、`MemoryBackend` 与 memory tools；旧 `unified_memory_*`、`memory_runtime_*` 和旧 MemoryPage 灵感库只允许 cleanup / retired guard
- **工作记忆主链**：会话级计划 / 发现 / 进度 / 错误文件后续应通过 memory store 或压缩证据进入受控读模型；不要让页面、Hook 或运行时各自扫描 `.lime/memory`
- **记忆抽取状态主链**：记忆抽取与上下文压缩状态不得继续依赖旧 `memory_runtime_get_extraction_status` 做 current；新的用户可见状态应来自 memory store health、consolidation 状态和 App Server compaction current 边界
- **单回合记忆读取主链**：运行时需要更多长期记忆时应通过 memory tools / `MemoryBackend` 按需 search/read；不要把旧 working memory、统一记忆检索或压缩摘要再拆成第二套 prompt 拼装边界
- **旧项目风格命令**：`style_guide_get` / `style_guide_update` 已下线，不应再从前端网关、Rust 注册或 mock 中接回
- **旧项目模板命令**：`create_template` / `list_templates` / `get_template` / `update_template` / `delete_template` / `set_default_template` / `get_default_template` 已下线，不应再从前端网关、Rust 注册或 mock 中接回
- **旧品牌人设扩展命令**：`get_brand_persona` / `get_brand_extension` / `save_brand_extension` / `update_brand_extension` / `delete_brand_extension` / `list_brand_persona_templates` 已下线，不应再从前端网关、Rust 注册或 mock 中接回
- **图库素材主链**：继续收敛到 `gallery_material_*` 命令族与 `src/lib/api/galleryMaterials.ts`；旧 `create_poster_metadata` / `get_poster_material` / `list_by_*` 命名已下线，不应重新接回

这些示例的意义不是列清单，而是提醒：

**不要再造第三套入口，优先继续把能力收敛到已存在的主链。**

补充说明：

- `execution_runtime.recent_team_selection` 继续承接 steady-state 的 Team 选择恢复
- `agentSession/turn/start.runtimeOptions.hostOptions.asterChatRequest.metadata.harness.team_memory_shadow` 只承接当前请求的 repo-scoped Team 协作记忆，例如最近一次 Team 选择、子代理状态与父会话上下文；它是低优先级协作参考，不替代显式 `selected_team_*` 或 session runtime

- **站点能力主链**：继续收敛到 `site_list_adapters / site_recommend_adapters / site_search_adapters / site_get_adapter_info / site_get_adapter_launch_readiness / site_get_adapter_catalog_status / site_import_adapter_yaml_bundle / site_run_adapter`
- **站点适配器导入主链**：`site_import_adapter_yaml_bundle` 只负责把外部 YAML 来源编译为 Lime 标准并写入 `imported` 目录，不允许带入第二套 runtime、daemon 或自动唤醒浏览器链路
- **站点 Agent 工具主链**：继续收敛到 `lime_site_list / lime_site_recommend / lime_site_search / lime_site_info / lime_site_run`
- **站点技能首页入口主链**：`Claw` 首页、空态推荐和技能选择入口只负责选技能、在当前对话输入区上方挂起 A2UI 补参卡、组装 `initialUserPrompt + harness.service_skill_launch` 上下文并进入 `Claw`；真正执行统一收口到 `Claw` 首回合，不再由首页弹窗、工作区挂载副作用或前端直跑逻辑直接调用 `site_run_adapter`
- **站点结果沉淀主线**：`site_run_adapter` / `lime_site_run` 优先透传 `content_id` 写回当前主稿；只有缺少 `content_id` 时，才回退到 `project_id` 新建结果文档
- **`markdown_bundle` 落盘回传主线**：当站点结果是 `markdown_bundle` 时，`saved_content` 除了 `content_id / project_id / title`，还应继续回传 `project_root_path / markdown_relative_path / images_relative_dir / meta_relative_path / image_count`，让聊天轻卡与 tool timeline 都能直接说明 Markdown 和图片实际保存到哪里
- **`markdown_bundle` 消费主线**：当前端拿到 `saved_content.markdown_relative_path` 后，聊天轻卡、工具结果卡和站点工作台应优先导航到项目内真实 Markdown 文件，而不是继续打开一份运行摘要 artifact；后续 viewer 渲染相对图片时，也必须以该 Markdown 文件路径作为 base 解析本地资源
- **`markdown_bundle + target_language` 后处理主线**：如果站点技能请求参数显式带了 `target_language`，则 preload 成功后应进入统一“已保存 Markdown 后处理”阶段，由 Agent 使用 `Read / Write / Edit` 直接读取并覆写项目里的真实 Markdown 文件；翻译只作用于正文，代码块、内联代码、URL、相对图片路径、文件路径和 Markdown 结构必须保持原样，禁止再次回退到 `lime_site_run`、`webReader`、`WebFetch`、`WebSearch` 或新建第二份摘要 artifact
- **Claw 站点直跑门禁主链**：`site_get_adapter_launch_readiness` 只负责检测“是否存在已附着的真实浏览器会话 + 目标站点上下文”；`site_run_adapter.require_attached_session = true` 时，后端必须拒绝 managed/default fallback，不能后台偷偷起 Chrome
- **attached-session 执行主链**：真实浏览器附着场景下，Bridge `run_adapter` 只允许下发 `adapter_name + args`，禁止继续透传原始脚本文本到扩展 content script，以免触发站点 CSP 的 `unsafe-eval`
- **站点运行失败语义**：`SiteAdapterRunResult` 至少统一输出 `auth_required / no_matching_context / adapter_runtime_error`，并在前端与 Agent 结果里保留 `report_hint`
- **浏览器资料 / 环境预设主链**：`list/save/archive/restore_browser_profile_cmd` 与 `list/save/archive/restore_browser_environment_preset_cmd` 已进入真实 DevBridge 主路径；浏览器模式下不应再默认放进 `mockPriorityCommands`，仅在 DevBridge 不可用时才允许回落 `defaultMocks`
- **浏览器运行时启动主链**：`launch_browser_session` / `launch_browser_runtime_assist` 支持显式 `headless` 启动参数；仅用于 `verify:gui-smoke` 一类自动化校验避免弹出空白 Chrome，正常用户态调用默认仍保持有界面浏览器

## 相关检查脚本

```bash
# 命令契约检查
npm run test:contracts

# 旧边界与死链收口
npm run governance:legacy-report

# 本地统一校验
npm run verify:local
```

## 相关文档

- `internal/aiprompts/governance.md`
- `internal/aiprompts/quality-workflow.md`
- `internal/aiprompts/credential-pool.md`
- `src/lib/governance/agentCommandCatalog.json`
- `src/lib/governance/legacySurfaceCatalog.json`
