import type { HarnessOutputSignal } from "./harnessState";

export function buildHarnessOutputSignalText(signal: HarnessOutputSignal): string {
  return [signal.title, signal.summary, signal.preview]
    .filter(Boolean)
    .join(" ");
}

export function isFailedHarnessOutputSignal(
  signal: HarnessOutputSignal,
): boolean {
  if (typeof signal.exitCode === "number") {
    return signal.exitCode !== 0;
  }
  return /fail|failed|error|失败|错误|報錯|报错/i.test(
    buildHarnessOutputSignalText(signal),
  );
}

export function isPassingHarnessOutputSignal(
  signal: HarnessOutputSignal,
): boolean {
  if (typeof signal.exitCode === "number") {
    return signal.exitCode === 0;
  }
  return /pass|passed|ok|success|成功|通过|通過/i.test(
    buildHarnessOutputSignalText(signal),
  );
}

export function countFailedHarnessOutputSignals(
  signals: readonly HarnessOutputSignal[],
): number {
  return signals.filter(isFailedHarnessOutputSignal).length;
}

export function countPassingHarnessOutputSignals(
  signals: readonly HarnessOutputSignal[],
): number {
  return signals.filter(isPassingHarnessOutputSignal).length;
}

export function resolvePriorityHarnessOutputSignal(
  signals: readonly HarnessOutputSignal[],
): HarnessOutputSignal | null {
  return signals.find(isFailedHarnessOutputSignal) || signals[0] || null;
}
