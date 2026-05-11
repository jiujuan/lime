import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { AutomationHealthPanel } from "./AutomationHealthPanel";

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  await changeLimeLocale("en-US");
});

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      break;
    }
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }

  await changeLimeLocale("zh-CN");
});

async function renderPanel() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(
      <AutomationHealthPanel
        status={{
          running: true,
          last_polled_at: "2026-03-16T00:00:00Z",
          next_poll_at: "2026-03-16T00:05:00Z",
          last_job_count: 1,
          total_executions: 8,
          active_job_id: null,
          active_job_name: null,
        }}
        health={{
          total_jobs: 1,
          enabled_jobs: 1,
          pending_jobs: 0,
          running_jobs: 0,
          failed_jobs: 0,
          cooldown_jobs: 0,
          stale_running_jobs: 0,
          failed_last_24h: 0,
          failure_trend_24h: [],
          alerts: [],
          risky_jobs: [
            {
              job_id: "job-browser-1",
              name: "Browser inspection",
              status: "waiting_for_human",
              consecutive_failures: 0,
              retry_count: 0,
              detail_message: "Waiting for your confirmation to continue",
              auto_disabled_until: null,
              updated_at: "2026-03-16T00:00:05Z",
            },
          ],
          generated_at: "2026-03-16T00:00:05Z",
        }}
      />,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

describe("AutomationHealthPanel", () => {
  it("风险提醒应展示人工处理原因", async () => {
    const container = await renderPanel();
    const text = container.textContent ?? "";

    expect(text).toContain("Risk Alerts");
    expect(text).toContain("Polling running");
    expect(text).toContain("Total runs 8");
    expect(text).toContain("Enabled");
    expect(text).toContain("Last poll hits: 1");
    expect(text).toContain("Waiting for human");
    expect(text).toContain("Waiting for your confirmation to continue");
    expect(text).not.toContain("风险提醒");
    expect(text).not.toContain("settings.automation.health");
  });
});
