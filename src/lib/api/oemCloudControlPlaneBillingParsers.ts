import type {
  OemCloudAccessToken,
  OemCloudActivationResponse,
  OemCloudActiveAccessTokenResponse,
  OemCloudBillingCycle,
  OemCloudBillingDashboard,
  OemCloudBillingSummary,
  OemCloudCreateAccessTokenResponse,
  OemCloudCreditAccount,
  OemCloudCreditTopupOrder,
  OemCloudCreditWallet,
  OemCloudCreditsDashboard,
  OemCloudEntitlementPlan,
  OemCloudMonthlyUsageSummary,
  OemCloudOrder,
  OemCloudPaymentAction,
  OemCloudPaymentCheckoutResponse,
  OemCloudPaymentConfig,
  OemCloudPaymentMethodConfig,
  OemCloudPlanBillingCycle,
  OemCloudPlanFeatureSection,
  OemCloudPlanQuotaSummary,
  OemCloudReadiness,
  OemCloudReadinessStatus,
  OemCloudReadinessStep,
  OemCloudRotateAccessTokenResponse,
  OemCloudSubscription,
  OemCloudTopupPackage,
  OemCloudUsageDashboard,
  OemCloudUsageRecord,
} from "./oemCloudControlPlaneTypes";
import {
  parseGatewayConfig,
  parseProviderModelItem,
  parseProviderOfferDetail,
  parseProviderOfferSummary,
  parseProviderPreference,
} from "./oemCloudControlPlaneCoreParsers";
import {
  OemCloudControlPlaneError,
  isRecord,
  normalizeBoolean,
  normalizeNumber,
  normalizeStringArray,
  normalizeStringMap,
  normalizeText,
} from "./oemCloudControlPlaneRuntime";

export function normalizeNumberOrZero(value: unknown): number {
  return normalizeNumber(value) ?? 0;
}

export function normalizeOptionalNumber(value: unknown): number | undefined {
  return normalizeNumber(value);
}

function parseBillingCycle(value: unknown): OemCloudBillingCycle | undefined {
  return normalizeText(value) as OemCloudBillingCycle | undefined;
}

function parsePlanBillingCycle(value: unknown): OemCloudPlanBillingCycle {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("套餐周期格式非法");
  }

  const key = parseBillingCycle(value.key);
  const label = normalizeText(value.label);
  if (!key || !label) {
    throw new OemCloudControlPlaneError("套餐周期格式非法");
  }

  return {
    key,
    label,
    priceCents: normalizeNumberOrZero(value.priceCents),
    credits: normalizeNumberOrZero(value.credits),
    autoRenew: normalizeBoolean(value.autoRenew),
    originalPriceCents: normalizeOptionalNumber(value.originalPriceCents),
    discountPercent: normalizeOptionalNumber(value.discountPercent),
  };
}

function parsePlanQuotaSummary(value: unknown): OemCloudPlanQuotaSummary {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("套餐额度摘要格式非法");
  }

  const key = normalizeText(value.key);
  const label = normalizeText(value.label);
  const summaryValue = normalizeText(value.value);
  if (!key || !label || !summaryValue) {
    throw new OemCloudControlPlaneError("套餐额度摘要格式非法");
  }

  return {
    key,
    label,
    value: summaryValue,
    hint: normalizeText(value.hint),
  };
}

function parsePlanFeatureSection(value: unknown): OemCloudPlanFeatureSection {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("套餐能力分组格式非法");
  }

  const key = normalizeText(value.key);
  const title = normalizeText(value.title);
  if (!key || !title) {
    throw new OemCloudControlPlaneError("套餐能力分组格式非法");
  }

  return {
    key,
    title,
    description: normalizeText(value.description),
    items: normalizeStringArray(value.items),
  };
}

