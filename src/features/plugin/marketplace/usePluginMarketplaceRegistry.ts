import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OemCloudControlPlaneError } from "@/lib/api/oemCloudControlPlane";
import {
  loadPluginMarketplaceRegistry,
  type PluginMarketplaceQuery,
  type PluginMarketplaceRegistryLoaderDeps,
  type PluginMarketplaceRegistrySnapshot,
} from "./marketplaceRegistryLoader";
import {
  buildPluginMarketplaceViewModel,
  type PluginMarketplaceViewModel,
  type PluginMarketplaceViewOptions,
} from "./pluginMarketplaceViewModel";

export type PluginMarketplaceRegistryLoader = (
  tenantId: string,
  query?: PluginMarketplaceQuery,
  deps?: PluginMarketplaceRegistryLoaderDeps,
) => Promise<PluginMarketplaceRegistrySnapshot>;

export interface UsePluginMarketplaceRegistryOptions {
  tenantId: string;
  marketplaceQuery?: PluginMarketplaceQuery;
  viewOptions?: PluginMarketplaceViewOptions;
  autoLoad?: boolean;
  loader?: PluginMarketplaceRegistryLoader;
  loaderDeps?: PluginMarketplaceRegistryLoaderDeps;
}

export interface UsePluginMarketplaceRegistryResult {
  loading: boolean;
  error: string | null;
  authRequired: boolean;
  snapshot: PluginMarketplaceRegistrySnapshot | null;
  model: PluginMarketplaceViewModel | null;
  refresh: () => Promise<PluginMarketplaceRegistrySnapshot>;
}

function readOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeMarketplaceQuery(
  query: PluginMarketplaceQuery | undefined,
): PluginMarketplaceQuery {
  return {
    query: readOptionalText(query?.query),
    category: readOptionalText(query?.category),
    sort: readOptionalText(query?.sort),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string"
    ? error
    : "Plugin marketplace registry load failed";
}

function isAuthenticationError(error: unknown): boolean {
  if (
    error instanceof OemCloudControlPlaneError &&
    (error.status === 401 || error.status === 403)
  ) {
    return true;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.trim().toLowerCase();
  return (
    normalized.includes("invalid auth token") ||
    normalized.includes("session token") ||
    normalized.includes("unauthorized") ||
    normalized.includes("unauthenticated")
  );
}

export function usePluginMarketplaceRegistry({
  tenantId,
  marketplaceQuery,
  viewOptions,
  autoLoad = true,
  loader = loadPluginMarketplaceRegistry,
  loaderDeps,
}: UsePluginMarketplaceRegistryOptions): UsePluginMarketplaceRegistryResult {
  const mountedRef = useRef(false);
  const requestSeqRef = useRef(0);
  const marketplaceQueryText = marketplaceQuery?.query;
  const marketplaceQueryCategory = marketplaceQuery?.category;
  const marketplaceQuerySort = marketplaceQuery?.sort;
  const viewQuery = viewOptions?.query;
  const viewCategory = viewOptions?.category;
  const viewStatusFilter = viewOptions?.statusFilter;
  const viewSort = viewOptions?.sort;
  const normalizedTenantId = useMemo(() => tenantId.trim(), [tenantId]);
  const normalizedMarketplaceQuery = useMemo(
    () =>
      normalizeMarketplaceQuery({
        query: marketplaceQueryText,
        category: marketplaceQueryCategory,
        sort: marketplaceQuerySort,
      }),
    [marketplaceQueryCategory, marketplaceQuerySort, marketplaceQueryText],
  );
  const [snapshot, setSnapshot] =
    useState<PluginMarketplaceRegistrySnapshot | null>(null);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSeqRef.current += 1;
    };
  }, []);

  const refresh = useCallback(async () => {
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setLoading(true);
    setError(null);
    setAuthRequired(false);

    try {
      const nextSnapshot = await loader(
        normalizedTenantId,
        normalizedMarketplaceQuery,
        loaderDeps,
      );
      if (mountedRef.current && requestSeq === requestSeqRef.current) {
        setSnapshot(nextSnapshot);
      }
      return nextSnapshot;
    } catch (loadError) {
      if (mountedRef.current && requestSeq === requestSeqRef.current) {
        if (isAuthenticationError(loadError)) {
          setAuthRequired(true);
          setSnapshot(null);
          setError(null);
        } else {
          setError(errorMessage(loadError));
        }
      }
      throw loadError;
    } finally {
      if (mountedRef.current && requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [loader, loaderDeps, normalizedMarketplaceQuery, normalizedTenantId]);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }
    void refresh().catch(() => undefined);
  }, [autoLoad, refresh]);

  const model = useMemo(
    () =>
      snapshot
        ? buildPluginMarketplaceViewModel(snapshot, {
            query: viewQuery,
            category: viewCategory,
            statusFilter: viewStatusFilter,
            sort: viewSort,
          })
        : null,
    [snapshot, viewCategory, viewQuery, viewSort, viewStatusFilter],
  );

  return {
    loading,
    error,
    authRequired,
    snapshot,
    model,
    refresh,
  };
}
