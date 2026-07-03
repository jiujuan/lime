import { createHash } from "node:crypto";

import {
  DEFAULT_FIXTURE_API_KEY,
  DEFAULT_FIXTURE_MODEL,
  startOpenAiCompatibleFixtureServer,
} from "./openai-compatible-fixture-server.mjs";

const PROVIDER_ID = "fixture-openai";
const PROVIDER_NAME = "openai";

function normalizeText(value, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function flattenMessageContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }
      if (!part || typeof part !== "object") {
        return "";
      }
      return normalizeText(part.text ?? part.content ?? "");
    })
    .filter(Boolean)
    .join("\n");
}

function requestMessagesText(body) {
  return Array.isArray(body?.messages)
    ? body.messages
        .map((message) => flattenMessageContent(message?.content))
        .filter(Boolean)
        .join("\n\n")
    : "";
}

function extractOriginalPrompt(text) {
  const normalized = normalizeText(text);
  const marker = "用户原始请求：";
  const index = normalized.indexOf(marker);
  if (index < 0) {
    return normalized;
  }
  const afterMarker = normalized.slice(index + marker.length).trim();
  const endIndex = afterMarker.indexOf("\n\n生成目标：");
  return normalizeText(
    endIndex >= 0 ? afterMarker.slice(0, endIndex) : afterMarker,
  );
}

function compactWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function promptFingerprint(prompt) {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}

function topicFromPrompt(prompt) {
  const compact = compactWhitespace(prompt);
  const match = compact.match(
    /(?:关于|围绕)(.+?)(?:的(?:公众号)?文章|，|。|$)/,
  );
  const topic = normalizeText(match?.[1], compact);
  return topic.slice(0, 42) || "内容生产任务";
}

export function buildContentFactoryHostGenerationFixtureMarkdown(body) {
  const messages = requestMessagesText(body);
  const prompt = extractOriginalPrompt(messages);
  const topic = topicFromPrompt(prompt);
  const fingerprint = promptFingerprint(
    prompt || messages || "content-factory",
  );

  return [
    `# ${topic}：fixture-only 托管生成草稿`,
    "",
    `fixturePromptFingerprint: ${fingerprint}`,
    "",
    "> 这是本地 OpenAI-compatible fixture 按请求动态生成的测试正文，只用于证明 hostManagedGeneration 注入链路；生产完成度必须使用 live Provider evidence。",
    "",
    "## 请求摘要",
    "",
    compactWhitespace(prompt || "未提供用户原始请求。"),
    "",
    "## 资料检索",
    "",
    `- 围绕“${topic}”确认读者、交付边界和可验证依据。`,
    "- 将检索过程保留在 workflow JSONL 审计中，不展示到右侧编辑器。",
    "",
    "## 正文草稿",
    "",
    `这篇文章应从“${topic}”的真实使用场景切入，说明为什么读者现在需要理解它，以及它能解决什么具体问题。`,
    "",
    "正文不应来自 worker 内置模板，也不应由插件持有 Provider Key。宿主负责模型调用与权限边界，worker 只消费宿主回填的 Markdown，并把它转换为 Article Workspace Patch。",
    "",
    "段落级流式应先输出可编辑的文章对象，再随着宿主生成结果递增更新 artifact snapshot；没有宿主正文时必须 fail closed。",
    "",
    "## 交付检查",
    "",
    "- 正文来自 hostManagedGeneration.outputs[].content。",
    "- workflow 过程只写入 workflow-events.jsonl。",
    "- 右侧 Article Editor 只展示文章对象，不展示 workflow 步骤。",
  ].join("\n");
}

export function contentFactoryHostGenerationAsterChatRequest(baseUrl) {
  return {
    provider_config: {
      provider_id: PROVIDER_ID,
      provider_name: PROVIDER_NAME,
      model_name: DEFAULT_FIXTURE_MODEL,
      api_key: DEFAULT_FIXTURE_API_KEY,
      base_url: baseUrl,
      tool_call_strategy: "native",
    },
    provider_preference: PROVIDER_ID,
    model_preference: DEFAULT_FIXTURE_MODEL,
    reasoning_effort: "low",
  };
}

export async function startContentFactoryHostGenerationFixture() {
  const responses = [];
  const fixture = await startOpenAiCompatibleFixtureServer({
    scriptedResponses: [
      ({ body }) => {
        const content = buildContentFactoryHostGenerationFixtureMarkdown(body);
        const fingerprint =
          content.match(/fixturePromptFingerprint:\s*([a-f0-9]+)/)?.[1] ?? null;
        responses.push({
          fingerprint,
          contentLength: content.length,
          title: content.split(/\r?\n/)[0]?.replace(/^#\s*/, "") ?? null,
        });
        return { type: "text", content };
      },
    ],
  });

  return {
    baseUrl: fixture.baseUrl,
    requests: fixture.requests,
    responses,
    summary: () => ({
      provider: PROVIDER_ID,
      model: DEFAULT_FIXTURE_MODEL,
      requestCount: fixture.requests.length,
      requests: fixture.requests.map((request) => ({
        method: request.method,
        url: request.path,
        authorization: request.authorization ? "present" : "missing",
        bodyIncludesModel: JSON.stringify(request.body || {}).includes(
          DEFAULT_FIXTURE_MODEL,
        ),
        bodyIncludesPrompt: JSON.stringify(request.body || {}).includes(
          "内容工厂",
        ),
      })),
      responseFingerprints: responses.map((response) => response.fingerprint),
      responseTitles: responses
        .map((response) => response.title)
        .filter(Boolean),
      fixtureOnly: true,
    }),
    close: fixture.close,
  };
}
