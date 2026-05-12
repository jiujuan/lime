const IMAGE_WORKBENCH_STATUS_STRIP_PATTERN =
  /[`*_>#\-\s，。！？、；：,.!?;:（）()【】[\]{}"“”'‘’]/g;

export function normalizeImageWorkbenchStatusText(
  value?: string | null,
): string {
  return (value || "")
    .replace(IMAGE_WORKBENCH_STATUS_STRIP_PATTERN, "")
    .toLowerCase();
}

const normalizePhrases = (phrases: string[]) =>
  phrases.map((phrase) => normalizeImageWorkbenchStatusText(phrase));

const IMAGE_WORKBENCH_SUBMISSION_CUES = normalizePhrases([
  "任务已创建成功",
  "任务已创建",
  "任务已提交",
  "任务已成功提交",
  "生成任务已创建",
  "生成任务已提交",
  "生成任务已进入队列",
  "图片生成任务已成功提交",
  "生成详情",
  "任务详情",
]);

const IMAGE_WORKBENCH_DETAIL_KEYWORDS = normalizePhrases([
  "画面构图",
  "风格",
  "尺寸",
  "色调",
  "模型",
  "状态",
  "提示词",
  "Prompt",
  "Provider",
  "参数",
  "任务 ID",
  "任务ID",
  "Task ID",
  "任务摘要",
  "下一步流程",
  "当前状态",
  "生成完成后",
  "稍等一下",
  "已进入队列",
  "正在生成中",
  "等待 AI 模型处理",
  "系统会自动轮询",
  "图片工作台",
  "Image Workbench",
  "生成进度",
  "最终结果",
  "队列",
]);

function includesAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((phrase) => normalized.includes(phrase));
}

function countDetailHits(normalized: string): number {
  return IMAGE_WORKBENCH_DETAIL_KEYWORDS.filter((keyword) =>
    normalized.includes(keyword),
  ).length;
}

export function isVerboseImageWorkbenchSubmissionText(
  value?: string | null,
): boolean {
  const normalized = normalizeImageWorkbenchStatusText(value);
  if (!normalized) {
    return false;
  }

  if (!includesAny(normalized, IMAGE_WORKBENCH_SUBMISSION_CUES)) {
    return false;
  }

  const detailHitCount = countDetailHits(normalized);
  const hasTableShape =
    normalized.includes("项目") && normalized.includes("内容");
  const hasTaskIdentity =
    normalized.includes("任务id") || normalized.includes("taskid");

  return (
    detailHitCount >= 3 ||
    (hasTableShape && detailHitCount >= 2) ||
    (hasTaskIdentity && detailHitCount >= 2)
  );
}

export function shouldSuppressImageWorkbenchStatusText(
  value?: string | null,
): boolean {
  const normalized = normalizeImageWorkbenchStatusText(value);
  if (!normalized) {
    return false;
  }

  if (isVerboseImageWorkbenchSubmissionText(value)) {
    return true;
  }

  return [
    /^(?:图片(?:编辑|重绘)?|修图|重绘|配图)任务(?:已创建|已进入队列|正在生成中|处理中|已完成|已取消|失败).*/,
    /^(?:图片生成|图片编辑|图片重绘|图片|修图|重绘|配图|3x3分镜|分镜)任务已(?:成功)?提交.*/,
    /^(?:图片生成|图片编辑|图片重绘|图片|修图|重绘|配图|3x3分镜|分镜)任务.*(?:正在同步任务状态|正在排队处理|等待进入队列|等待ai模型处理).*/,
    /^(?:图片生成|图片结果|图片|3x3分镜)(?:已完成|已生成完成|正在生成中|已进入队列|已创建|已返回部分结果).*/,
    /^(?:图片|3x3分镜).*(?:生成完成|返回部分结果|生成失败|执行失败|已取消).*/,
    /^正在(?:生成|处理|重绘|编辑)图片$/,
    /^(?:图片|3x3分镜).*(?:可在右侧|右侧查看|打开查看|工作区会继续同步).*/,
    /^已(?:成功)?提交.*(?:图片|分镜|生成)?任务.*$/,
    /^任务已(?:提交|创建|进入队列).*/,
    /^.*(?:图片|插画|海报|封面|分镜).*生成任务已(?:创建|提交|进入队列).*$/,
    /^.*(?:图片生成任务|生成任务)已(?:成功)?(?:创建|提交|进入队列).*$/,
    /^我先按你的描述.*(?:创建异步|图片任务|修图任务|重绘要求).*$/,
    /^我已(?:经)?按.*(?:完成一轮配图|把结果同步回对话).*/,
  ].some((pattern) => pattern.test(normalized));
}

export function isImageWorkbenchStatusOnlyText(value?: string | null): boolean {
  const normalized = normalizeImageWorkbenchStatusText(value);
  if (!normalized) {
    return true;
  }

  if (
    normalized.includes("正在同步任务状态") ||
    normalized.includes("正在排队处理中") ||
    normalized.includes("状态排队中pending_submit")
  ) {
    return true;
  }

  return [
    /^图片任务已创建正在准备执行$/,
    /^图片任务已进入队列正在等待执行$/,
    /^图片任务正在生成中$/,
    /^图片任务已取消.*$/,
    /^图片任务失败.*$/,
    /^图片编辑任务已创建正在准备执行$/,
    /^图片编辑任务已进入队列正在等待执行$/,
    /^图片编辑任务正在生成中$/,
    /^图片编辑任务已取消.*$/,
    /^图片编辑任务失败.*$/,
    /^图片重绘任务已创建正在准备执行$/,
    /^图片重绘任务已进入队列正在等待执行$/,
    /^图片重绘任务正在生成中$/,
    /^图片重绘任务已取消.*$/,
    /^图片重绘任务失败.*$/,
  ].some((pattern) => pattern.test(normalized));
}

export function isImageWorkbenchSubmissionTemplateText(
  value?: string | null,
): boolean {
  const normalized = normalizeImageWorkbenchStatusText(value);
  if (!normalized) {
    return false;
  }

  if (isVerboseImageWorkbenchSubmissionText(value)) {
    return true;
  }

  if (shouldSuppressImageWorkbenchStatusText(value)) {
    return true;
  }

  const detailHitCount = countDetailHits(normalized);
  const hasTemplateHeader =
    normalized.includes("任务详情") ||
    normalized.includes("任务摘要") ||
    normalized.includes("生成详情");
  const hasTaskIdentity =
    normalized.includes("任务id") || normalized.includes("taskid");

  return (
    (hasTemplateHeader && detailHitCount >= 3) ||
    (hasTaskIdentity && detailHitCount >= 3) ||
    (normalized.includes("图片工作台") &&
      hasTaskIdentity &&
      detailHitCount >= 2)
  );
}
