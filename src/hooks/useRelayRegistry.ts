/**
 * @file Relay Registry 管理 Hook
 * @description 管理中转商注册表的加载、刷新和状态
 * @module hooks/useRelayRegistry
 *
 * _Requirements: 2.1, 7.2, 7.3_
 */

import { useCallback, useEffect, useState } from "react";
import type { RelayInfo } from "@/lib/api/connect";

interface UseRelayRegistryOptions {
  autoLoad?: boolean;
}

/**
 * Registry 错误
 */
interface RegistryError {
  code: string;
  message: string;
}

/**
 * useRelayRegistry Hook 返回值
 */
interface UseRelayRegistryReturn {
  /** 所有中转商列表 */
  providers: RelayInfo[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: RegistryError | null;
  /** 刷新注册表 */
  refresh: () => Promise<void>;
  /** 获取指定中转商信息 */
  getProvider: (relayId: string) => RelayInfo | undefined;
}

/**
 * Relay Registry 管理 Hook。
 *
 * Connect registry 不再通过前端列表命令预加载。Electron deep link
 * URL 发生时，`useDeepLink -> src/lib/api/connect.ts -> App Server`
 * 会按需解析注册表并保存 API Key。
 */
export function useRelayRegistry(
  options: UseRelayRegistryOptions = {},
): UseRelayRegistryReturn {
  const { autoLoad = true } = options;
  const [providers, setProviders] = useState<RelayInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<RegistryError | null>(null);

  /**
   * 刷新注册表
   */
  const refresh = useCallback(async () => {
    setIsLoading(false);
    setError({
      code: "REGISTRY_LIST_DISABLED",
      message: "Connect registry list is resolved on demand by App Server.",
    });
  }, []);

  /**
   * 获取指定中转商信息
   */
  const getProvider = useCallback(
    (relayId: string): RelayInfo | undefined => {
      return providers.find((p) => p.id === relayId);
    },
    [providers],
  );

  useEffect(() => {
    setIsLoading(false);
    if (!autoLoad) {
      return;
    }

    setProviders([]);
    setError(null);
  }, [autoLoad]);

  return {
    providers,
    isLoading,
    error,
    refresh,
    getProvider,
  };
}
