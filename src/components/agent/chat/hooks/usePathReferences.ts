import { useCallback, useMemo, useState } from "react";

import type { MessagePathReference } from "../types";

import { mergePathReferences } from "../utils/pathReferences";

/**
 * 路径引用（@文件/目录）状态分层 hook。
 *
 * 把原先散落在 AgentChatWorkspace 组件体的 pathReferences 状态与
 * add/remove/clear 三个纯操作内聚到一处（R-32 状态分层）。
 * 合并/去重逻辑复用 utils/pathReferences 的 `mergePathReferences`，
 * 本 hook 只负责状态生命周期，不引入任何副作用。
 */
export interface PathReferencesController {
  /** 当前路径引用列表。 */
  pathReferences: MessagePathReference[];
  /** 追加一组引用（按 id 去重合并）。 */
  addPathReferences: (references: MessagePathReference[]) => void;
  /** 移除指定 id 的引用。 */
  removePathReference: (id: string) => void;
  /** 清空全部引用。 */
  clearPathReferences: () => void;
}

export function usePathReferences(
  initial: MessagePathReference[] = [],
): PathReferencesController {
  const [pathReferences, setPathReferences] =
    useState<MessagePathReference[]>(initial);

  const addPathReferences = useCallback(
    (references: MessagePathReference[]) => {
      setPathReferences((current) => mergePathReferences(current, references));
    },
    [],
  );

  const removePathReference = useCallback((id: string) => {
    setPathReferences((current) =>
      current.filter((reference) => reference.id !== id),
    );
  }, []);

  const clearPathReferences = useCallback(() => {
    setPathReferences([]);
  }, []);

  return useMemo(
    () => ({
      pathReferences,
      addPathReferences,
      removePathReference,
      clearPathReferences,
    }),
    [pathReferences, addPathReferences, removePathReference, clearPathReferences],
  );
}
