import type {
  OemCloudReferralClaimResponse,
  OemCloudReferralCode,
  OemCloudReferralDashboard,
  OemCloudReferralInviteRelation,
  OemCloudReferralPolicy,
  OemCloudReferralShare,
  OemCloudReferralSummary,
} from "./oemCloudControlPlaneTypes";
import { parseCreditAccount } from "./oemCloudControlPlaneBillingParsers";
import {
  normalizeNumberOrZero,
  normalizeOptionalNumber,
} from "./oemCloudControlPlaneBillingParsers";
import {
  COMPAT_REFERRAL_BRAND_NAME,
  COMPAT_REFERRAL_DOWNLOAD_URL,
  OemCloudControlPlaneError,
  isRecord,
  normalizeBoolean,
  normalizeText,
} from "./oemCloudControlPlaneRuntime";

function parseReferralCode(value: unknown): OemCloudReferralCode {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("邀请代码格式非法");
  }

  const code = normalizeText(value.code);
  if (!code) {
    throw new OemCloudControlPlaneError("邀请代码格式非法");
  }

  return {
    id: normalizeText(value.id) ?? "",
    tenantId: normalizeText(value.tenantId) ?? "",
    userId: normalizeText(value.userId) ?? "",
    code,
    landingUrl: normalizeText(value.landingUrl) ?? "",
    channel: normalizeText(value.channel),
    status: normalizeText(value.status) ?? "active",
    disabledReason: normalizeText(value.disabledReason),
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
  };
}

function parseReferralPolicy(value: unknown): OemCloudReferralPolicy {
  const record = isRecord(value) ? value : {};
  return {
    tenantId: normalizeText(record.tenantId),
    enabled: normalizeBoolean(record.enabled, true),
    rewardCredits: normalizeNumberOrZero(record.rewardCredits),
    referrerRewardCredits: normalizeNumberOrZero(record.referrerRewardCredits),
    inviteeRewardCredits: normalizeNumberOrZero(record.inviteeRewardCredits),
    claimWindowDays: normalizeNumberOrZero(record.claimWindowDays),
    autoClaimEnabled: normalizeBoolean(record.autoClaimEnabled),
    allowManualClaimFallback: normalizeBoolean(
      record.allowManualClaimFallback,
      true,
    ),
    landingPageHeadline: normalizeText(record.landingPageHeadline),
    landingPageRules: normalizeText(record.landingPageRules),
    riskReviewEnabled: normalizeBoolean(record.riskReviewEnabled),
    updatedAt: normalizeText(record.updatedAt),
  };
}

function parseReferralSummary(value: unknown): OemCloudReferralSummary {
  const record = isRecord(value) ? value : {};
  return {
    totalInvites: normalizeNumberOrZero(record.totalInvites),
    successfulInvites: normalizeNumberOrZero(record.successfulInvites),
    totalRewardCredits: normalizeNumberOrZero(record.totalRewardCredits),
    referrerRewardCreditsTotal: normalizeNumberOrZero(
      record.referrerRewardCreditsTotal,
    ),
    inviteeRewardCreditsTotal: normalizeNumberOrZero(
      record.inviteeRewardCreditsTotal,
    ),
  };
}

function parseReferralInviteRelation(
  value: unknown,
): OemCloudReferralInviteRelation {
  const record = isRecord(value) ? value : {};
  return {
    eventId: normalizeText(record.eventId),
    code: normalizeText(record.code),
    referrerUserId: normalizeText(record.referrerUserId),
    referrerEmail: normalizeText(record.referrerEmail),
    referrerName: normalizeText(record.referrerName),
    inviteeRewardCredits: normalizeOptionalNumber(record.inviteeRewardCredits),
    claimedAt: normalizeText(record.claimedAt),
  };
}

function resolveReferralDownloadUrl(landingUrl: string): string {
  try {
    return new URL(landingUrl).origin;
  } catch {
    return COMPAT_REFERRAL_DOWNLOAD_URL;
  }
}

function buildCompatReferralShareText(params: {
  brandName: string;
  downloadUrl: string;
  code: string;
}): string {
  return `邀请你体验${params.brandName}，让AI做牛做马，我们来做牛人！前往 ${params.downloadUrl} 下载客户端，复制邀请码 ${params.code} 激活并注册账号参与内测`;
}

function parseReferralShare(
  value: unknown,
  code: OemCloudReferralCode,
  policy: OemCloudReferralPolicy,
): OemCloudReferralShare {
  const record = isRecord(value) ? value : {};
  const shareCode = normalizeText(record.code) ?? code.code;
  let landingUrl = normalizeText(record.landingUrl) ?? code.landingUrl;
  const brandName =
    normalizeText(record.brandName) ?? COMPAT_REFERRAL_BRAND_NAME;
  const downloadUrl =
    normalizeText(record.downloadUrl) ?? resolveReferralDownloadUrl(landingUrl);
  if (!landingUrl) {
    landingUrl = `${downloadUrl}/invite?code=${encodeURIComponent(shareCode)}`;
  }

  return {
    brandName,
    code: shareCode,
    landingUrl,
    downloadUrl,
    shareText:
      normalizeText(record.shareText) ??
      buildCompatReferralShareText({
        brandName,
        downloadUrl,
        code: shareCode,
      }),
    headline:
      normalizeText(record.headline) ??
      normalizeText(policy.landingPageHeadline),
    rules:
      normalizeText(record.rules) ?? normalizeText(policy.landingPageRules),
  };
}

export function parseReferralDashboard(value: unknown): OemCloudReferralDashboard {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("邀请看板格式非法");
  }

  const code = parseReferralCode(value.code);
  const policy = parseReferralPolicy(value.policy);

  return {
    code,
    policy,
    summary: parseReferralSummary(value.summary),
    events: Array.isArray(value.events) ? value.events : [],
    rewards: Array.isArray(value.rewards) ? value.rewards : [],
    invitedBy: parseReferralInviteRelation(value.invitedBy),
    share: parseReferralShare(value.share, code, policy),
  };
}

export function parseReferralClaimResponse(
  value: unknown,
): OemCloudReferralClaimResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("邀请领取结果格式非法");
  }

  return {
    event: value.event,
    reward: value.reward,
    rewards: Array.isArray(value.rewards) ? value.rewards : [],
    creditAccount: isRecord(value.creditAccount)
      ? parseCreditAccount(value.creditAccount)
      : null,
    accountLedgers: Array.isArray(value.accountLedgers)
      ? value.accountLedgers
      : [],
  };
}
