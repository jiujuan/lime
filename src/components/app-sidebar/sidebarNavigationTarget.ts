import type { Page, PageParams } from "@/types/page";
import type { SidebarNavItemDefinition } from "@/lib/navigation/sidebarNav";

export interface SidebarNavigationTarget {
  page: Page;
  rawParams?: PageParams;
  paramsKey: string;
}

function normalizeNavigationParams(params?: PageParams): PageParams {
  return params ? { ...params } : {};
}

export function serializeNavigationParams(params?: PageParams): string {
  return JSON.stringify(normalizeNavigationParams(params));
}

export function resolveSidebarNavigationTarget(
  item: SidebarNavItemDefinition,
): SidebarNavigationTarget | null {
  if (!item.page) {
    return null;
  }

  const rawParams = item.resolveParams
    ? item.resolveParams(item.params)
    : item.params;

  return {
    page: item.page,
    rawParams,
    paramsKey: serializeNavigationParams(rawParams),
  };
}

export function isSameSidebarNavigationTarget(
  target: SidebarNavigationTarget | null,
  page: Page,
  params?: PageParams,
): boolean {
  if (!target) {
    return false;
  }

  return (
    target.page === page &&
    target.paramsKey === serializeNavigationParams(params)
  );
}