export function parseEntitlementPlan(value: unknown): OemCloudEntitlementPlan {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("套餐格式非法");
  }

  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const key = normalizeText(value.key);
  const name = normalizeText(value.name);
  if (!id || !tenantId || !key || !name) {
    throw new OemCloudControlPlaneError("套餐格式非法");
  }

  return {
    id,
    tenantId,
    templateId: normalizeText(value.templateId),
    key,
    name,
    description: normalizeText(value.description),
    tagline: normalizeText(value.tagline),
    badge: normalizeText(value.badge),
    priceMonthly: normalizeNumberOrZero(value.priceMonthly),
    creditsMonthly: normalizeNumberOrZero(value.creditsMonthly),
    features: normalizeStringArray(value.features),
    status: normalizeText(value.status) ?? "inactive",
    recommended: normalizeBoolean(value.recommended),
    sortOrder: normalizeOptionalNumber(value.sortOrder),
    yearlyDiscountPercent: normalizeOptionalNumber(value.yearlyDiscountPercent),
    oneTimeDiscountPercent: normalizeOptionalNumber(
      value.oneTimeDiscountPercent,
    ),
    billingCycles: Array.isArray(value.billingCycles)
      ? value.billingCycles.map(parsePlanBillingCycle)
      : [],
    quotaSummaries: Array.isArray(value.quotaSummaries)
      ? value.quotaSummaries.map(parsePlanQuotaSummary)
      : [],
    featureSections: Array.isArray(value.featureSections)
      ? value.featureSections.map(parsePlanFeatureSection)
      : [],
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
  };
}

export function parseSubscription(value: unknown): OemCloudSubscription {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("订阅格式非法");
  }

  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const planId = normalizeText(value.planId);
  const planKey = normalizeText(value.planKey);
  if (!id || !tenantId || !planId || !planKey) {
    throw new OemCloudControlPlaneError("订阅格式非法");
  }

  return {
    id,
    tenantId,
    userId: normalizeText(value.userId),
    planId,
    planKey,
    planName: normalizeText(value.planName),
    status: normalizeText(value.status) ?? "unknown",
    billingCycle: parseBillingCycle(value.billingCycle),
    currentPeriodStart: normalizeText(value.currentPeriodStart) ?? "",
    currentPeriodEnd: normalizeText(value.currentPeriodEnd) ?? "",
    renewalAt: normalizeText(value.renewalAt),
    autoRenew: normalizeBoolean(value.autoRenew),
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
  };
}

function parseOptionalSubscription(
  value: unknown,
): OemCloudSubscription | null {
  if (!isRecord(value) || !normalizeText(value.id)) {
    return null;
  }

  const tenantId = normalizeText(value.tenantId);
  const planId = normalizeText(value.planId);
  const planKey = normalizeText(value.planKey);
  if (!tenantId || !planId || !planKey) {
    return null;
  }

  return parseSubscription(value);
}

export function parseCreditAccount(value: unknown): OemCloudCreditAccount {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("积分账户格式非法");
  }

  const tenantId = normalizeText(value.tenantId);
  if (!tenantId) {
    throw new OemCloudControlPlaneError("积分账户格式非法");
  }

  return {
    tenantId,
    userId: normalizeText(value.userId),
    balance: normalizeNumberOrZero(value.balance),
    reserved: normalizeNumberOrZero(value.reserved),
    currency: normalizeText(value.currency) ?? "credits",
    updatedAt: normalizeText(value.updatedAt) ?? "",
    lastTopUp: normalizeText(value.lastTopUp),
    lastSource: normalizeText(value.lastSource),
  };
}

export function parsePaymentConfig(value: unknown): OemCloudPaymentConfig {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("支付配置格式非法");
  }

  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const provider = normalizeText(value.provider);
  const displayName = normalizeText(value.displayName);
  if (!id || !tenantId || !provider || !displayName) {
    throw new OemCloudControlPlaneError("支付配置格式非法");
  }

  return {
    id,
    tenantId,
    provider,
    displayName,
    merchantIdMasked: normalizeText(value.merchantIdMasked),
    currency: normalizeText(value.currency),
    environment: normalizeText(value.environment),
    notifyUrl: normalizeText(value.notifyUrl) ?? "",
    returnUrl: normalizeText(value.returnUrl) ?? "",
    enabled: normalizeBoolean(value.enabled),
    methods: Array.isArray(value.methods)
      ? value.methods.map(parsePaymentMethodConfig)
      : [],
    providerOptions: normalizeStringMap(value.providerOptions),
    credentialMasks: normalizeStringMap(value.credentialMasks),
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
  };
}

