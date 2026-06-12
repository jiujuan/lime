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

export function isPlainInputIntentAffirmativeReply(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[。.!！?？,，\s]/g, "");
  if (!normalized || normalized.length > 32) {
    return false;
  }

  return /^(y|yes|ok|okay|sure|goahead|generate|create|createit|start|生成|直接生成|开始|开始生成|确认|确定|可以|好|好的|行)$/.test(
    normalized,
  );
}
