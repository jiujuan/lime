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
      { timeoutMs: 32, intervalMs: 8 },
    );

    await vi.advanceTimersByTimeAsync(40);
    await promise;

    expect(loader).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("图片命令发送前应给延迟加载的 Provider 选择一次短等待窗口", async () => {
    vi.useFakeTimers();
    const loader = vi.fn();
    let committed = false;
    const ready = vi.fn(() => committed);
    const promise = ensureImageWorkbenchProviderSelectionCommitted(
      loader,
      ready,
      { timeoutMs: 100, intervalMs: 10 },
    );

    await vi.advanceTimersByTimeAsync(20);
    committed = true;
    await vi.advanceTimersByTimeAsync(10);
    await promise;

    expect(loader).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("短请求完成后应立即复查选择，不必等到下一个轮询间隔", async () => {
    vi.useFakeTimers();
    let committed = false;
    const loader = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => {
            committed = true;
            resolve();
          }, 20);
        }),
    );
    const ready = vi.fn(() => committed);
    const promise = ensureImageWorkbenchProviderSelectionCommitted(
      loader,
      ready,
      { timeoutMs: 100, intervalMs: 50 },
    );

    await vi.advanceTimersByTimeAsync(20);
    await promise;

    expect(loader).toHaveBeenCalledTimes(1);
    expect(ready.mock.results.at(-1)?.value).toBe(true);
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
