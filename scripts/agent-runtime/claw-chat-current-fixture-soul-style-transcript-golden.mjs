export const SOUL_STYLE_TRANSCRIPT_SURFACES = [
  "before_tool",
  "tool_running",
  "after_tool_success",
  "after_tool_partial_failure",
  "after_tool_failure",
  "body_detail",
  "closing_suggestion",
];

export const SOUL_STYLE_TRANSCRIPT_FACTS = Object.freeze({
  toolName: "search_query",
  evidenceTarget: "Soul output surface audit",
  verifiedSourceCount: "3 sources",
  primarySource: "internal/roadmap/soul/acceptance.md",
  partialFailure: "secondary fixture timed out",
  failureReason: "provider timeout",
  recoveryAction: "retry with cached read model facts",
  riskBoundary: "facts unchanged",
});

const REQUIRED_FACT_TOKENS_BY_SURFACE = {
  before_tool: ["search_query", "Soul output surface audit"],
  tool_running: ["search_query", "checkpoint"],
  after_tool_success: ["3 sources", "internal/roadmap/soul/acceptance.md"],
  after_tool_partial_failure: [
    "3 sources",
    "secondary fixture timed out",
  ],
  after_tool_failure: [
    "provider timeout",
    "retry with cached read model facts",
  ],
  body_detail: [
    "3 sources",
    "internal/roadmap/soul/acceptance.md",
    "facts unchanged",
  ],
  closing_suggestion: ["highest-risk gap", "facts unchanged"],
};

export const SOUL_STYLE_TRANSCRIPT_GOLDENS = [
  {
    profileId: "cheeky_sassy_executor",
    packId: "com.lime.soul.cheeky-sassy-executor",
    tone: "cheeky_sassy",
    entries: {
      before_tool:
        "我先用 search_query 把 Soul output surface audit 的证据捞回来，省得我们俩一本正经地猜空气。",
      tool_running:
        "search_query 还在 checkpoint 上跑，我先盯住返回边界，不让未回来的事实偷偷冒充结论。",
      after_tool_success:
        "资料回来了，search_query 这次没掉链子：3 sources 命中，主证据是 internal/roadmap/soul/acceptance.md。",
      after_tool_partial_failure:
        "先别把它包装成全胜：3 sources 已经可用，但 secondary fixture timed out，缺口单独放一边。",
      after_tool_failure:
        "这次工具没打穿，provider timeout 是阻断点；下一步 retry with cached read model facts，别硬演成功。",
      body_detail:
        "重点不是语气多热闹，是 3 sources 和 internal/roadmap/soul/acceptance.md 这组 facts unchanged。",
      closing_suggestion:
        "下一步先处理 highest-risk gap，facts unchanged，别绕远路。",
    },
  },
  {
    profileId: "warm_supportive_companion",
    packId: "com.lime.soul.warm-supportive-companion",
    tone: "warm_supportive",
    entries: {
      before_tool:
        "我先用 search_query 补齐 Soul output surface audit 的证据，这样后面的判断会稳一点。",
      tool_running:
        "search_query 还在 checkpoint，我先等关键返回落稳，不把未确认内容提前写进结论。",
      after_tool_success:
        "结果已经回来：3 sources 可用，主证据是 internal/roadmap/soul/acceptance.md。可以先基于这一版继续。",
      after_tool_partial_failure:
        "已确认的部分先保留：3 sources 可用；secondary fixture timed out 的缺口单独标出，后面再补。",
      after_tool_failure:
        "这次没有拿到完整结果。原因是 provider timeout，下一步先 retry with cached read model facts。",
      body_detail:
        "可以先看确定部分：3 sources 和 internal/roadmap/soul/acceptance.md；这组 facts unchanged。",
      closing_suggestion:
        "下一步先做 highest-risk gap 的小步验证，facts unchanged 后再展开。",
    },
  },
  {
    profileId: "cool_confident_operator",
    packId: "com.lime.soul.cool-confident-operator",
    tone: "cool_confident",
    entries: {
      before_tool:
        "我先跑 search_query。目标是 Soul output surface audit 的证据，拿到后直接收敛。",
      tool_running:
        "search_query 执行中。当前只看 checkpoint，不提前下判断。",
      after_tool_success:
        "结果到位。3 sources 命中，主证据是 internal/roadmap/soul/acceptance.md。",
      after_tool_partial_failure:
        "可用部分先落地：3 sources。缺口是 secondary fixture timed out，单独处理。",
      after_tool_failure:
        "调用失败。阻断点是 provider timeout；恢复路径是 retry with cached read model facts。",
      body_detail:
        "结论先行。3 sources、internal/roadmap/soul/acceptance.md、facts unchanged 分开看。",
      closing_suggestion:
        "下一步直接处理 highest-risk gap，保持 facts unchanged。",
    },
  },
  {
    profileId: "calm_professional_partner",
    packId: "com.lime.soul.calm-professional-partner",
    tone: "calm_professional",
    entries: {
      before_tool:
        "我先使用 search_query 核对 Soul output surface audit 的可用证据，再给出结论边界。",
      tool_running:
        "search_query 当前处于 checkpoint，结论需等待返回内容确认。",
      after_tool_success:
        "证据已确认：3 sources 可用，主证据为 internal/roadmap/soul/acceptance.md。",
      after_tool_partial_failure:
        "已完成部分为 3 sources；未完成部分为 secondary fixture timed out，需要标记为未验证。",
      after_tool_failure:
        "本次调用未完成。原因是 provider timeout；恢复动作是 retry with cached read model facts。",
      body_detail:
        "按事实说明：3 sources、internal/roadmap/soul/acceptance.md；当前 facts unchanged。",
      closing_suggestion:
        "建议先补齐 highest-risk gap，并保持 facts unchanged 后再继续执行。",
    },
  },
];

export function buildSoulStyleTranscriptGoldenReport() {
  const factSignature = JSON.stringify(SOUL_STYLE_TRANSCRIPT_FACTS);
  return {
    facts: SOUL_STYLE_TRANSCRIPT_FACTS,
    surfaces: SOUL_STYLE_TRANSCRIPT_SURFACES,
    profiles: SOUL_STYLE_TRANSCRIPT_GOLDENS.map((golden) => golden.profileId),
    checks: SOUL_STYLE_TRANSCRIPT_SURFACES.map((surface) => {
      const entries = SOUL_STYLE_TRANSCRIPT_GOLDENS.map((golden) => ({
        profileId: golden.profileId,
        packId: golden.packId,
        tone: golden.tone,
        text: golden.entries[surface],
        factSignature,
      }));
      const requiredTokens = REQUIRED_FACT_TOKENS_BY_SURFACE[surface] ?? [];
      return {
        surface,
        entries,
        textCount: entries.length,
        uniqueTextCount: new Set(entries.map((entry) => entry.text)).size,
        factSignatureCount: new Set(
          entries.map((entry) => entry.factSignature),
        ).size,
        missingFactsByProfile: Object.fromEntries(
          entries
            .map((entry) => [
              entry.profileId,
              requiredTokens.filter((token) => !entry.text.includes(token)),
            ])
            .filter(([, missing]) => missing.length > 0),
        ),
      };
    }),
  };
}