function parsePaymentMethodConfig(value: unknown): OemCloudPaymentMethodConfig {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("支付方式格式非法");
  }
  const key = normalizeText(value.key);
  const displayName = normalizeText(value.displayName);
  if (!key || !displayName) {
    throw new OemCloudControlPlaneError("支付方式格式非法");
  }
  return {
    key,
    displayName,
    paymentType: normalizeText(value.paymentType),
    paymentName: normalizeText(value.paymentName),
    icon: normalizeText(value.icon),
    enabled: normalizeBoolean(value.enabled),
  };
}

export function parseTopupPackage(value: unknown): OemCloudTopupPackage {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("充值包格式非法");
  }

  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const key = normalizeText(value.key);
  const name = normalizeText(value.name);
  if (!id || !tenantId || !key || !name) {
    throw new OemCloudControlPlaneError("充值包格式非法");
  }

  return {
    id,
    tenantId,
    key,
    name,
    credits: normalizeNumberOrZero(value.credits),
    priceCents: normalizeNumberOrZero(value.priceCents),
    bonusCredits: normalizeOptionalNumber(value.bonusCredits),
    validDays: normalizeNumberOrZero(value.validDays),
    recommended: normalizeBoolean(value.recommended),
    sortOrder: normalizeOptionalNumber(value.sortOrder),
    status: normalizeText(value.status) ?? "inactive",
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
  };
}

function parseCreditWallet(value: unknown): OemCloudCreditWallet {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("积分钱包格式非法");
  }

  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const userId = normalizeText(value.userId);
  if (!id || !tenantId || !userId) {
    throw new OemCloudControlPlaneError("积分钱包格式非法");
  }

  return {
    id,
    tenantId,
    userId,
    packageId: normalizeText(value.packageId),
    packageName: normalizeText(value.packageName),
    sourceType: normalizeText(value.sourceType) ?? "unknown",
    sourceId: normalizeText(value.sourceId),
    grantedCredits: normalizeNumberOrZero(value.grantedCredits),
    usedCredits: normalizeNumberOrZero(value.usedCredits),
    remainingCredits: normalizeNumberOrZero(value.remainingCredits),
    status: normalizeText(value.status) ?? "unknown",
    effectiveAt: normalizeText(value.effectiveAt) ?? "",
    expiresAt: normalizeText(value.expiresAt),
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
  };
}

export function parseCreditTopupOrder(value: unknown): OemCloudCreditTopupOrder {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("充值订单格式非法");
  }

  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const userId = normalizeText(value.userId);
  const packageName = normalizeText(value.packageName);
  if (!id || !tenantId || !userId || !packageName) {
    throw new OemCloudControlPlaneError("充值订单格式非法");
  }

  return {
    id,
    tenantId,
    userId,
    packageId: normalizeText(value.packageId),
    packageName,
    creditsGranted: normalizeNumberOrZero(value.creditsGranted),
    amountCents: normalizeNumberOrZero(value.amountCents),
    paymentChannel: normalizeText(value.paymentChannel) ?? "",
    paymentMethod: normalizeText(value.paymentMethod),
    paymentReference: normalizeText(value.paymentReference),
    checkoutUrl: normalizeText(value.checkoutUrl),
    providerOrderId: normalizeText(value.providerOrderId),
    providerSessionId: normalizeText(value.providerSessionId),
    providerStatus: normalizeText(value.providerStatus),
    status: normalizeText(value.status) ?? "unknown",
    paidAt: normalizeText(value.paidAt),
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
  };
}

function parseMonthlyUsageSummary(value: unknown): OemCloudMonthlyUsageSummary {
  const record = isRecord(value) ? value : {};
  return {
    freeCreditsUsed: normalizeNumberOrZero(record.freeCreditsUsed),
    freeCreditsLimit: normalizeNumberOrZero(record.freeCreditsLimit),
    topupCreditsUsed: normalizeNumberOrZero(record.topupCreditsUsed),
    topupCreditsLimit: normalizeNumberOrZero(record.topupCreditsLimit),
    subscriptionCreditsUsed: normalizeNumberOrZero(
      record.subscriptionCreditsUsed,
    ),
    subscriptionCreditsLimit: normalizeNumberOrZero(
      record.subscriptionCreditsLimit,
    ),
  };
}

