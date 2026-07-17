import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { ConversationImportJob } from "@/lib/api/conversationImport";
import { AppSidebarConversationImportProgress } from "./AppSidebarConversationImportProgress";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValueOrOptions?: string | Record<string, unknown>,
    ) => {
      if (typeof defaultValueOrOptions === "string") {
        return defaultValueOrOptions;
      }
      const template = String(defaultValueOrOptions?.defaultValue ?? "");
      return template.replace(/{{(\w+)}}/g, (_, key: string) =>
        String(defaultValueOrOptions?.[key] ?? ""),
      );
    },
  }),
}));

it("renders one stable progress surface for the active import", () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const job: ConversationImportJob = {
    jobId: "import-job-1",
    sourceClient: "codex",
    sourceThreadId: "thread-1",
    status: "running",
    progress: {
      phase: "persisting_history",
      completedItems: 50,
      totalItems: 100,
      completedTurns: 2,
      totalTurns: 4,
    },
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:01.000Z",
  };

  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(
      <AppSidebarConversationImportProgress
        job={job}
        currentThread={2}
        totalThreads={3}
      />,
    );
  });

  const progress = container.querySelector(
    '[data-testid="app-sidebar-conversation-import-progress"]',
  );
  expect(progress?.textContent).toContain("Saving conversation history");
  expect(progress?.textContent).toContain("2/3 · 50%");
  expect(progress?.querySelector('[style="width: 50%;"]')).not.toBeNull();
  act(() => root.unmount());
});
