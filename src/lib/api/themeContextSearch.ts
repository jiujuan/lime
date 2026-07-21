import {
  APP_SERVER_METHOD_AGENT_SESSION_EVENT,
  AppServerClient,
  type AppServerJsonRpcNotification,
} from "@/lib/api/appServer";
import { createApplicationAdditionalContext } from "@/lib/api/agentProtocolOps";

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
  "startSession" | "startTurn" | "readThread"
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

  const prompt = buildContextSearchPrompt(query, options.mode);
  const systemPrompt = buildContextSearchSystemPrompt();
  const metadata = createSearchMetadata({
    mode: options.mode,
    projectId: options.projectId,
    query,
  });

  const startResult = await appServerClient.startSession({
    modelProvider: providerType,
    model,
    serviceName: "上下文搜索",
    threadSource: "appServer",
    historyMode: "paginated",
    baseInstructions: systemPrompt,
  });
  const thread = asRecord(asRecord(startResult.result)?.thread);
  const threadId = readString(thread, "id");
  if (!threadId) {
    throw new Error("thread/start did not return a canonical thread id");
  }

  const turnResult = await appServerClient.startTurn({
    threadId,
    input: [{ type: "text", text: prompt }],
    additionalContext: createApplicationAdditionalContext(metadata),
  });
  const turn = asRecord(asRecord(turnResult.result)?.turn);
  const turnId = readString(turn, "id");
  if (!turnId) {
    throw new Error("turn/start did not return a canonical turn id");
  }

  const readResult = await appServerClient.readThread({
    threadId,
    includeTurns: true,
  });
  const rawResponse =
    extractAssistantTextFromReadResponse(readResult.result, turnId) ||
    extractAssistantTextFromNotifications(turnResult.notifications, turnId);

  if (!rawResponse) {
    throw new Error("App Server 上下文搜索未返回 assistant 输出");
  }

  return {
    rawResponse,
    attemptsSummary: extractAttemptsSummary(turnResult.notifications, turnId),
  };
}

function extractAssistantTextFromReadResponse(
  response: unknown,
  turnId: string,
): string {
  const thread = asRecord(asRecord(response)?.thread);
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = asRecord(turns[turnIndex]);
    if (!turn || turn.id !== turnId) {
      continue;
    }
    const items = Array.isArray(turn.items) ? turn.items : [];
    for (let itemIndex = items.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = asRecord(items[itemIndex]);
      if (item?.type !== "agentMessage") {
        continue;
      }
      const text = normalizeWhitespace(
        typeof item.text === "string" ? item.text : "",
      );
      if (text) {
        return text;
      }
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
    if (event?.turnId !== turnId || event.type !== "turn.completed") {
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
