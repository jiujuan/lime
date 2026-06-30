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
