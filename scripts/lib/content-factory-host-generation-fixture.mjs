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

function channelFromPrompt(prompt) {
  const compact = compactWhitespace(prompt);
  const match = compact.match(/微信公众号|公众号|小红书|博客|报告|长文|文章/);
  return match?.[0] ?? "文章";
}

function sentenceFragments(value) {
  const compact = compactWhitespace(value);
  const fragments = compact
    .split(/(?:[。！？!?；;]|\s+-\s+|\n)+/)
    .flatMap((fragment) =>
      fragment.split(/(?:，|,)\s*(?=要求|并|同时|最终|先|再|最后|不要|需要)/),
    )
    .map((fragment) =>
      fragment
        .replace(/^用户原始请求：?/, "")
        .replace(/^生成目标：?/, "")
        .trim(),
    )
    .filter((fragment) => fragment.length >= 4);
  return Array.from(new Set(fragments));
}

function promptDerivedParagraphs({ prompt, topic }) {
  const fragments = sentenceFragments(prompt);
  const primaryFragments =
    fragments.length > 0 ? fragments : [`写作主题：${topic}`];
  if (primaryFragments.length < 3) {
    const channel = channelFromPrompt(prompt);
    const compactPrompt = compactWhitespace(prompt || topic);
    return [
      `用户请求围绕“${topic}”，目标是形成一篇${channel}正文。`,
      `开篇需要直接回应“${topic}”为什么值得被读者关注。`,
      `主体段落应紧扣原始请求：“${compactPrompt}”。`,
      `证据和案例位置应留给真实检索结果或用户材料，不能在本地 fixture 中补造事实。`,
      `结尾需要回到“${topic}”的行动建议，方便后续编辑继续扩写。`,
    ];
  }
  const paragraphs = primaryFragments.slice(0, 5).map((fragment) => {
    const normalized = fragment.replace(/^写一篇/, "").trim();
    return normalized.endsWith("。") ? normalized : `${normalized}。`;
  });
  while (paragraphs.length < 5) {
    const source =
      primaryFragments[paragraphs.length % primaryFragments.length];
    const suffix =
      paragraphs.length % 2 === 0
        ? `围绕“${topic}”继续展开这一要求。`
        : `保持主题“${topic}”和用户请求一致。`;
    paragraphs.push(`${source} ${suffix}`.trim());
  }
  return paragraphs;
}

export function buildContentFactoryHostGenerationFixtureMarkdown(body) {
  const messages = requestMessagesText(body);
  const prompt = extractOriginalPrompt(messages);
  const topic = topicFromPrompt(prompt);
  const fingerprint = promptFingerprint(
    prompt || messages || "content-factory",
  );
  const paragraphs = promptDerivedParagraphs({
    prompt,
    topic,
  });

  return [
    `# ${topic}`,
    "",
    `<!-- fixtureOnlyHostGeneration: true; fixturePromptFingerprint: ${fingerprint} -->`,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
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
