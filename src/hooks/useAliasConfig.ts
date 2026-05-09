/**
 * @file 别名配置加载 Hook
 * @description 根据选中的 Provider 加载对应的别名配置
 * @module hooks/useAliasConfig
 */

import { useState, useEffect } from "react";
import { getProviderAliasConfig } from "@/lib/api/modelRegistry";
import {
  isAliasProvider,
  getAliasConfigKey,
} from "@/lib/constants/providerMappings";
import type { ProviderAliasConfig } from "@/lib/types/modelRegistry";
import type { ConfiguredProvider } from "./useConfiguredProviders";

// ============================================================================
// 类型定义
// ============================================================================

interface UseAliasConfigResult {
  /** 别名配置（如果 Provider 使用别名配置） */
  aliasConfig: ProviderAliasConfig | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 加载错误 */
  error: string | null;
}

interface UseAliasConfigOptions {
  autoLoad?: boolean;
}

// ============================================================================
// Hook 实现
// ============================================================================

/**
 * 加载 Provider 的别名配置
 *
 * 当选中的 Provider 在 ALIAS_PROVIDERS 列表中时，
 * 自动加载对应的别名配置文件。
 *
 * @param selectedProvider 当前选中的 Provider
 * @returns 别名配置、加载状态和错误信息
 *
 * @example
 * ```tsx
 * const { aliasConfig, loading, error } = useAliasConfig(selectedProvider);
 *
 * if (loading) return <Spinner />;
 * if (error) return <Error message={error} />;
 *
 * // 使用 aliasConfig.models 获取模型列表
 * ```
 */
export function useAliasConfig(
  selectedProvider: ConfiguredProvider | undefined | null,
  options: UseAliasConfigOptions = {},
): UseAliasConfigResult {
  const { autoLoad = true } = options;
  const [aliasConfig, setAliasConfig] = useState<ProviderAliasConfig | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoLoad) {
      setAliasConfig(null);
      setLoading(false);
      setError(null);
      return;
    }

    // 如果没有选中 Provider，清空配置
    if (!selectedProvider) {
      setAliasConfig(null);
      setLoading(false);
      setError(null);
      return;
    }

    // 如果不是别名 Provider，清空配置
    if (!isAliasProvider(selectedProvider.key)) {
      setAliasConfig(null);
      setLoading(false);
      setError(null);
      return;
    }

    // 加载别名配置
    setLoading(true);
    setError(null);

    // 使用映射获取实际的别名配置文件名
    const aliasConfigKey = getAliasConfigKey(selectedProvider.key);

    getProviderAliasConfig(aliasConfigKey)
      .then((config) => {
        setAliasConfig(config);
        setError(null);
      })
      .catch((err) => {
        console.error("加载别名配置失败:", err);
        setAliasConfig(null);
        setError(err instanceof Error ? err.message : "加载别名配置失败");
      })
      .finally(() => {
        setLoading(false);
      });
    // 只依赖 key 变化，避免 selectedProvider 对象引用变化导致不必要的重新加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, selectedProvider?.key]);

  return {
    aliasConfig,
    loading,
    error,
  };
}
