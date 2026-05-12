export const PLAIN_VISUAL_BRIEF_CONFIRMATION =
  "这看起来是图片生成需求，要我直接调用画图功能生成吗？";

const EXPLICIT_COMMAND_PATTERN = /^\s*[@/]/;
const VISUAL_OBJECT_PATTERN =
  /(配图|图片|图像|插画|海报|封面|主视觉|视觉|画面|画一张|画个|生成一张|出一张|做一张|设计一张)/i;
const VISUAL_BRIEF_PATTERNS = [
  /\b(?:1:1|3:4|4:5|9:16|16:9)\b/i,
  /(竖版|横版|方图|比例|尺寸|留白|标题区|构图|色调|配色|风格|水彩|插画|摄影|电影感|海报|封面|主视觉|品牌视觉|背景|主体|字体)/i,
];
const TEXT_ONLY_INTENT_PATTERN =
  /(提示词|prompt|方案|文案|分析|拆解|描述|改写|润色|翻译|总结|只要|不要生成|不要画|先别生成|不需要生成)/i;

export function shouldConfirmPlainVisualBrief(value?: string | null): boolean {
  const text = value?.trim() || "";
  if (!text || EXPLICIT_COMMAND_PATTERN.test(text)) {
    return false;
  }
  if (TEXT_ONLY_INTENT_PATTERN.test(text)) {
    return false;
  }
  if (!VISUAL_OBJECT_PATTERN.test(text)) {
    return false;
  }

  const visualBriefScore = VISUAL_BRIEF_PATTERNS.reduce(
    (score, pattern) => score + (pattern.test(text) ? 1 : 0),
    0,
  );
  return visualBriefScore >= 1;
}

export function buildPlainVisualBriefConfirmationSystemPrompt(): string {
  return [
    "你是 Lime 的聊天入口意图确认器。",
    "用户这轮没有使用 @配图/@修图/@重绘/@image，但内容明显是图片、海报、封面或视觉生成 brief。",
    `本轮只能回复这一句：${PLAIN_VISUAL_BRIEF_CONFIRMATION}`,
    "不要输出 HTML/CSS/SVG/Markdown 草图，不要写设计方案，不要生成提示词全文，不要创建任务，不要调用任何图片工具。",
  ].join("\n");
}
