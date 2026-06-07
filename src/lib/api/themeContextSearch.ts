import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  AppServerClient,
  type AppServerAgentSessionReadResponse,
  type AppServerJsonRpcNotification,
} from "@/lib/api/appServer";

const CONTEXT_SEARCH_SESSION_PREFIX = "__lime_theme_context_search__";
const DEFAULT_APP_ID = "desktop";

export type ThemeContextSearchMode = "web" | "social";

export interface SearchCitation {
  title: string;
  url: string;
}

export interface ThemeContextSearchResult {
  title: string;
  summary: string;
  citations: SearchCitation[];
  rawResponse: string;
  attemptsSummary?: string;
}

export interface SearchThemeContextOptions {
  workspaceId: string;
  projectId?: string;
  providerType: string;
  model: string;
  query: string;
  mode: ThemeContextSearchMode;
}

export interface ThemeContextSearchCommandResponse {
  title?: string;
  summary?: string;
  citations?: SearchCitation[];
  rawResponse?: string;
  attemptsSummary?: string;
}

type ThemeContextSearchAppServerClient = Pick<
  AppServerClient,
  "startSession" | "startTurn" | "readSession"
>;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildContextSearchPrompt(
  query: string,
  mode: ThemeContextSearchMode,
): string {
  const socialConstraint =
    mode === "social"
      ? [
          "优先寻找社交媒体平台、品牌官方账号、媒体社媒账号、KOL/KOC 讨论与趋势帖相关信息。",
          "如果直接社媒来源不足，可补充官方网站或媒体报道，但摘要必须保留社媒传播视角。",
          "适当优先关注小红书、微博、公众号、抖音、B站、知乎等中文平台。",
        ].join("\n")
      : "优先提供最新且可信的公开网络资料，兼顾官方来源与主流媒体。";

  return [
    "你是 Lime 的资料检索助手。",
    "本任务用于生成工作台上下文。请根据检索主题自主判断是否需要使用可用联网搜索工具；需要最新事实时先检索再整理。",
    "不要编造来源。若可用资料不足，请在摘要中明确说明不确定性。",
    "你必须返回且仅返回一个 JSON 对象，不要使用 Markdown 代码块，不要输出多余说明。",
    "JSON 结构如下：",
    '{"title":"","summary":"","citations":[{"title":"","url":""}]}',
    "字段要求：",
    "1. title：12-28 字中文标题，概括本次检索主题。",
    "2. summary：180-320 字中文摘要，聚合 3-5 个来源，突出时间点、关键事实、趋势或洞察。",
    "3. citations：保留 3-5 条最重要来源，必须带可访问 URL。",
    socialConstraint,
    `检索主题：${query.trim()}`,
  ].join("\n");
}

function buildContextSearchSystemPrompt(): string {
  return [
    "你是 Lime 桌面端里的资料检索助手。",
    "你需要为用户的工作台生成可信上下文；需要最新公开事实时，自己判断并使用可用联网搜索工具。",
    "只输出调用方要求的 JSON 对象。",
  ].join("\n");
}

