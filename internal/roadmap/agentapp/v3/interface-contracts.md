# Agent App v3 接口契约：Workbench Profile

更新时间：2026-06-23
状态：Draft

## 1. 架构不变量

1. **Classic Profile 保持兼容**：现有 `page`、`panel`、`worker`、`storage`、`runtimePackage`、`standalone` 不因 v3 降级。
2. **Workbench Profile 以业务对象为中心**：生产型 App 必须声明 object kind、task kind、surface 和 materializer。
3. **Runtime 是唯一副作用入口**：surface action 只提交 intent，不直接调用模型、工具、文件或 secret。
4. **历史恢复是 contract**：session product workspace 必须能被 read model 恢复。
5. **Raw contract 不进 UI**：UI 只消费 normalizer 输出的 current domain type。

## 2. Profile

```ts
export type AgentAppProfile = "classic" | "workbench";

export interface WorkbenchProfileDeclaration {
  profile: "production";
  productWorkspace: ProductWorkspaceDeclaration;
  productionObjects: ProductionObjectDeclaration[];
  workbenchTasks: WorkbenchTaskDeclaration[];
  objectSurfaces: ObjectSurfaceDeclaration[];
  artifactMaterializers?: ArtifactMaterializerDeclaration[];
  historyRestore?: HistoryRestoreDeclaration;
}
```

规则：

- 没有 `workbench` 字段的 App 默认是 Classic Profile。
- 同一个 App 可以同时拥有 Classic entries 和 Workbench contract，但内容工厂 v3 主路径优先使用 Workbench contract。
- Workbench Profile 不要求提供 `runtimePackage.ui`。

## 3. Production Object

```ts
export interface ProductionObjectDeclaration {
  kind: string;
  title: string;
  description?: string;
  schemaRef?: string;
  artifactKind?: string;
  defaultSurface: string;
  versioning?: "snapshot" | "revision" | "append-only";
  primary?: boolean;
}

export interface ProductionObjectRef {
  appId: string;
  kind: string;
  id: string;
  version?: string;
  sessionId: string;
  artifactIds?: string[];
  sourceTurnId?: string;
  sourceTaskId?: string;
}
```

对象规则：

- `kind` 必须稳定，不能使用展示文案。
- 大内容存 artifact / storage；workspace index 只保存 ref、摘要、状态和 provenance。
- `primary: true` 只能有一个默认主对象；多主对象由 task result 决定。

## 4. Workbench Task

```ts
export interface WorkbenchTaskDeclaration {
  kind: string;
  title: string;
  entryKey?: string;
  inputSchemaRef?: string;
  expectedObjects: string[];
  requiredCapabilities: string[];
  defaultSurface?: string;
  humanReview?: boolean;
}
```

任务规则：

- `kind` 是 runtime / history / evidence 的稳定标识。
- `expectedObjects` 必须引用 `productionObjects.kind`。
- task 可以由 composer intent、slash command、surface action 或历史 continue action 启动。

## 5. Object Surface

```ts
export interface ObjectSurfaceDeclaration {
  objectKind: string;
  surfaceKind: string;
  title: string;
  renderer: "host_builtin" | "app_declared" | "artifact_viewer";
  layout?: "document" | "grid" | "storyboard" | "form" | "checklist";
  actions: SurfaceActionDeclaration[];
}

export interface SurfaceActionDeclaration {
  key: string;
  title: string;
  intent: "revise" | "regenerate" | "create_variant" | "export" | "approve" | "custom";
  startsTaskKind?: string;
  respondsToAction?: boolean;
  risk?: "read" | "write" | "external_side_effect";
}
```

surface 规则：

- `renderer=host_builtin` 优先用于文章、图片网格、storyboard 等通用对象。
- `renderer=app_declared` 只能声明数据 contract，不允许注入任意宿主内部组件。
- action 必须走 guard；高风险动作必须产生审批或 confirmation。

## 6. Artifact Materializer

```ts
export interface ArtifactMaterializerDeclaration {
  key: string;
  taskKind: string;
  acceptedArtifactKinds: string[];
  outputObjectKind: string;
  schemaRef?: string;
  writeBack: {
    productWorkspace: boolean;
    artifact: boolean;
    evidence?: boolean;
    humanReviewRequired?: boolean;
  };
}
```

materializer 规则：

- materializer 把 runtime 结果变成 production object，不把结果塞进 assistant 正文充当事实源。
- validation 失败时必须产生诊断，而不是创建半可信对象。
- 同一 task 可产生多个 object，但必须标出 primary object。

## 7. Session Product Workspace

```ts
export interface SessionProductWorkspace {
  schemaVersion: 1;
  appId: string;
  sessionId: string;
  primaryObjectRef?: ProductionObjectRef;
  selectedObjectRef?: ProductionObjectRef;
  objects: ProductWorkspaceObject[];
  layoutState?: ProductWorkspaceLayoutState;
  updatedAt: string;
}

export interface ProductWorkspaceObject {
  ref: ProductionObjectRef;
  title: string;
  status: "draft" | "generating" | "ready" | "needs_review" | "archived";
  summary?: string;
  previewArtifactId?: string;
  source: {
    taskKind?: string;
    taskId?: string;
    turnId?: string;
    artifactIds?: string[];
    evidenceIds?: string[];
  };
}

export interface ProductWorkspaceLayoutState {
  activeSurfaceKind?: string;
  splitMode?: "chat-product-profile" | "chat-only" | "product-profile-collapsed";
  scrollAnchor?: string;
}
```

workspace 规则：

- `selectedObjectRef` 在用户点击产物或切换 surface 时更新。
- `layoutState` 只能保存恢复工作现场所需的轻量状态。
- 历史恢复必须能在缺少 layoutState 时使用 primary object 回退。

## 8. History Restore

```ts
export interface HistoryRestoreDeclaration {
  defaultSurface: "primaryArtifact" | "selectedObject" | "chat";
  restoreSelection: boolean;
  restoreLayout: boolean;
  fallback: "artifactPreview" | "chatOnly";
}
```

恢复规则：

1. `restoreSelection=true` 时优先使用 `selectedObjectRef`。
2. `restoreLayout=true` 时恢复中间对话 + 右侧产物 Profile 的布局状态，但必须受当前 viewport 和 Right Surface availability 约束。
3. 历史 action_required 不自动恢复为当前可提交表单；新操作必须基于当前 surface action 创建。

## 9. Surface Action Intent

```ts
export interface SurfaceActionIntent {
  appId: string;
  sessionId: string;
  objectRef: ProductionObjectRef;
  actionKey: string;
  input?: unknown;
  source: "user" | "runtime" | "restore";
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
| `WORKBENCH_PROFILE_UNSUPPORTED` | 宿主不支持 Workbench Profile。 |
| `PRODUCTION_OBJECT_SCHEMA_INVALID` | object schema 无法校验。 |
| `OBJECT_SURFACE_UNAVAILABLE` | 对象 surface 不存在或不可用。 |
| `PRODUCT_WORKSPACE_MISSING` | 历史 session 没有 product workspace，需回退。 |
| `SURFACE_ACTION_BLOCKED` | action 被 policy / readiness / permission 阻止。 |
| `ARTIFACT_MATERIALIZATION_FAILED` | runtime 结果无法物化为 production object。 |
