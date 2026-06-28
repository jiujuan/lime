export const CONTENT_POST_PLATFORM_DEFINITIONS = [
  {
    type: "wechat_official_account",
    label: "微信公众号后台",
    launchUrl: "https://mp.weixin.qq.com/",
    aliases: [
      "微信公众号后台",
      "微信公众平台",
      "公众号后台",
      "公众号",
      "wechat official account",
      "wechat",
    ],
  },
  {
    type: "xiaohongshu",
    label: "小红书",
    launchUrl: "https://creator.xiaohongshu.com/",
    aliases: ["小红书", "xiaohongshu"],
  },
  {
    type: "zhihu",
    label: "知乎",
    launchUrl: "https://www.zhihu.com/creator",
    aliases: ["知乎", "zhihu"],
  },
  {
    type: "douyin",
    label: "抖音",
    launchUrl: "https://creator.douyin.com/",
    aliases: ["抖音", "douyin"],
  },
  {
    type: "bilibili",
    label: "B站",
    launchUrl: "https://member.bilibili.com/",
    aliases: ["B站", "b站", "bilibili"],
  },
  {
    type: "instagram",
    label: "Instagram",
    launchUrl: "https://www.instagram.com/",
    aliases: ["Instagram"],
  },
  {
    type: "youtube",
    label: "YouTube",
    launchUrl: "https://studio.youtube.com/",
    aliases: ["YouTube"],
  },
  {
    type: "tiktok",
    label: "TikTok",
    launchUrl: "https://www.tiktok.com/upload",
    aliases: ["TikTok"],
  },
  {
    type: "x",
    label: "X / Twitter",
    launchUrl: "https://x.com/compose/post",
    aliases: ["X / Twitter", "Twitter / X", "Twitter", "X"],
  },
] as const;

export type ContentPostPlatformType =
  (typeof CONTENT_POST_PLATFORM_DEFINITIONS)[number]["type"];

export interface ParsedContentPostPlatform {
  platformType?: ContentPostPlatformType;
  platformLabel?: string;
  explicitPlatformText?: string;
  leadingPlatformText?: string;
  inlinePlatformText?: string;
}

export type ContentPostPlatformDefinition =
  (typeof CONTENT_POST_PLATFORM_DEFINITIONS)[number];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePlatformAlias(value?: string): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ");
}

const CONTENT_POST_PLATFORM_ALIAS_PATTERN = CONTENT_POST_PLATFORM_DEFINITIONS
  .flatMap((definition) => [...definition.aliases])
  .sort((left, right) => right.length - left.length)
  .map(escapeRegExp)
  .join("|");

const CONTENT_POST_PLATFORM_ALIAS_BY_NORMALIZED = new Map(
  CONTENT_POST_PLATFORM_DEFINITIONS.flatMap((definition) =>
    [definition.type, definition.label, ...definition.aliases].map(
      (alias) => [normalizePlatformAlias(alias), definition] as const,
    ),
  ),
);

const CONTENT_POST_PLATFORM_DEFINITION_BY_TYPE = new Map(
  CONTENT_POST_PLATFORM_DEFINITIONS.map(
    (definition) => [definition.type, definition] as const,
  ),
);

export const CONTENT_POST_EXPLICIT_PLATFORM_REGEX = new RegExp(
  `(?:平台|渠道|platform|channel)\\s*[:：=]?\\s*(${CONTENT_POST_PLATFORM_ALIAS_PATTERN})(?=$|[\\s,，。；;:：])`,
  "i",
);
export const CONTENT_POST_LEADING_PLATFORM_REGEX = new RegExp(
  `^(${CONTENT_POST_PLATFORM_ALIAS_PATTERN})(?=$|[\\s,，。；;:：])`,
  "i",
);
const CONTENT_POST_INLINE_PLATFORM_REGEX = new RegExp(
  `(?:^|[\\s,，。；;:：到在去进])(${CONTENT_POST_PLATFORM_ALIAS_PATTERN})(?=$|[\\s,，。；;:：]|发布|发表|发文|上传|登录|登陆|提交|群发)`,
  "i",
);

export function trimCommandDecorations(value: string): string {
  return value.replace(/^[,\s，。；;:：]+|[,\s，。；;:：]+$/g, "").trim();
}

export function normalizeContentPostPlatform(value?: string): {
  platformType?: ContentPostPlatformType;
  platformLabel?: string;
} {
  const definition = CONTENT_POST_PLATFORM_ALIAS_BY_NORMALIZED.get(
    normalizePlatformAlias(value),
  );
  return definition
    ? {
        platformType: definition.type,
        platformLabel: definition.label,
      }
    : {};
}

export function resolveContentPostPlatformDefinition(
  platformType?: ContentPostPlatformType,
): ContentPostPlatformDefinition | undefined {
  return platformType
    ? CONTENT_POST_PLATFORM_DEFINITION_BY_TYPE.get(platformType)
    : undefined;
}

export function resolveContentPostPlatformLabel(
  platformType?: ContentPostPlatformType,
): string | undefined {
  return resolveContentPostPlatformDefinition(platformType)?.label;
}

export function parseContentPostPlatform(
  body: string,
  options: { includeInline?: boolean } = {},
): ParsedContentPostPlatform {
  const explicitPlatformText = body
    .match(CONTENT_POST_EXPLICIT_PLATFORM_REGEX)?.[1]
    ?.trim();
  const leadingPlatformText = body
    .match(CONTENT_POST_LEADING_PLATFORM_REGEX)?.[1]
    ?.trim();
  const inlinePlatformText = options.includeInline
    ? body.match(CONTENT_POST_INLINE_PLATFORM_REGEX)?.[1]?.trim()
    : undefined;
  const { platformType, platformLabel } = normalizeContentPostPlatform(
    explicitPlatformText || leadingPlatformText || inlinePlatformText,
  );

  return {
    platformType,
    platformLabel,
    explicitPlatformText,
    leadingPlatformText,
    inlinePlatformText,
  };
}

export function resolveContentPostPlatformLaunchUrl(
  platformType?: ContentPostPlatformType,
): string | undefined {
  return resolveContentPostPlatformDefinition(platformType)?.launchUrl;
}

export function stripContentPostPromptDecorations(
  body: string,
  platformText?: string,
): string {
  const leadingPlatformRegex = platformText
    ? new RegExp(
        `^${platformText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s,，。；;:：])`,
        "i",
      )
    : /^$/;

  return trimCommandDecorations(
    body
      .replace(CONTENT_POST_EXPLICIT_PLATFORM_REGEX, " ")
      .trimStart()
      .replace(leadingPlatformRegex, "")
      .replace(/\s+/g, " "),
  );
}