function parseUsageRecord(value: unknown): OemCloudUsageRecord {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("用量记录格式非法");
  }

  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const userId = normalizeText(value.userId);
  if (!id || !tenantId || !userId) {
    throw new OemCloudControlPlaneError("用量记录格式非法");
  }

  return {
    id,
    tenantId,
    userId,
    createdAt: normalizeText(value.createdAt) ?? "",
    usageType: normalizeText(value.usageType) ?? "llm",
    triggerType: normalizeText(value.triggerType) ?? "request",
    usageTag: normalizeText(value.usageTag),
    model: normalizeText(value.model) ?? "",
    tokens: normalizeNumberOrZero(value.tokens),
    credits: normalizeNumberOrZero(value.credits),
    durationMs: normalizeNumberOrZero(value.durationMs),
    status: normalizeText(value.status) ?? "unknown",
  };
}

function parseBillingSummary(value: unknown): OemCloudBillingSummary {
  const record = isRecord(value) ? value : {};
  return {
    currency: normalizeText(record.currency) ?? "CNY",
    nextPaymentAmountCents: normalizeNumberOrZero(
      record.nextPaymentAmountCents,
    ),
    currentPeriodStart: normalizeText(record.currentPeriodStart),
    currentPeriodEnd: normalizeText(record.currentPeriodEnd),
    renewalAt: normalizeText(record.renewalAt),
    autoRenew: normalizeBoolean(record.autoRenew),
    lastPaidAt: normalizeText(record.lastPaidAt),
    totalSpentCents: normalizeNumberOrZero(record.totalSpentCents),
  };
}

export function parseOrder(value: unknown): OemCloudOrder {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("套餐订单格式非法");
  }

  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const userId = normalizeText(value.userId);
  const planId = normalizeText(value.planId);
  const planKey = normalizeText(value.planKey);
  const planName = normalizeText(value.planName);
  if (!id || !tenantId || !userId || !planId || !planKey || !planName) {
    throw new OemCloudControlPlaneError("套餐订单格式非法");
  }

  return {
    id,
    tenantId,
    userId,
    planId,
    planKey,
    planName,
    amountCents: normalizeNumberOrZero(value.amountCents),
    creditsGranted: normalizeNumberOrZero(value.creditsGranted),
    paymentChannel: normalizeText(value.paymentChannel) ?? "",
    paymentMethod: normalizeText(value.paymentMethod),
    billingCycle: parseBillingCycle(value.billingCycle),
    paymentReference: normalizeText(value.paymentReference),
    checkoutUrl: normalizeText(value.checkoutUrl),
    providerOrderId: normalizeText(value.providerOrderId),
    providerSessionId: normalizeText(value.providerSessionId),
    providerStatus: normalizeText(value.providerStatus),
    status: normalizeText(value.status) ?? "unknown",
    paidAt: normalizeText(value.paidAt),
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
  };
}

export function parseCreditsDashboard(value: unknown): OemCloudCreditsDashboard {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("积分看板格式非法");
  }

  return {
    creditAccount: parseCreditAccount(value.creditAccount),
    subscription: parseOptionalSubscription(value.subscription),
    topupPackages: Array.isArray(value.topupPackages)
      ? value.topupPackages.map(parseTopupPackage)
      : [],
    creditWallets: Array.isArray(value.creditWallets)
      ? value.creditWallets.map(parseCreditWallet)
      : [],
    creditOrders: Array.isArray(value.creditOrders)
      ? value.creditOrders.map(parseCreditTopupOrder)
      : [],
  };
}

export function parseUsageDashboard(value: unknown): OemCloudUsageDashboard {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("用量看板格式非法");
  }

  return {
    usageRecords: Array.isArray(value.usageRecords)
      ? value.usageRecords.map(parseUsageRecord)
      : [],
    monthlySummary: parseMonthlyUsageSummary(value.monthlySummary),
  };
}

