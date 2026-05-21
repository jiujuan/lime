import {
  hasOemCloudSession,
  resolveOemCloudRuntimeContext,
} from "@/lib/api/oemCloudRuntime";
import { parseExpertCatalog } from "./parseExpertCatalog";
import { getSeededExpertCatalog } from "./seededExpertCatalog";
import type { ExpertCatalog } from "./types";

const EXPERT_CATALOG_CACHE_STORAGE_KEY = "lime:expert-catalog-cache:v1";

interface ExpertCatalogResponseEnvelope {
  code?: number;
  message?: string;
  data?: unknown;
}

export interface GetExpertCatalogOptions {
  refreshRemote?: boolean;
}

function isDisplayableExpertCatalog(
  catalog: ExpertCatalog | null,
): catalog is ExpertCatalog {
  return Boolean(catalog && catalog.items.length > 0);
}

export function readCachedExpertCatalog(): ExpertCatalog | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(EXPERT_CATALOG_CACHE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const catalog = parseExpertCatalog(JSON.parse(raw) as unknown);
    return isDisplayableExpertCatalog(catalog) ? catalog : null;
  } catch {
    return null;
  }
}

export function saveCachedExpertCatalog(catalog: ExpertCatalog): ExpertCatalog {
  const parsed = parseExpertCatalog(catalog);
  if (!isDisplayableExpertCatalog(parsed)) {
    return getSeededExpertCatalog();
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      EXPERT_CATALOG_CACHE_STORAGE_KEY,
      JSON.stringify(parsed),
    );
  }
  return parsed;
}

async function requestRemoteExpertCatalog(): Promise<ExpertCatalog> {
  const runtime = resolveOemCloudRuntimeContext();
  if (!runtime) {
    throw new Error("缺少品牌云端配置，请先注入 base_url 与 tenant_id。");
  }
  if (!hasOemCloudSession(runtime)) {
    throw new Error("缺少品牌云端 Session Token，请先完成登录或注入会话。");
  }

  const response = await fetch(
    `${runtime.controlPlaneBaseUrl}/v1/public/tenants/${encodeURIComponent(runtime.tenantId)}/client/experts?includeRankings=true`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${runtime.sessionToken}`,
      },
    },
  );

  let payload: ExpertCatalogResponseEnvelope | null = null;
  try {
    payload = (await response.json()) as ExpertCatalogResponseEnvelope;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.message?.trim() || `请求失败 (${response.status})`,
    );
  }

  const catalog = parseExpertCatalog(payload?.data);
  if (!catalog) {
    throw new Error(payload?.message?.trim() || "服务端返回的专家目录格式非法");
  }

  return catalog;
}

export async function getExpertCatalog(
  options: GetExpertCatalogOptions = {},
): Promise<ExpertCatalog> {
  if (!options.refreshRemote) {
    return readCachedExpertCatalog() ?? getSeededExpertCatalog();
  }

  try {
    const remoteCatalog = await requestRemoteExpertCatalog();
    if (!isDisplayableExpertCatalog(remoteCatalog)) {
      return readCachedExpertCatalog() ?? getSeededExpertCatalog();
    }
    return saveCachedExpertCatalog(remoteCatalog);
  } catch {
    return readCachedExpertCatalog() ?? getSeededExpertCatalog();
  }
}
