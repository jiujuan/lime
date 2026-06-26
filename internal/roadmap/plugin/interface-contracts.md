# Lime 插件接口契约

更新时间：2026-06-25  
状态：Draft

## 1. 架构不变量

1. 插件是安装、授权、发布的根对象。
2. `工作台应用` 是插件子类型，不是另一个并列根产品。
3. 右侧 Renderer 由 Host 管壳子，插件只提供数据和动作。
4. 激活必须显式，不能语义猜测。
5. 历史恢复必须能恢复插件上下文和主产物。
6. 复杂 UI 只能作为受控 pane 挂在 Right Surface 内，不能自建第二右栏。

## 2. Plugin Manifest

```ts
export interface PluginManifest {
  id: string;
  displayName: string;
  version: string;
  description?: string;
  categories?: string[];
  capabilities?: string[];
  skills?: SkillDeclaration[];
  agentApps?: AgentAppDeclaration[];
  connectors?: ConnectorDeclaration[];
  mcpServers?: McpServerDeclaration[];
  artifactRenderers?: ArtifactRendererDeclaration[];
  activationEntries?: ActivationEntryDeclaration[];
  historyRestore?: PluginHistoryRestoreDeclaration;
}
```

### 2.1 SkillDeclaration

```ts
export interface SkillDeclaration {
  id: string;
  title: string;
  description?: string;
  path?: string;
  required?: boolean;
}
```

### 2.2 AgentAppDeclaration

```ts
export interface AgentAppDeclaration {
  id: string;
  title: string;
  description?: string;
  uiKind?: "page" | "pane" | "webcontents_view";
  defaultSurfaceKind?: string;
  entryKey?: string;
}
```

### 2.3 ConnectorDeclaration

```ts
export interface ConnectorDeclaration {
  id: string;
  title: string;
  kind: "account" | "api" | "data_source" | "external_app";
  required?: boolean;
}
```

### 2.4 ActivationEntryDeclaration

```ts
export interface ActivationEntryDeclaration {
  key: string;
  title: string;
  kind: "plugin" | "agentApp" | "skill";
  intent?: "manual" | "at_command" | "history_restore" | "chip";
  defaultObjectKind?: string;
}
```

## 3. Activation Context

```ts
export interface PluginActivationContext {
  sessionId: string;
  pluginId: string;
  activeAgentAppId?: string;
  activeEntryKey?: string;
  selectedSkillKeys?: string[];
  selectedObjectRef?: PluginObjectRef;
  openedTabs?: string[];
  pinnedTabs?: string[];
  source: "user" | "history" | "route" | "restore";
}
```

## 4. Plugin Object Ref

```ts
export interface PluginObjectRef {
  pluginId: string;
  objectKind: string;
  objectId: string;
  version?: string;
  artifactIds?: string[];
  sourceTurnId?: string;
  sourceTaskId?: string;
}
```

## 5. Artifact Renderer

```ts
export interface ArtifactRendererDeclaration {
  artifactType: string;
  surfaceKind: string;
  rendererKind: "host_builtin" | "app_declared" | "artifact_viewer";
  entry?: string;
  capabilities?: string[];
  fallbackRendererKind?: string;
  defaultPane?: string;
}
```

规则：

- `host_builtin` 优先用于通用对象。
- `app_declared` 只能作为受控 pane 接入。
- `artifact_viewer` 只能渲染 artifact，不得隐式改写 workspace。
- 任何 renderer 都不能直接拿到 provider key、filesystem 或 Node 能力。

## 6. Right Surface Contract

```ts
export interface PluginRightSurfaceContract {
  defaultActiveTab?: string;
  supportedTabs: string[];
  historyRestore: {
    enabled: boolean;
    restoreSelection: boolean;
    restoreLayout: boolean;
  };
  productWorkspace: {
    enabled: boolean;
    primaryObjectKind?: string;
    selectionPolicy?: "last" | "primary" | "manual";
  };
  panes?: Array<{
    kind: string;
    title: string;
    rendererKind: "host_builtin" | "app_declared" | "artifact_viewer";
  }>;
}
```

## 7. Session Workspace

```ts
export interface PluginSessionWorkspace {
  schemaVersion: 1;
  sessionId: string;
  pluginId: string;
  primaryObjectRef?: PluginObjectRef;
  selectedObjectRef?: PluginObjectRef;
  objects: PluginWorkspaceObject[];
  layoutState?: PluginWorkspaceLayoutState;
  updatedAt: string;
}

export interface PluginWorkspaceObject {
  ref: PluginObjectRef;
  title: string;
  status: "draft" | "generating" | "ready" | "needs_review" | "archived";
  summary?: string;
  previewArtifactId?: string;
  source: {
    taskKind?: string;
    taskId?: string;
    turnId?: string;
    evidenceIds?: string[];
  };
}

export interface PluginWorkspaceLayoutState {
  activeSurfaceKind?: string;
  activeTabId?: string;
  splitMode?: "chat-product-profile" | "chat-only" | "product-profile-collapsed";
}
```

## 8. History Restore Contract

```ts
export interface PluginHistoryRestoreDeclaration {
  defaultSurface: "primaryArtifact" | "selectedObject" | "chat";
  restoreSelection: boolean;
  restoreLayout: boolean;
  fallback: "artifactPreview" | "chatOnly";
}
```

恢复规则：

1. 优先恢复 `selectedObjectRef`。
2. 其次恢复 `primaryObjectRef`。
3. 失败时回退到 artifact preview。
4. 再失败时回退到聊天历史。

## 9. Surface Action Intent

```ts
export interface PluginSurfaceActionIntent {
  sessionId: string;
  pluginId: string;
  objectKind: string;
  objectId: string;
  actionKey: string;
  input?: unknown;
  source: "user" | "restore" | "runtime";
  idempotencyKey?: string;
}
```

路由规则：

- `startsTaskKind` 动作转成 `agentSession/turn/start` 或等价 workbench task request。
- `respondsToAction` 动作转成 `agentSession/action/respond`。
- export 类动作走 capability policy，并产生 evidence。

## 10. Stable Error

| code | 场景 |
| --- | --- |
| `PLUGIN_MANIFEST_INVALID` | manifest 无法解析。 |
| `PLUGIN_ACTIVATION_BLOCKED` | 当前插件无法被显式激活。 |
| `PLUGIN_RENDERER_UNAVAILABLE` | 目标 renderer 不可用。 |
| `PLUGIN_RIGHT_SURFACE_MISSING` | 右侧 tab / workspace 未准备好。 |
| `PLUGIN_ACTION_BLOCKED` | action 被 policy 或 readiness 阻止。 |
| `PLUGIN_WORKSPACE_MISSING` | 历史 session 没有可恢复的插件 workspace。 |
| `PLUGIN_RENDERER_SCHEMA_INVALID` | renderer contract 无法校验。 |
