import { afterEach, describe, expect, it, vi } from "vitest";
import { AppServerEventBus } from "./appServerEventBus";

describe("AppServerEventBus", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("includeRecent subscription 应以对象参数 drain 最近镜像事件", async () => {
    vi.useFakeTimers();
    const drainEvents = vi.fn().mockResolvedValue([]);
    const eventBus = new AppServerEventBus({ drainEvents });

    const unsubscribe = eventBus.subscribe({
      getDrainOptions: () => ({
        includeRecent: true,
        intervalMs: 1_000,
        limit: 7,
      }),
      onNotifications: vi.fn(),
    });

    await Promise.resolve();

    expect(drainEvents).toHaveBeenCalledWith({
      includeRecent: true,
      limit: 7,
    });

    unsubscribe();
    await vi.runOnlyPendingTimersAsync();
  });

  it("includeRecent subscription 不应被 fast-first limit 压成 1", async () => {
    vi.useFakeTimers();
    const drainEvents = vi.fn().mockResolvedValue([]);
    const eventBus = new AppServerEventBus({ drainEvents });

    const unsubscribeRecent = eventBus.subscribe({
      getDrainOptions: () => ({
        includeRecent: true,
        intervalMs: 1_000,
        limit: 7,
      }),
      onNotifications: vi.fn(),
    });
    const unsubscribeFastFirst = eventBus.subscribe({
      getDrainOptions: () => ({
        intervalMs: 10,
        limit: 1,
      }),
      onNotifications: vi.fn(),
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);

    expect(drainEvents).toHaveBeenLastCalledWith({
      includeRecent: true,
      limit: 7,
    });

    unsubscribeFastFirst();
    unsubscribeRecent();
    await vi.runOnlyPendingTimersAsync();
  });
});
