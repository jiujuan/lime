import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AgentIncidentPanel } from "./AgentIncidentPanel";
import type { ThreadReliabilityIncidentDisplay } from "../utils/threadReliabilityView";
import { changeLimeLocale } from "@/i18n/createI18n";

interface MountedHarness {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: MountedHarness[] = [];

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
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.innerHTML = "";
  await changeLimeLocale("zh-CN");
});

function renderPanel(incidents: ThreadReliabilityIncidentDisplay[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<AgentIncidentPanel incidents={incidents} />);
  });

  mountedRoots.push({ container, root });
  return container;
}

describe("AgentIncidentPanel", () => {
  it("uses agent namespace resources for the empty state", () => {
    const container = renderPanel([]);
    const text = container.textContent ?? "";

    expect(
      container.querySelector('[data-testid="agent-incident-panel-empty"]'),
    ).not.toBeNull();
    expect(text).toContain("No active incidents detected");
    expect(text).not.toContain("当前未发现活跃 incident");
  });

  it("keeps incident data dynamic while localizing the priority badge chrome", () => {
    const container = renderPanel([
      {
        id: "incident-1",
        incidentType: "approval_timeout",
        title: "Approval wait exceeded threshold",
        detail: "The thread has waited too long for tool confirmation",
        statusLabel: "Running",
        severityLabel: "High",
        tone: "failed",
      },
      {
        id: "incident-2",
        incidentType: "waiting_user_input",
        title: "Thread is waiting for manual handling",
        detail: "Waiting for confirmation before publishing",
        statusLabel: "Running",
        severityLabel: "Medium",
        tone: "waiting",
      },
    ]);
    const text = container.textContent ?? "";

    expect(
      container.querySelector('[data-testid="agent-incident-panel"]'),
    ).not.toBeNull();
    expect(text).toContain("Approval wait exceeded threshold");
    expect(text).toContain(
      "The thread has waited too long for tool confirmation",
    );
    expect(text).toContain("High priority");
    expect(text).toContain("Thread is waiting for manual handling");
    expect(text).toContain("Waiting for confirmation before publishing");
    expect(text).not.toContain("优先级");
  });
});