export function parseBillingDashboard(value: unknown): OemCloudBillingDashboard {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("账单看板格式非法");
  }

  return {
    billingSummary: parseBillingSummary(value.billingSummary),
    subscription: parseOptionalSubscription(value.subscription),
    currentPlan: parseOptionalPlan(value.currentPlan),
    orders: Array.isArray(value.orders) ? value.orders.map(parseOrder) : [],
  };
}

export function parseAccessToken(value: unknown): OemCloudAccessToken {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("API Key 格式非法");
  }

  const id = normalizeText(value.id);
  const tenantId = normalizeText(value.tenantId);
  const userId = normalizeText(value.userId);
  const name = normalizeText(value.name);
  const tokenMasked = normalizeText(value.tokenMasked);
  if (!id || !tenantId || !userId || !name || !tokenMasked) {
    throw new OemCloudControlPlaneError("API Key 格式非法");
  }

  return {
    id,
    tenantId,
    userId,
    name,
    tokenMasked,
    tokenPrefix: normalizeText(value.tokenPrefix),
    scopes: normalizeStringArray(value.scopes),
    allowedModels: normalizeStringArray(value.allowedModels),
    maxTokensPerRequest: normalizeOptionalNumber(value.maxTokensPerRequest),
    requestsPerMinute: normalizeOptionalNumber(value.requestsPerMinute),
    tokensPerMinute: normalizeOptionalNumber(value.tokensPerMinute),
    monthlyCreditLimit: normalizeOptionalNumber(value.monthlyCreditLimit),
    status: normalizeText(value.status) ?? "unknown",
    lastUsedAt: normalizeText(value.lastUsedAt),
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
    expiresAt: normalizeText(value.expiresAt) ?? "",
  };
}

export function parseActiveAccessTokenResponse(
  value: unknown,
): OemCloudActiveAccessTokenResponse {
  const record = isRecord(value) ? value : {};
  return {
    hasActive: normalizeBoolean(record.hasActive),
    token: isRecord(record.token) ? parseAccessToken(record.token) : null,
  };
}

export function parseCreateAccessTokenResponse(
  value: unknown,
): OemCloudCreateAccessTokenResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("创建 API Key 结果格式非法");
  }

  return {
    token: parseAccessToken(value.token),
    rawToken: normalizeText(value.rawToken),
    apiKey: normalizeText(value.apiKey),
  };
}

export function parseRotateAccessTokenResponse(
  value: unknown,
): OemCloudRotateAccessTokenResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("轮换 API Key 结果格式非法");
  }

  return {
    previousToken: parseAccessToken(value.previousToken),
    newToken: parseAccessToken(value.newToken),
    rawToken: normalizeText(value.rawToken),
    apiKey: normalizeText(value.apiKey),
  };
}

export function parsePaymentCheckoutResponse(
  value: unknown,
): OemCloudPaymentCheckoutResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("支付链接格式非法");
  }
  const orderKind = normalizeText(value.orderKind);
  const orderId = normalizeText(value.orderId);
  const paymentChannel = normalizeText(value.paymentChannel);
  if (!orderKind || !orderId || !paymentChannel) {
    throw new OemCloudControlPlaneError("支付链接格式非法");
  }
  return {
    orderKind,
    orderId,
    paymentChannel,
    paymentMethod: normalizeText(value.paymentMethod),
    paymentReference: normalizeText(value.paymentReference),
    checkoutUrl: normalizeText(value.checkoutUrl),
    status: normalizeText(value.status) ?? "pending",
  };
}

function parseReadinessStatus(value: unknown): OemCloudReadinessStatus {
  const status = normalizeText(value);
  switch (status) {
    case "no_payment_channel":
    case "no_plan_or_credits":
    case "payment_pending":
    case "no_api_key":
    case "no_models":
    case "ready":
    case "quota_low":
    case "subscription_expired":
    case "blocked":
      return status;
    default:
      return "blocked";
  }
}

function parseReadinessStep(value: unknown): OemCloudReadinessStep {
  const record = isRecord(value) ? value : {};
  return {
    key: normalizeText(record.key) ?? "unknown",
    label: normalizeText(record.label) ?? "未命名步骤",
    description: normalizeText(record.description),
    done: normalizeBoolean(record.done),
    action: normalizeText(record.action),
  };
}

