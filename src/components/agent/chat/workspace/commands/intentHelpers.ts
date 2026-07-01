/**
 * 意图识别辅助函数（从 useWorkspaceSendActions.ts 提取）
 *
 * 纯函数，无 React 依赖。用于判断用户输入意图。
 *
 * @module intentHelpers
 */

export function isImageGenerationPlainInputIntent(
  intent: Pick<{ commandKey: string; intentId: string }, "commandKey" | "intentId">,
): boolean {
  const commandKey = intent.commandKey.trim().toLowerCase();
  const intentId = intent.intentId.trim().toLowerCase();
  return commandKey.includes("image") || intentId.includes("image");
}

export function isLikelyPlainImageGenerationRequest(value: string): boolean {
  const text = value.trim();
  if (!text || text.startsWith("@") || text.startsWith("/")) {
    return false;
  }

  if (
    /(不要|别|先别|不用|无需|不需要|no)\s*(?:.{0,8})?(画|生成|出|做|设计|绘制|image|draw)/i.test(
      text,
    )
  ) {
    return false;
  }

  if (/(提示词|prompt|方案|文案|分析|拆解|描述|改写|润色|翻译|总结)/i.test(text)) {
    return false;
  }

  return /(?:画|生成|出|做|设计|绘制)\s*(?:一|1|两|二|几|多)?\s*(?:张|个|幅)?[^，。！？\n]{0,40}(?:图|图片|图像|插画|照片|海报|主视觉|画面)/i.test(
    text,
  );
}
