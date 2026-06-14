import type {
  AgentRuntimeFileCheckpointThreadSummary,
  AgentRuntimeThreadReadModel,
} from "@/lib/api/agentRuntime";
import type { AgentThreadItem } from "@/lib/api/agentProtocol";
import type { AgentRuntimeExecutionEvent } from "@limecloud/agent-ui-contracts";
import {
  projectCodingWorkbenchViewFromEvents,
  type CodingWorkbenchView,
} from "@limecloud/agent-runtime-projection";
import type {
  CanvasWorkbenchHeaderView,
} from "../components/CanvasWorkbenchLayout";
import type {
  CanvasWorkbenchChangeItem,
  CanvasWorkbenchChangeView,
} from "../components/canvas-workbench/changes/CanvasWorkbenchChangesPanelViewModel";
import { extractFileNameFromPath } from "./workspacePath";

export function resolvePathLeaf(value?: string | null): string {
  const normalized = (value || "").trim().replace(/\\/g, "/");
  if (!normalized) {
    return "";
  }
  const segments = normalized.split("/").filter(Boolean);
  return segments.at(-1) || normalized;
}

export function buildWorkspaceHeaderView({
  projectRootPath,
  workspacePathMissing,
  workspaceHealthError,
}: {
  projectRootPath?: string | null;
  workspacePathMissing?: boolean | null;
  workspaceHealthError?: boolean | null;
}): CanvasWorkbenchHeaderView {
  const workspaceRootLabel = resolvePathLeaf(projectRootPath) || "未绑定";
  const hasProjectRootPath = Boolean(projectRootPath?.trim());
  const workspaceBindingValue = workspacePathMissing
    ? "路径缺失"
    : workspaceHealthError
      ? "状态异常"
      : hasProjectRootPath
        ? "已连接"
        : "未绑定";

  return {
    eyebrow: "Project Workspace",
    tabLabel: "文件",
    tabBadge:
      workspacePathMissing || workspaceHealthError
        ? workspaceBindingValue
        : hasProjectRootPath
          ? workspaceRootLabel
          : undefined,
    tabBadgeTone:
      workspacePathMissing || workspaceHealthError
        ? "rose"
        : hasProjectRootPath
          ? "sky"
          : undefined,
    title: hasProjectRootPath ? "项目工作区文件" : "当前没有可浏览的项目文件",
    subtitle: hasProjectRootPath
      ? projectRootPath || ""
      : "绑定工作区目录后，这里会显示真实文件树。",
    badges: [
      {
        key: "workspace-root",
        label: hasProjectRootPath ? workspaceRootLabel : "未绑定工作区",
        tone: hasProjectRootPath ? "accent" : "default",
      },
      ...(workspacePathMissing
        ? [
            {
              key: "workspace-missing",
              label: "路径缺失",
              tone: "default" as const,
            },
          ]
        : workspaceHealthError
          ? [
              {
                key: "workspace-health-error",
                label: "状态异常",
                tone: "default" as const,
              },
            ]
          : []),
    ],
    summaryStats: [
      {
        key: "workspace-root",
        label: "工作区",
        value: workspaceRootLabel,
        detail: projectRootPath?.trim() || "绑定工作区后，这里会展示真实文件树。",
        tone: hasProjectRootPath ? "accent" : "default",
      },
      {
        key: "workspace-binding",
        label: "目录状态",
        value: workspaceBindingValue,
        detail: workspacePathMissing
          ? "当前工作区路径缺失，需重新选择目录。"
          : workspaceHealthError
            ? "当前工作区状态异常，建议先修复后再继续浏览。"
            : hasProjectRootPath
              ? "画布会直接读取项目里的真实文件。"
              : "尚未绑定工作区目录。",
        tone:
          workspacePathMissing || workspaceHealthError ? "default" : "success",
      },
    ],
    panelCopy: {
      unavailableText: "当前工作区路径不可用，暂时无法浏览项目文件。",
      emptyText: "当前会话没有绑定可浏览的工作区目录。",
      sectionEyebrow: "项目目录",
      loadingText: "正在加载目录...",
      emptyDirectoryText: "暂无目录内容。",
    },
  };
}

function normalizeChangePath(value: string): string {
  return value.replace(/\\/g, "/").trim().toLowerCase();
}

function readMetadataRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readMetadataNumber(
  metadata: Record<string, unknown> | null,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function readMetadataText(
  metadata: Record<string, unknown> | null,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function readMetadataRecordValue(
  metadata: Record<string, unknown> | null,
  keys: string[],
): Record<string, unknown> | null {
  for (const key of keys) {
    const value = readMetadataRecord(metadata?.[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function readMetadataVersionNo(
  metadata: Record<string, unknown> | null,
): number | undefined {
  const versionRecord = readMetadataRecordValue(metadata, [
    "artifactVersion",
    "artifact_version",
  ]);
  const rawValue =
    metadata?.artifactVersionNo ??
    metadata?.artifact_version_no ??
    metadata?.versionNo ??
    metadata?.version_no ??
    versionRecord?.versionNo ??
    versionRecord?.version_no;
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue === "string" && rawValue.trim()) {
    const parsed = Number(rawValue.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function buildFileArtifactChangeItem(
  item: Extract<AgentThreadItem, { type: "file_artifact" }>,
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null,
): CanvasWorkbenchChangeItem | null {
  const path = item.path.trim();
  if (!path) {
    return null;
  }

  const metadata = readMetadataRecord(item.metadata);
  const versionRecord = readMetadataRecordValue(metadata, [
    "artifactVersion",
    "artifact_version",
  ]);
  const preview =
    readMetadataText(metadata, [
      "previewText",
      "preview_text",
      "artifactSummary",
      "artifact_summary",
      "summary",
    ]) || item.content;
  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  const metadataCheckpointPath =
    readMetadataText(metadata, ["snapshotPath", "snapshot_path"]) ||
    readMetadataText(versionRecord, ["snapshotPath", "snapshot_path"]);
  const checkpointMatches =
    latestCheckpoint?.path &&
    normalizeChangePath(latestCheckpoint.path) === normalizeChangePath(path);
  const versionNo = readMetadataVersionNo(metadata);

  return {
    id: item.id,
    path,
    displayName:
      readMetadataText(metadata, [
        "artifactTitle",
        "artifact_title",
        "title",
        "fileName",
        "filename",
      ]) || extractFileNameFromPath(path),
    source: item.source,
    status: item.status,
    preview,
    currentContent: item.content || preview || null,
    previousContent: null,
    checkpointPath: checkpointMatches
      ? latestCheckpoint.path
      : metadataCheckpointPath || null,
    checkpointLabel:
      (checkpointMatches && latestCheckpoint.version_no) || versionNo
        ? `v${latestCheckpoint?.version_no || versionNo}`
        : null,
  };
}

function upsertChangeItem(
  byPath: Map<string, CanvasWorkbenchChangeItem>,
  item: CanvasWorkbenchChangeItem | null,
) {
  if (!item) {
    return;
  }
  const key = normalizeChangePath(item.path);
  const previous = byPath.get(key);
  if (!previous) {
    byPath.set(key, item);
    return;
  }

  byPath.set(key, {
    ...previous,
    ...item,
    id: previous.id,
    currentContent: item.currentContent || previous.currentContent,
    previousContent: item.previousContent ?? previous.previousContent,
    preview: item.preview || previous.preview,
    source: item.source || previous.source,
    absolutePath: item.absolutePath || previous.absolutePath,
    status:
      previous.status === "in_progress" || item.status === "in_progress"
        ? "in_progress"
        : previous.status === "failed" || item.status === "failed"
          ? "failed"
          : item.status || previous.status,
    checkpointPath: item.checkpointPath || previous.checkpointPath,
    checkpointLabel: item.checkpointLabel || previous.checkpointLabel,
  });
}

export function buildCanvasWorkbenchChangeView({
  threadItems,
  fileCheckpointSummary,
  onOpenFile,
}: {
  threadItems: AgentThreadItem[];
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  onOpenFile?: (path: string) => void | Promise<void>;
}): CanvasWorkbenchChangeView | null {
  const byPath = new Map<string, CanvasWorkbenchChangeItem>();

  threadItems
    .filter(
      (item): item is Extract<AgentThreadItem, { type: "file_artifact" }> =>
        item.type === "file_artifact",
    )
    .forEach((item) => {
      upsertChangeItem(
        byPath,
        buildFileArtifactChangeItem(item, fileCheckpointSummary),
      );
    });

  const items = [...byPath.values()];
  if (items.length === 0 && !(fileCheckpointSummary?.count ?? 0)) {
    return null;
  }

  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  const latestCheckpointPath =
    latestCheckpoint?.snapshot_path || latestCheckpoint?.path || null;

  return {
    items,
    checkpointCount: fileCheckpointSummary?.count ?? 0,
    latestCheckpointPath,
    onOpenFile,
  };
}

function runtimeEventStatusFromThreadItem(
  item: Pick<AgentThreadItem, "status">,
): AgentRuntimeExecutionEvent["status"] {
  if (item.status === "in_progress") return "running";
  return item.status;
}

function codingRuntimeEventBase(
  item: Pick<
    AgentThreadItem,
    "id" | "thread_id" | "turn_id" | "sequence" | "started_at" | "updated_at"
  >,
): Pick<
  AgentRuntimeExecutionEvent,
  | "id"
  | "schemaVersion"
  | "runtimeId"
  | "threadId"
  | "turnId"
  | "sequence"
  | "createdAt"
> {
  return {
    id: `coding_thread_item_${item.id}`,
    schemaVersion: "lime-runtime-event/v0.1",
    runtimeId: "agent-session-thread-items",
    threadId: item.thread_id,
    turnId: item.turn_id,
    sequence: item.sequence,
    createdAt: item.started_at || item.updated_at,
  };
}

function fileArtifactRuntimeEvent(
  item: Extract<AgentThreadItem, { type: "file_artifact" }>,
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null,
): AgentRuntimeExecutionEvent | null {
  const change = buildFileArtifactChangeItem(item, fileCheckpointSummary);
  if (!change) return null;
  const metadata = readMetadataRecord(item.metadata);
  const checkpointRef =
    change.checkpointPath ||
    readMetadataText(metadata, ["checkpointRef", "checkpoint_ref"]) ||
    undefined;
  const diffRef =
    readMetadataText(metadata, ["diffRef", "diff_ref"]) || undefined;
  return {
    ...codingRuntimeEventBase(item),
    eventClass: "file.changed",
    kind: "draft",
    owner: "artifact",
    status: runtimeEventStatusFromThreadItem(item),
    title: change.displayName || extractFileNameFromPath(change.path),
    artifactId: `thread-file:${item.id}`,
    artifactRefs: [`thread-file:${item.id}`],
    payload: {
      path: change.path,
      changeKind: "modified",
      source: item.source,
      checkpointRef,
      diffRef,
      preview: change.preview,
      versionNo: readMetadataVersionNo(metadata),
    },
  };
}

function commandRuntimeEvents(
  item: Extract<AgentThreadItem, { type: "command_execution" }>,
): AgentRuntimeExecutionEvent[] {
  const base = codingRuntimeEventBase(item);
  const commandId = item.id;
  const outputRef = item.aggregated_output ? `thread-output:${item.id}` : undefined;
  const started: AgentRuntimeExecutionEvent = {
    ...base,
    id: `${base.id}_started`,
    eventClass: "command.started",
    kind: "tool",
    status: item.status === "in_progress" ? "running" : "completed",
    toolCallId: commandId,
    title: item.command,
    payload: {
      commandId,
      command: item.command,
      cwd: item.cwd,
    },
  };
  if (item.status === "in_progress") {
    return [started];
  }
  const exited: AgentRuntimeExecutionEvent = {
    ...base,
    id: `${base.id}_exited`,
    eventClass: "command.exited",
    kind: "tool",
    status:
      item.status === "failed" || (item.exit_code ?? 0) !== 0
        ? "failed"
        : "completed",
    toolCallId: commandId,
    title: item.command,
    refIds: outputRef ? [outputRef] : undefined,
    payload: {
      commandId,
      command: item.command,
      cwd: item.cwd,
      exitCode: item.exit_code ?? (item.status === "failed" ? 1 : 0),
      outputRef,
      preview: item.aggregated_output,
    },
  };
  return [started, exited];
}

function toolCallRuntimeEvents(
  item: Extract<AgentThreadItem, { type: "tool_call" }>,
): AgentRuntimeExecutionEvent[] {
  const metadata = readMetadataRecord(item.metadata);
  const toolName = item.tool_name.trim();
  const normalizedToolName = toolName.toLowerCase();
  const base = codingRuntimeEventBase(item);
  const maybePatchId =
    readMetadataText(metadata, ["patchId", "patch_id"]) || item.id;
  if (
    normalizedToolName.includes("patch") ||
    normalizedToolName.includes("apply")
  ) {
    const path = readMetadataText(metadata, ["path", "filePath", "file_path"]);
    const started: AgentRuntimeExecutionEvent = {
      ...base,
      id: `${base.id}_patch_started`,
      eventClass: "patch.started",
      kind: "tool",
      status: item.status === "in_progress" ? "running" : "completed",
      toolCallId: maybePatchId,
      title: item.tool_name,
      payload: {
        patchId: maybePatchId,
        path,
      },
    };
    if (item.status === "in_progress") {
      return [started];
    }
    return [
      started,
      {
        ...base,
        id: `${base.id}_patch_terminal`,
        eventClass: item.status === "failed" ? "patch.failed" : "patch.applied",
        kind: "tool",
        status: item.status === "failed" ? "failed" : "completed",
        toolCallId: maybePatchId,
        title: item.tool_name,
        refIds: item.output ? [`thread-output:${item.id}`] : undefined,
        payload: {
          patchId: maybePatchId,
          path,
          diffRef: readMetadataText(metadata, ["diffRef", "diff_ref"]),
          failureCategory:
            item.status === "failed"
              ? readMetadataText(metadata, ["failureCategory", "failure_category"]) ||
                "tool_failed"
              : undefined,
          recoveryHintRef: readMetadataText(metadata, [
            "recoveryHintRef",
            "recovery_hint_ref",
          ]),
          outputRef: item.output ? `thread-output:${item.id}` : undefined,
        },
      },
    ];
  }
  return [
    {
      ...base,
      eventClass: item.status === "failed" ? "tool.failed" : "tool.result",
      kind: "tool",
      status: runtimeEventStatusFromThreadItem(item),
      toolCallId: item.id,
      title: item.tool_name,
      refIds: item.output ? [`thread-output:${item.id}`] : undefined,
      payload: {
        toolName: item.tool_name,
        outputRef: item.output ? `thread-output:${item.id}` : undefined,
        failureCategory: item.status === "failed" ? "tool_failed" : undefined,
      },
    },
  ];
}

function approvalRuntimeEvents(
  item: Extract<
    AgentThreadItem,
    { type: "approval_request" | "request_user_input" }
  >,
): AgentRuntimeExecutionEvent[] {
  const base = codingRuntimeEventBase(item);
  const actionId = item.request_id || item.id;
  const required: AgentRuntimeExecutionEvent = {
    ...base,
    id: `${base.id}_required`,
    eventClass: "action.required",
    kind: "action",
    status: item.response ? "completed" : "blocked",
    actionId,
    title: item.prompt || item.action_type || "Action required",
    payload: {
      actionKind: item.action_type,
      targetModule: "coding-workbench",
      controls: ["approve", "reject"],
      commandId:
        item.type === "approval_request"
          ? readMetadataText(readMetadataRecord(item.arguments), [
              "commandId",
              "command_id",
            ])
          : undefined,
    },
  };
  if (!item.response) {
    return [required];
  }
  return [
    required,
    {
      ...base,
      id: `${base.id}_resolved`,
      eventClass: "action.resolved",
      kind: "action",
      status: "completed",
      actionId,
      title: item.prompt || item.action_type || "Action resolved",
      payload: {
        decision: "submitted",
        resolvedFromEventId: required.id,
      },
    },
  ];
}

function testRunRuntimeEvents(
  item: Extract<AgentThreadItem, { type: "turn_summary" }>,
): AgentRuntimeExecutionEvent[] {
  const metadata = readMetadataRecord(item.metadata);
  const kind = readMetadataText(metadata, ["kind", "type"]);
  if (kind !== "test_run" && kind !== "test") {
    return [];
  }
  const base = codingRuntimeEventBase(item);
  const testRunId =
    readMetadataText(metadata, ["testRunId", "test_run_id"]) || item.id;
  const commandId = readMetadataText(metadata, ["commandId", "command_id"]);
  return [
    {
      ...base,
      id: `${base.id}_test_started`,
      eventClass: "test.started",
      kind: "tool",
      status: "running",
      toolCallId: testRunId,
      title: item.text || "Test run",
      payload: {
        testRunId,
        commandId,
        suite: readMetadataText(metadata, ["suite"]),
      },
    },
    {
      ...base,
      id: `${base.id}_test_completed`,
      eventClass: "test.completed",
      kind: "tool",
      status: item.status === "failed" ? "failed" : "completed",
      toolCallId: testRunId,
      title: item.text || "Test run",
      refIds: [`thread-output:${item.id}`],
      payload: {
        testRunId,
        commandId,
        result: item.status === "failed" ? "failed" : "passed",
        passed: readMetadataNumber(metadata, ["passed"]),
        failed: readMetadataNumber(metadata, ["failed"]),
        failureCategory:
          item.status === "failed"
            ? readMetadataText(metadata, ["failureCategory", "failure_category"]) ||
              "test_failed"
            : undefined,
        outputRef: `thread-output:${item.id}`,
      },
    },
  ];
}

export function buildCodingRuntimeEventsFromThreadItems({
  threadItems,
  fileCheckpointSummary,
}: {
  threadItems: readonly AgentThreadItem[];
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
}): AgentRuntimeExecutionEvent[] {
  const events = threadItems.flatMap((item): AgentRuntimeExecutionEvent[] => {
    if (item.type === "file_artifact") {
      const event = fileArtifactRuntimeEvent(item, fileCheckpointSummary);
      return event ? [event] : [];
    }
    if (item.type === "command_execution") {
      return commandRuntimeEvents(item);
    }
    if (item.type === "tool_call") {
      return toolCallRuntimeEvents(item);
    }
    if (item.type === "approval_request" || item.type === "request_user_input") {
      return approvalRuntimeEvents(item);
    }
    if (item.type === "turn_summary") {
      return testRunRuntimeEvents(item);
    }
    if (item.type === "error" || item.type === "warning") {
      return [
        {
          ...codingRuntimeEventBase(item),
          eventClass: item.type === "error" ? "runtime.error" : "runtime.warning",
          kind: "state",
          status: item.type === "error" ? "failed" : "completed",
          title: item.message,
          payload: {
            code: item.type === "warning" ? item.code : undefined,
          },
        },
      ];
    }
    return [];
  });

  return events.map((event, index) => ({
    ...event,
    sequence: index + 1,
  }));
}

function statusForCanvasChange(
  status: string,
): CanvasWorkbenchChangeItem["status"] {
  if (status === "running" || status === "pending") return "in_progress";
  if (status === "failed") return "failed";
  return "completed";
}

export function buildCanvasWorkbenchChangeViewFromCodingProjection({
  codingView,
  fileCheckpointSummary,
  onOpenFile,
}: {
  codingView: CodingWorkbenchView;
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  onOpenFile?: (path: string) => void | Promise<void>;
}): CanvasWorkbenchChangeView | null {
  const items = codingView.changes.map((change): CanvasWorkbenchChangeItem => ({
    id: change.id,
    path: change.path,
    displayName: extractFileNameFromPath(change.path),
    source: "runtime",
    status: statusForCanvasChange(change.status),
    changeKind: change.changeKind,
    preview: change.preview,
    currentContent: change.preview ?? null,
    previousContent: null,
    checkpointPath: change.checkpointRef || null,
    checkpointLabel: change.checkpointRef ? "snapshot" : null,
  }));
  if (items.length === 0 && !(fileCheckpointSummary?.count ?? 0)) {
    return null;
  }
  const latestCheckpoint = fileCheckpointSummary?.latest_checkpoint || null;
  return {
    items,
    checkpointCount: fileCheckpointSummary?.count ?? 0,
    latestCheckpointPath:
      latestCheckpoint?.snapshot_path || latestCheckpoint?.path || null,
    onOpenFile,
  };
}

export function buildCodingWorkbenchProjectionFromThreadItems({
  threadItems,
  fileCheckpointSummary,
  threadRead,
}: {
  threadItems: readonly AgentThreadItem[];
  fileCheckpointSummary?: AgentRuntimeFileCheckpointThreadSummary | null;
  threadRead?: AgentRuntimeThreadReadModel | null;
}): CodingWorkbenchView {
  return projectCodingWorkbenchViewFromEvents({
    executionEvents: buildCodingRuntimeEventsFromThreadItems({
      threadItems,
      fileCheckpointSummary,
    }),
    codingReadModel: threadRead,
  });
}
