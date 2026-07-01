import { describe, expect, it, vi } from "vitest";
import { ensureImageWorkbenchProviderSelectionCommitted } from "./imageWorkbenchProviderReadiness";

describe("ensureImageWorkbenchProviderSelectionCommitted", () => {
  it("不应等待 Provider loader 的长请求完成后才释放发送链路", async () => {
    vi.useFakeTimers();
    const loader = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, 30_000);
        }),
    );
    const ready = vi.fn(() => false);
    const promise = ensureImageWorkbenchProviderSelectionCommitted(
      loader,
      ready,
    );

    await vi.advanceTimersByTimeAsync(10);
    await promise;

    expect(loader).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("selection 就绪时应立即收口", async () => {
    const loader = vi.fn();
    const ready = vi.fn(() => true);

    await ensureImageWorkbenchProviderSelectionCommitted(loader, ready);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
