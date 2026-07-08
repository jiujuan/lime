import { parseCloudBootstrapPayload } from "../../features/plugin/install/cloudBootstrap";
import type {
  ClientPluginInstallStateReport,
  PluginMarketplaceItem,
  PluginMarketplaceListResponse,
  PluginMarketplacePackageRef,
  PluginMarketplacePolicy,
} from "./pluginMarketplaceTypes";
import type { OemCloudBootstrapResponse } from "./oemCloudControlPlaneTypes";
import {
  parseAuthPolicy,
  parseCurrentSession,
  parseFeatureFlags,
  parseGatewayConfig,
  parseProviderOfferSummary,
  parseProviderPreference,
} from "./oemCloudControlPlaneCoreParsers";
import { parseReferralDashboard } from "./oemCloudControlPlaneReferralParsers";
import {
  OemCloudControlPlaneError,
  isRecord,
  normalizeBoolean,
  normalizeStringArray,
  normalizeText,
  parseClientPluginInstallState,
  parsePluginMarketplaceActivationState,
  parsePluginMarketplaceAuthenticationPolicy,
  parsePluginMarketplaceInstallState,
  parsePluginMarketplaceInstallationPolicy,
  parsePluginMarketplaceSourceKind,
} from "./oemCloudControlPlaneRuntime";

export function parseBootstrap(value: unknown): OemCloudBootstrapResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("bootstrap 格式非法");
  }

  return {
    session: parseCurrentSession(value.session),
    app: {
      id:
        normalizeText(value.app && isRecord(value.app) ? value.app.id : "") ??
        "",
      key:
        normalizeText(value.app && isRecord(value.app) ? value.app.key : "") ??
        "",
      name:
        normalizeText(value.app && isRecord(value.app) ? value.app.name : "") ??
        "",
      slug:
        normalizeText(value.app && isRecord(value.app) ? value.app.slug : "") ??
        "",
      category:
        normalizeText(
          value.app && isRecord(value.app) ? value.app.category : "",
        ) ?? "",
      description:
        normalizeText(
          value.app && isRecord(value.app) ? value.app.description : "",
        ) ?? undefined,
      status:
        normalizeText(
          value.app && isRecord(value.app) ? value.app.status : "",
        ) ?? "",
      distributionChannels: normalizeStringArray(
        value.app && isRecord(value.app) ? value.app.distributionChannels : [],
      ),
    },
    authPolicy: parseAuthPolicy(value.authPolicy),
    providerOffersSummary: Array.isArray(value.providerOffersSummary)
      ? value.providerOffersSummary.map(parseProviderOfferSummary)
      : [],
    providerPreference: parseProviderPreference(value.providerPreference),
    skillCatalog: value.skillCatalog,
    serviceSkillCatalog: value.serviceSkillCatalog,
    siteAdapterCatalog: value.siteAdapterCatalog ?? value.site_adapter_catalog,
    pluginCatalog:
      value.pluginCatalog == null
        ? undefined
        : parseCloudBootstrapPayload(value.pluginCatalog),
    sceneCatalog: Array.isArray(value.sceneCatalog)
      ? value.sceneCatalog
          .filter((item) => isRecord(item) && normalizeText(item.id))
          .map((item) => ({
            id: normalizeText((item as Record<string, unknown>).id) ?? "",
          }))
      : [],
    features: parseFeatureFlags(value.features),
    gateway: isRecord(value.gateway)
      ? parseGatewayConfig(value.gateway)
      : undefined,
    referral: isRecord(value.referral)
      ? parseReferralDashboard(value.referral)
      : null,
  };
}

function parsePluginMarketplacePackageRef(
  value: unknown,
): PluginMarketplacePackageRef | undefined {
  if (value == null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("插件包引用格式非法");
  }
  return {
    releaseId: normalizeText(value.releaseId),
    packageUrl: normalizeText(value.packageUrl),
    packageHash: normalizeText(value.packageHash),
    manifestHash: normalizeText(value.manifestHash),
    signatureRef: normalizeText(value.signatureRef),
  };
}

function parsePluginMarketplacePolicy(value: unknown): PluginMarketplacePolicy {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("插件策略格式非法");
  }
  return {
    installation: parsePluginMarketplaceInstallationPolicy(value.installation),
    authentication: parsePluginMarketplaceAuthenticationPolicy(
      value.authentication,
    ),
    products: normalizeStringArray(value.products),
  };
}

