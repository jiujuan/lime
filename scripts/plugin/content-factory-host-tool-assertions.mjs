const HOST_TOOL_REQUEST_SOURCE = "workspace_patch_host_tool_requests";
export const MIN_HOST_TOOL_REQUEST_COUNT = 3;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function eventRecordType(event) {
  return event?.type || event?.eventType || "";
}

function arrayField(value, keys) {
  for (const key of keys) {
    const candidate = value?.[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

export function artifactFromEvent(event) {
  return event?.payload?.artifact || null;
}

export function workspacePatchFromArtifact(artifact) {
  return (
    artifact?.metadata?.contentFactoryWorkspacePatch ||
    artifact?.metadata?.workspace_patch ||
    artifact?.contentFactoryWorkspacePatch ||
    null
  );
}

export function articleFromWorkspacePatch(patch) {
  return patch?.objects?.find((object) => object?.ref?.kind === "articleDraft");
}

export function hostToolRequestsFromArticle(article) {
  return arrayField(article?.source, ["hostToolRequests", "host_tool_requests"]);
}

export function documentLengthFromArtifactEvent(event) {
  const article = articleFromWorkspacePatch(
    workspacePatchFromArtifact(artifactFromEvent(event)),
  );
  const text = article?.source?.documentText;
  return typeof text === "string" ? text.length : 0;
}

function hostToolEvidenceFromArticle(article) {
  return arrayField(article?.source, [
    "hostToolEvidence",
    "host_tool_evidence",
    "hostSearchEvidence",
    "host_search_evidence",
    "searchEvidence",
    "search_evidence",
  ]);
}

function toolEventSource(payload) {
  return (
    payload?.source ||
    payload?.metadata?.source ||
    payload?.runtimeEvent?.source ||
    payload?.runtimeEvent?.metadata?.source ||
    ""
  );
}

function toolEventName(payload) {
  return (
    payload?.toolName ||
    payload?.tool_name ||
    payload?.name ||
    payload?.runtimeEvent?.toolName ||
    payload?.runtimeEvent?.tool_name ||
    payload?.result?.metadata?.toolName ||
    ""
  );
}

function toolEventCallId(payload) {
  return (
    payload?.toolCallId ||
    payload?.tool_call_id ||
    payload?.toolId ||
    payload?.tool_id ||
    payload?.runtimeEvent?.toolCallId ||
    payload?.runtimeEvent?.tool_id ||
    ""
  );
}

export function assertHostToolRequestContract(
  article,
  label,
  minCount = MIN_HOST_TOOL_REQUEST_COUNT,
) {
  const requests = hostToolRequestsFromArticle(article);
  assert(
    requests.length >= minCount,
    `${label} missing hostToolRequests: expected >=${minCount}, got ${requests.length}`,
  );
  for (const request of requests) {
    const requestId = request?.id || "(missing id)";
    const toolName = request?.toolName || request?.tool_name || request?.tool;
    assert(
      toolName === "WebSearch",
      `${label} hostToolRequest ${requestId} must use WebSearch, got ${toolName}`,
    );
    const query =
      request?.query || request?.params?.query || request?.arguments?.query;
    assert(query, `${label} hostToolRequest ${requestId} missing query`);
    assert(
      request?.status === "ready_for_host_execution",
      `${label} hostToolRequest ${requestId} must stay ready_for_host_execution, got ${request?.status}`,
    );
    assert(
      request?.workflowKey === "content_article_workflow" ||
        request?.workflow_key === "content_article_workflow",
      `${label} hostToolRequest ${requestId} missing content_article_workflow key`,
    );
    const presentation = request?.presentation || {};
    assert(
      presentation.userVisible === true,
      `${label} hostToolRequest ${requestId} must be user visible`,
    );
    assert(
      presentation.surface === "conversation_timeline",
      `${label} hostToolRequest ${requestId} must target conversation_timeline`,
    );
    assert(
      presentation.title === "网络搜索",
      `${label} hostToolRequest ${requestId} presentation.title mismatch`,
    );
  }
  return {
    hostToolRequestCount: requests.length,
    hostToolRequestIds: requests.map((request) => request.id || null),
    hostToolPresentationTitles: requests.map(
      (request) => request?.presentation?.title || null,
    ),
  };
}

export function assertHostToolEvidenceContract(article, label, minCount) {
  const source = article?.source || {};
  const evidence = hostToolEvidenceFromArticle(article);
  assert(
    evidence.length >= minCount,
    `${label} missing hostToolEvidence: expected >=${minCount}, got ${evidence.length}`,
  );
  assert(
    source.hostToolStatus === "completed",
    `${label} hostToolStatus must be completed, got ${source.hostToolStatus}`,
  );
  if (source.hostSearchStatus) {
    assert(
      source.hostSearchStatus === "completed",
      `${label} hostSearchStatus must be completed, got ${source.hostSearchStatus}`,
    );
  }
  for (const item of evidence) {
    assert(
      item?.tool === "WebSearch" || item?.toolName === "WebSearch",
      `${label} hostToolEvidence must use WebSearch, got ${item?.tool || item?.toolName}`,
    );
    assert(
      item?.source === HOST_TOOL_REQUEST_SOURCE,
      `${label} hostToolEvidence source mismatch: ${item?.source}`,
    );
    assert(
      item?.status === "completed",
      `${label} hostToolEvidence status must be completed, got ${item?.status}`,
    );
    assert(item?.toolCallId, `${label} hostToolEvidence missing toolCallId`);
  }
  return {
    hostToolEvidenceCount: evidence.length,
    hostToolStatus: source.hostToolStatus || null,
    hostSearchStatus: source.hostSearchStatus || null,
  };
}

export function assertHostToolEventTimeline(
  events,
  label,
  minCount = MIN_HOST_TOOL_REQUEST_COUNT,
) {
  const indexed = events.map((event, index) => ({
    event,
    index,
    type: eventRecordType(event),
    payload: event?.payload || {},
  }));
  const hostEvents = indexed.filter(({ type, payload }) => {
    if (!["tool.started", "tool.args", "tool.result", "tool.failed"].includes(type)) {
      return false;
    }
    return (
      toolEventSource(payload) === HOST_TOOL_REQUEST_SOURCE ||
      String(toolEventCallId(payload)).startsWith("workspace-patch-host-tool-")
    );
  });
  assert(
    hostEvents.length >= minCount * 3,
    `${label} missing host tool lifecycle events: expected >=${minCount * 3}, got ${hostEvents.length}`,
  );
  for (const { type, payload } of hostEvents) {
    assert(
      toolEventSource(payload) === HOST_TOOL_REQUEST_SOURCE,
      `${label} ${type} source mismatch: ${toolEventSource(payload)}`,
    );
    const toolName = toolEventName(payload);
    if (toolName) {
      assert(
        toolName === "WebSearch",
        `${label} ${type} must use WebSearch, got ${toolName}`,
      );
    }
  }
  const started = hostEvents.filter(({ type }) => type === "tool.started");
  const args = hostEvents.filter(({ type }) => type === "tool.args");
  const results = hostEvents.filter(({ type }) => type === "tool.result");
  const failed = hostEvents.filter(({ type }) => type === "tool.failed");
  assert(
    started.length >= minCount,
    `${label} expected >=${minCount} host tool.started, got ${started.length}`,
  );
  assert(
    args.length >= minCount,
    `${label} expected >=${minCount} host tool.args, got ${args.length}`,
  );
  assert(
    results.length >= minCount,
    `${label} expected >=${minCount} host tool.result, got ${results.length}`,
  );
  assert(
    failed.length === 0,
    `${label} must not contain failed host tool events`,
  );
  const startedIds = new Set(
    started.map(({ payload }) => toolEventCallId(payload)).filter(Boolean),
  );
  for (const { payload } of results) {
    const toolCallId = toolEventCallId(payload);
    assert(
      startedIds.has(toolCallId),
      `${label} host tool.result without matching tool.started: ${toolCallId}`,
    );
    assert(
      payload.status === "completed" || payload.success === true,
      `${label} host tool.result must be completed: ${toolCallId}`,
    );
  }
  const finalArtifactIndex = indexed.findLastIndex(
    ({ type }) => type === "artifact.snapshot",
  );
  const lastTerminalIndex = Math.max(...results.map(({ index }) => index));
  assert(
    finalArtifactIndex > lastTerminalIndex,
    `${label} final artifact.snapshot must be emitted after host tool results`,
  );
  return {
    hostToolEventCount: hostEvents.length,
    hostToolStartedCount: started.length,
    hostToolArgsCount: args.length,
    hostToolResultCount: results.length,
    hostToolFailedCount: failed.length,
    hostToolSource: HOST_TOOL_REQUEST_SOURCE,
  };
}

function assertArtifactSnapshotEventsHaveHostTools(
  events,
  label,
  minCount = MIN_HOST_TOOL_REQUEST_COUNT,
) {
  const artifactEvents = events.filter(
    (event) => eventRecordType(event) === "artifact.snapshot",
  );
  assert(artifactEvents.length > 0, `${label} missing artifact.snapshot`);
  const streamingHostToolRequestCounts = artifactEvents
    .filter((event) => artifactFromEvent(event)?.status === "streaming")
    .map((event) =>
      hostToolRequestsFromArticle(
        articleFromWorkspacePatch(
          workspacePatchFromArtifact(artifactFromEvent(event)),
        ),
      ).length,
    )
    .filter((count) => count >= minCount);
  assert(
    streamingHostToolRequestCounts.length > 0,
    `${label} streaming artifact snapshots missing hostToolRequests`,
  );
  const finalArticle = articleFromWorkspacePatch(
    workspacePatchFromArtifact(artifactFromEvent(artifactEvents.at(-1))),
  );
  const requestSummary = assertHostToolRequestContract(
    finalArticle,
    `${label} final artifact.snapshot`,
    minCount,
  );
  const evidenceSummary = assertHostToolEvidenceContract(
    finalArticle,
    `${label} final artifact.snapshot`,
    requestSummary.hostToolRequestCount,
  );
  return {
    eventArtifactSnapshotCount: artifactEvents.length,
    eventArtifactStreamingHostToolRequestCounts: streamingHostToolRequestCounts,
    eventArtifactHostToolRequestCount: requestSummary.hostToolRequestCount,
    eventArtifactHostToolEvidenceCount: evidenceSummary.hostToolEvidenceCount,
  };
}

export function assertReadModelHostToolProjection(detail, minCount) {
  const items = arrayField(detail, ["items"]);
  const hostItems = items.filter(
    (item) =>
      item?.metadata?.source === HOST_TOOL_REQUEST_SOURCE ||
      String(item?.id || "").startsWith("workspace-patch-host-tool-"),
  );
  assert(
    hostItems.length >= minCount,
    `read model items missing host tool projection: expected >=${minCount}, got ${hostItems.length}`,
  );
  for (const item of hostItems) {
    assert(
      item?.type === "web_search",
      `read model host tool item must be web_search, got ${item?.type}`,
    );
    assert(
      item?.status === "completed",
      `read model host tool item must be completed, got ${item?.status}`,
    );
    assert(
      item?.metadata?.source === HOST_TOOL_REQUEST_SOURCE,
      `read model host tool item source mismatch: ${item?.metadata?.source}`,
    );
  }
  const threadRead = detail.thread_read || detail.threadRead || {};
  const threadReadToolCalls = arrayField(threadRead, [
    "tool_calls",
    "toolCalls",
  ]);
  const toolCalls =
    threadReadToolCalls.length > 0
      ? threadReadToolCalls
      : arrayField(detail, ["tool_calls", "toolCalls"]);
  const hostToolCalls = toolCalls.filter(
    (call) =>
      call?.metadata?.source === HOST_TOOL_REQUEST_SOURCE ||
      String(call?.id || "").startsWith("workspace-patch-host-tool-") ||
      String(call?.tool_call_id || "").startsWith("workspace-patch-host-tool-"),
  );
  assert(
    hostToolCalls.length >= minCount,
    `thread_read.tool_calls missing host tool projection: expected >=${minCount}, got ${hostToolCalls.length}`,
  );
  for (const call of hostToolCalls) {
    assert(
      call?.tool_name === "WebSearch",
      `thread_read host tool call must use WebSearch, got ${call?.tool_name}`,
    );
    assert(
      call?.status === "completed",
      `thread_read host tool call must be completed, got ${call?.status}`,
    );
    assert(
      call?.metadata?.source === HOST_TOOL_REQUEST_SOURCE,
      `thread_read host tool call source mismatch: ${call?.metadata?.source}`,
    );
  }
  return {
    readModelHostToolItemCount: hostItems.length,
    readModelHostToolCallCount: hostToolCalls.length,
  };
}

export function artifactSummaryHasWorkspacePatch(artifact) {
  return Boolean(
    artifact?.metadata?.contentFactoryWorkspacePatch ||
      artifact?.metadata?.workspace_patch ||
      artifact?.metadata?.pluginWorker?.outputArtifactKind ===
        "content_factory.workspace_patch",
  );
}

export function assertEvidenceExportHasHostTools(
  exportResult,
  minCount = MIN_HOST_TOOL_REQUEST_COUNT,
) {
  const events = arrayField(exportResult, ["events"]);
  const artifacts = arrayField(exportResult, ["artifacts"]);
  const eventSummary = assertHostToolEventTimeline(
    events,
    "evidence export",
    minCount,
  );
  const artifactEventSummary = assertArtifactSnapshotEventsHaveHostTools(
    events,
    "evidence export",
    minCount,
  );
  return {
    hostToolEventCount: eventSummary.hostToolEventCount,
    hostToolResultCount: eventSummary.hostToolResultCount,
    hostToolArtifactEventRequestCount:
      artifactEventSummary.eventArtifactHostToolRequestCount,
    hostToolArtifactEventEvidenceCount:
      artifactEventSummary.eventArtifactHostToolEvidenceCount,
    workspacePatchArtifactSummaryCount: artifacts.filter(
      artifactSummaryHasWorkspacePatch,
    ).length,
  };
}
