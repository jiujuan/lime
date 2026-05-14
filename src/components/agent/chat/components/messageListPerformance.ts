export interface MessageListMeasuredComputation<T> {
  value: T;
  durationMs: number;
}

function getMessageListPerformanceNow(): number {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

export function measureMessageListComputation<T>(
  compute: () => T,
): MessageListMeasuredComputation<T> {
  const startedAt = getMessageListPerformanceNow();
  const value = compute();
  const durationMs = getMessageListPerformanceNow() - startedAt;

  return {
    value,
    durationMs: Math.round(Math.max(0, durationMs) * 10) / 10,
  };
}