function parsePluginMarketplaceItem(value: unknown): PluginMarketplaceItem {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("插件市场条目格式非法");
  }

  const pluginKey = normalizeText(value.pluginKey);
  const pluginName = normalizeText(value.pluginName);
  const marketplaceName = normalizeText(value.marketplaceName);
  const displayName = normalizeText(value.displayName);
  if (!pluginKey || !pluginName || !marketplaceName || !displayName) {
    throw new OemCloudControlPlaneError("插件市场条目格式非法");
  }

  return {
    pluginKey,
    pluginName,
    marketplaceName,
    marketplaceDisplayName: normalizeText(value.marketplaceDisplayName),
    displayName,
    description: normalizeText(value.description),
    version: normalizeText(value.version),
    category: normalizeText(value.category),
    categories: normalizeStringArray(value.categories),
    keywords: normalizeStringArray(value.keywords),
    capabilities: normalizeStringArray(value.capabilities),
    sourceKind: parsePluginMarketplaceSourceKind(value.sourceKind),
    sourceRef: normalizeText(value.sourceRef),
    appId: normalizeText(value.appId),
    install: isRecord(value.install)
      ? {
          local: normalizeBoolean(value.install.local),
          cloud: normalizeBoolean(value.install.cloud),
          authentication: normalizeText(value.install.authentication),
        }
      : undefined,
    enabled: normalizeBoolean(value.enabled),
    installState: parsePluginMarketplaceInstallState(value.installState),
    activationState: parsePluginMarketplaceActivationState(
      value.activationState,
    ),
    blockedReason: normalizeText(value.blockedReason),
    policy: parsePluginMarketplacePolicy(value.policy),
    package: parsePluginMarketplacePackageRef(value.package),
    manifestSummary: isRecord(value.manifestSummary)
      ? value.manifestSummary
      : undefined,
    updatedAt: normalizeText(value.updatedAt),
  };
}

export function parsePluginMarketplaceListResponse(
  value: unknown,
): PluginMarketplaceListResponse {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("插件市场目录格式非法");
  }

  const schemaVersion = normalizeText(value.schemaVersion);
  const tenantId = normalizeText(value.tenantId);
  const marketplaceName = normalizeText(value.marketplaceName);
  if (
    schemaVersion !== "plugin-marketplace/v1" ||
    !tenantId ||
    !marketplaceName
  ) {
    throw new OemCloudControlPlaneError("插件市场目录格式非法");
  }

  return {
    schemaVersion,
    tenantId,
    generatedAt: normalizeText(value.generatedAt) ?? "",
    marketplaceName,
    marketplaceDisplayName: normalizeText(value.marketplaceDisplayName),
    items: Array.isArray(value.items)
      ? value.items.map(parsePluginMarketplaceItem)
      : [],
  };
}

export function parseClientPluginInstallStateReport(
  value: unknown,
): ClientPluginInstallStateReport {
  if (!isRecord(value)) {
    throw new OemCloudControlPlaneError("客户端插件安装态格式非法");
  }

  const tenantId = normalizeText(value.tenantId);
  const userId = normalizeText(value.userId);
  const pluginName = normalizeText(value.pluginName);
  const marketplaceName = normalizeText(value.marketplaceName);
  const pluginKey = normalizeText(value.pluginKey);
  const reportedAt = normalizeText(value.reportedAt);
  const updatedAt = normalizeText(value.updatedAt);
  if (
    !tenantId ||
    !userId ||
    !pluginName ||
    !marketplaceName ||
    !pluginKey ||
    !reportedAt ||
    !updatedAt
  ) {
    throw new OemCloudControlPlaneError("客户端插件安装态格式非法");
  }

  return {
    tenantId,
    userId,
    pluginName,
    marketplaceName,
    pluginKey,
    sourceKind: parsePluginMarketplaceSourceKind(value.sourceKind),
    sourceRef: normalizeText(value.sourceRef),
    state: parseClientPluginInstallState(value.state),
    releaseId: normalizeText(value.releaseId),
    packageHash: normalizeText(value.packageHash),
    manifestHash: normalizeText(value.manifestHash),
    reason: normalizeText(value.reason),
    reportedAt,
    updatedAt,
  };
}
