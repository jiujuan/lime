import {
  extractExplicitUrlFromText,
  hasBrowserAssistIntent,
} from "./browserAssistIntent";
import {
  parseContentPostPlatform,
  resolveContentPostPlatformLaunchUrl,
} from "./contentPostPlatform";
import type { BrowserTaskRequirement } from "../types";

export interface BrowserTaskRequirementMatch {
  requirement: BrowserTaskRequirement;
  reason: string;
  launchUrl: string;
  platformLabel?: string;
}

const REQUIRED_ACTION_PATTERN =
  /发布文章|发布内容|发文|发表|提交|上传|登录|登陆|扫码|验证码|授权|填写|点击|勾选|切换|保存|创建草稿|提交表单|群发|publish|post|ready-to-post|upload|submit|login|sign\s*in/i;
const PLATFORM_REQUIRED_ACTION_PATTERN = new RegExp(
  `发布|${REQUIRED_ACTION_PATTERN.source}`,
  "i",
);
const ADMIN_SURFACE_PATTERN =
  /后台|管理台|控制台|创作中心|创作者中心|管理后台|仪表盘|设置页|草稿箱|发布页|编辑器|表单/i;
const USER_STEP_PATTERN =
  /登录|登陆|扫码|验证码|短信验证|授权|人工接管|手动|确认登录|二次验证/i;
const PLATFORM_ACTION_PATTERN = new RegExp(
  `${PLATFORM_REQUIRED_ACTION_PATTERN.source}|${ADMIN_SURFACE_PATTERN.source}`,
  "i",
);

function normalizeInput(input: string): string {
  return input.trim();
}

export function detectBrowserTaskRequirement(
  input: string,
): BrowserTaskRequirementMatch | null {
  const normalized = normalizeInput(input);
  if (!normalized) {
    return null;
  }

  const explicitUrl = extractExplicitUrlFromText(normalized);
  const parsedPlatform = PLATFORM_ACTION_PATTERN.test(normalized)
    ? parseContentPostPlatform(normalized, { includeInline: true })
    : {};
  const platformLaunchUrl = resolveContentPostPlatformLaunchUrl(
    parsedPlatform.platformType,
  );
  const hasPlatform = Boolean(parsedPlatform.platformType && platformLaunchUrl);
  const hasRequiredAction = REQUIRED_ACTION_PATTERN.test(normalized);
  const hasAdminSurface = ADMIN_SURFACE_PATTERN.test(normalized);
  const hasUserStep = USER_STEP_PATTERN.test(normalized);

  if (explicitUrl && hasBrowserAssistIntent(normalized)) {
    return {
      requirement: "required",
      reason:
        "用户显式要求打开 URL 并使用 Browser Assist，必须先建立或复用真实浏览器会话，不能退化成联网检索。",
      launchUrl: explicitUrl,
    };
  }

  if (!hasPlatform && !hasRequiredAction && !hasAdminSurface) {
    return null;
  }

  if (!hasPlatform && !(hasRequiredAction && hasAdminSurface)) {
    return null;
  }

  const requirement: BrowserTaskRequirement =
    hasPlatform || hasUserStep ? "required_with_user_step" : "required";
  const reason =
    requirement === "required_with_user_step"
      ? hasPlatform
        ? `该任务需要在${parsedPlatform.platformLabel}完成发布、登录或提交流程，必须先建立真实浏览器会话，并通常需要你先完成登录、扫码或验证码。`
        : "该任务涉及受保护网页操作，必须先建立真实浏览器会话，并通常需要你先完成登录、扫码或验证码。"
      : "该任务涉及真实网页交互与后台/表单操作，必须使用浏览器执行，不能直接退化成联网检索。";

  return {
    requirement,
    reason,
    launchUrl: explicitUrl || platformLaunchUrl || "https://www.google.com",
    platformLabel: parsedPlatform.platformLabel,
  };
}