function parseReadiness(value: unknown): OemCloudReadiness {
  const record = isRecord(value) ? value : {};
  return {
    status: parseReadinessStatus(record.status),
    title: normalizeText(record.title) ?? "云端状态未知",
    description: normalizeText(record.description),
    nextAction: normalizeText(record.nextAction),
    canInvoke: normalizeBoolean(record.canInvoke),
    blockers: normalizeStringArray(record.blockers),
    steps: Array.isArray(record.steps)
      ? record.steps.map(parseReadinessStep)
      : [],
  };
}

function parsePaymentAction(value: unknown): OemCloudPaymentAction | null {
  if (!isRecord(value)) {
    return null;
  }

  const orderId = normalizeText(value.orderId);
  const kind = normalizeText(value.kind);
  if (!orderId || !kind) {
    return null;
  }

  return {
    kind,
    orderId,
    title: normalizeText(value.title) ?? orderId,
    paymentChannel: normalizeText(value.paymentChannel) ?? "",
    paymentReference: normalizeText(value.paymentReference),
    amountCents: normalizeNumberOrZero(value.amountCents),
    status: normalizeText(value.status) ?? "unknown",
    createdAt: normalizeText(value.createdAt) ?? "",
    updatedAt: normalizeText(value.updatedAt) ?? "",
  };
}

function parseOptionalPlan(value: unknown): OemCloudEntitlementPlan | null {
  if (!isRecord(value) || !normalizeText(value.id)) {
    return null;
  }
  return parseEntitlementPlan(value);
}

export function parseCloudActivation(value: unknown): OemCloudActivationResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("云端激活状态格式非法");
  }

  const creditsDashboard = isRecord(value.creditsDashboard)
    ? parseCreditsDashboard(value.creditsDashboard)
    : null;
  const usageDashboard = isRecord(value.usageDashboard)
    ? parseUsageDashboard(value.usageDashboard)
    : null;
  const billingDashboard = isRecord(value.billingDashboard)
    ? parseBillingDashboard(value.billingDashboard)
    : null;

  return {
    gateway: parseGatewayConfig(value.gateway),
    llmBaseUrl: normalizeText(value.llmBaseUrl) ?? "",
    openAIBaseUrl: normalizeText(value.openAIBaseUrl) ?? "",
    anthropicBaseUrl: normalizeText(value.anthropicBaseUrl) ?? "",
    readiness: parseReadiness(value.readiness),
    pendingPayment: parsePaymentAction(value.pendingPayment),
    paymentConfigs: Array.isArray(value.paymentConfigs)
      ? value.paymentConfigs.map(parsePaymentConfig)
      : [],
    plans: Array.isArray(value.plans)
      ? value.plans.map(parseEntitlementPlan)
      : [],
    subscription: parseOptionalSubscription(value.subscription),
    creditAccount: isRecord(value.creditAccount)
      ? parseCreditAccount(value.creditAccount)
      : null,
    creditsDashboard,
    topupPackages: Array.isArray(value.topupPackages)
      ? value.topupPackages.map(parseTopupPackage)
      : (creditsDashboard?.topupPackages ?? []),
    usageDashboard,
    billingDashboard,
    providerOffers: Array.isArray(value.providerOffers)
      ? value.providerOffers.map(parseProviderOfferSummary)
      : [],
    selectedOffer: isRecord(value.selectedOffer)
      ? parseProviderOfferDetail(value.selectedOffer)
      : null,
    providerModels: Array.isArray(value.providerModels)
      ? value.providerModels.map(parseProviderModelItem)
      : [],
    providerPreference: isRecord(value.providerPreference)
      ? parseProviderPreference(value.providerPreference)
      : null,
    accessTokens: Array.isArray(value.accessTokens)
      ? value.accessTokens.map(parseAccessToken)
      : [],
    activeAccessToken: isRecord(value.activeAccessToken)
      ? parseActiveAccessTokenResponse(value.activeAccessToken)
      : null,
    orders: Array.isArray(value.orders) ? value.orders.map(parseOrder) : [],
    creditTopupOrders: Array.isArray(value.creditTopupOrders)
      ? value.creditTopupOrders.map(parseCreditTopupOrder)
      : [],
  };
}
