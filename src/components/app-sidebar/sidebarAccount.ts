import type { OemCloudStoredSessionState } from "@/lib/oemCloudSession";
import type { OemCloudBootstrapResponse } from "@/lib/api/oemCloudControlPlane";

export function resolveAccountDisplayName(
  sessionState: OemCloudStoredSessionState | null,
  fallbackDisplayName: string,
): string {
  const user = sessionState?.session.user;
  const fallbackEmailName = user?.email?.split("@")[0]?.trim();
  return (
    user?.displayName?.trim() ||
    user?.username?.trim() ||
    fallbackEmailName ||
    fallbackDisplayName
  );
}

export function resolveAccountEmail(
  sessionState: OemCloudStoredSessionState | null,
): string | null {
  return sessionState?.session.user.email?.trim() || null;
}

export function resolveAccountTenantLabel(
  sessionState: OemCloudStoredSessionState | null,
): string | null {
  const tenant = sessionState?.session.tenant;
  return (
    tenant?.name?.trim() || tenant?.slug?.trim() || tenant?.id?.trim() || null
  );
}

export function parseAccountUsagePercent(
  value: string | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const percentMatch = value.match(/(?:已用\s*)?(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    return Math.min(100, Math.max(0, Number(percentMatch[1])));
  }

  const ratioMatch = value.match(
    /([\d,]+(?:\.\d+)?)\s*\/\s*([\d,]+(?:\.\d+)?)/,
  );
  if (!ratioMatch) {
    return null;
  }

  const used = Number(ratioMatch[1].replace(/,/g, ""));
  const total = Number(ratioMatch[2].replace(/,/g, ""));
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) {
    return null;
  }

  return Math.min(100, Math.max(0, (used / total) * 100));
}

export function resolveAccountPlanSummary(
  bootstrap: OemCloudBootstrapResponse | null,
  fallbackPlanLabel: string,
): {
  planLabel: string;
  usageLabel: string | null;
  usagePercent: number | null;
} {
  const preference = bootstrap?.providerPreference;
  if (!preference) {
    return {
      planLabel: fallbackPlanLabel,
      usageLabel: null,
      usagePercent: null,
    };
  }

  const providerOffers = Array.isArray(bootstrap.providerOffersSummary)
    ? bootstrap.providerOffersSummary
    : [];
  const matchedOffer = providerOffers.find(
    (offer) => offer.providerKey === preference.providerKey,
  );
  const usageLabel = matchedOffer?.creditsSummary?.trim() || null;

  return {
    planLabel: matchedOffer?.currentPlan?.trim() || fallbackPlanLabel,
    usageLabel,
    usagePercent: parseAccountUsagePercent(usageLabel ?? undefined),
  };
}

export function resolveAccountInitial(name: string): string {
  const normalized = name.trim();
  if (!normalized) {
    return "L";
  }

  return normalized.slice(0, 1).toUpperCase();
}

export function resolveCloudBrandLabel(
  bootstrap: OemCloudBootstrapResponse | null,
  fallbackBrandLabel: string,
  cloudSuffixLabel: string,
): string {
  const appName = bootstrap?.app?.name?.trim();
  if (!appName) {
    return fallbackBrandLabel;
  }

  return /云|Cloud|Hub/i.test(appName)
    ? appName
    : `${appName} ${cloudSuffixLabel}`;
}