function randomIdSegment(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) {
    return randomUUID;
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildAuxiliarySessionId(): string {
  return `${CONTEXT_SEARCH_SESSION_PREFIX}-${randomIdSegment()}`;
}

function buildAuxiliaryTurnId(): string {
  return `turn-theme-context-search-${randomIdSegment()}`;
}

function createSearchMetadata({
  mode,
  projectId,
  query,
}: Pick<SearchThemeContextOptions, "mode" | "projectId" | "query">) {
  return {
    hiddenFromUserRecents: true,
    source: "theme_context_search",
    themeContextSearch: {
      mode,
      projectId: projectId?.trim() || undefined,
      query,
    },
  };
}

export async function searchThemeContextWithAppServer(
  options: SearchThemeContextOptions,
  appServerClient: ThemeContextSearchAppServerClient = new AppServerClient(),
): Promise<ThemeContextSearchCommandResponse> {
  const workspaceId = options.workspaceId.trim();
  const providerType = options.providerType.trim();
  const model = options.model.trim();
  const query = options.query.trim();

  if (!workspaceId) {
    throw new Error("缺少 workspaceId，无法执行上下文搜索");
  }
  if (!providerType || !model) {
    throw new Error("当前未选择可用模型，无法执行上下文搜索");
  }
  if (!query) {
    throw new Error("搜索词不能为空");
  }

  const sessionId = buildAuxiliarySessionId();
  const turnId = buildAuxiliaryTurnId();
  const prompt = buildContextSearchPrompt(query, options.mode);
  const systemPrompt = buildContextSearchSystemPrompt();
  const metadata = createSearchMetadata({
    mode: options.mode,
    projectId: options.projectId,
    query,
  });

  await appServerClient.startSession({
    sessionId,
    appId: DEFAULT_APP_ID,
    workspaceId,
    businessObjectRef: {
      kind: "agent.session",
      id: `theme-context-search:${workspaceId}:${Date.now()}`,
      title: "上下文搜索",
      metadata: {
        ...metadata,
        title: "上下文搜索",
        executionStrategy: "react",
        providerSelector: providerType,
        modelName: model,
      },
    },
  });

  const turnResult = await appServerClient.startTurn({
    sessionId,
    turnId,
    input: {
      text: prompt,
    },
    runtimeOptions: {
      stream: true,
      providerPreference: providerType,
      modelPreference: model,
      metadata,
      hostOptions: {
        asterChatRequest: {
          message: prompt,
          session_id: sessionId,
          workspace_id: workspaceId,
          provider_preference: providerType,
          model_preference: model,
          system_prompt: systemPrompt,
          turn_id: turnId,
          metadata,
          turn_config: {
            provider_preference: providerType,
            model_preference: model,
            system_prompt: systemPrompt,
            metadata,
          },
        },
      },
    },
    queueIfBusy: false,
    skipPreSubmitResume: true,
  });

  const readResult = await appServerClient.readSession({ sessionId });
  const rawResponse =
    extractAssistantTextFromReadResponse(readResult.result, turnId) ||
    extractAssistantTextFromNotifications(turnResult.notifications, turnId);

  return {
    rawResponse,
    attemptsSummary: extractAttemptsSummary(turnResult.notifications, turnId),
  };
}

function extractAssistantTextFromReadResponse(
  response: AppServerAgentSessionReadResponse,
  turnId: string,
): string {
  const detail = asRecord(response.detail);
  const messages = Array.isArray(detail?.messages) ? detail.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = asRecord(messages[index]);
    if (!message || message.role !== "assistant") {
      continue;
    }
    const messageId = typeof message.id === "string" ? message.id : "";
    if (messageId && !messageId.startsWith(turnId)) {
      continue;
    }
    const text = normalizeWhitespace(readMessageText(message));
    if (text) {
      return text;
    }
  }
  return "";
}

function extractAssistantTextFromNotifications(
  notifications: AppServerJsonRpcNotification[],
  turnId: string,
): string {
  return normalizeWhitespace(
    notifications
      .map((notification) => eventFromNotification(notification))
      .filter((event) => event?.turnId === turnId)
      .filter((event) => event?.type === "message.delta")
      .map((event) => readPayloadText(event?.payload))
      .join(""),
  );
}

function extractAttemptsSummary(
  notifications: AppServerJsonRpcNotification[],
  turnId: string,
): string | undefined {
  for (let index = notifications.length - 1; index >= 0; index -= 1) {
    const event = eventFromNotification(notifications[index]);
    if (
      event?.turnId !== turnId ||
      (event.type !== "turn.final_done" && event.type !== "turn.completed")
    ) {
      continue;
    }
    const payload = asRecord(event.payload);
    const attempts =
      readString(payload, "attempts") ||
      readString(payload, "attemptsSummary") ||
      readString(payload, "attempts_summary");
    if (attempts) {
      return attempts;
    }
  }
  return undefined;
}

function eventFromNotification(notification?: AppServerJsonRpcNotification) {
  if (notification?.method !== APP_SERVER_METHOD_AGENT_SESSION_EVENT) {
    return null;
  }
  const params = asRecord(notification.params);
  const event = asRecord(params?.event) ?? params;
  if (!event) {
    return null;
  }
  return {
    type: readString(event, "type") || readString(event, "eventType"),
    turnId: readString(event, "turnId") || readString(event, "turn_id"),
    payload: event.payload,
  };
}

function readMessageText(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      const record = asRecord(part);
      if (!record) {
        return "";
      }
      return readString(record, "text") || readString(record, "content");
    })
    .join("");
}

function readPayloadText(payload: unknown): string {
  const record = asRecord(payload);
  if (!record) {
    return "";
  }
  return (
    readString(record, "text") ||
    readString(record, "delta") ||
    readString(record, "content") ||
    readString(record, "message") ||
    readString(record, "outputText") ||
    readString(record, "output_text")
  );
}

function readString(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
