export function clearKnowledgeMocks() {
  // Knowledge 生产路径已迁入 App Server current，默认 mock 不再持有状态。
}

export const knowledgeMocks: Record<
  string,
  (args?: Record<string, unknown>) => unknown
> = {};
