import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { ChatSidebar } from "./ChatSidebar";
import type { Topic } from "../hooks/agentChatShared";
import type { Message } from "../types";

vi.mock("@/components/ui/badge", () => ({
  Badge: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button type="button" className={className} onClick={onClick}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <div />,
}));

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
});

afterEach(() => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) break;
    act(() => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  vi.clearAllMocks();
});

export const defaultTopics: Topic[] = [
  {
    id: "topic-1",
    title: "任务一",
    createdAt: new Date(),
    updatedAt: new Date(),
    messagesCount: 2,
    executionStrategy: "react",
    status: "done",
    lastPreview: "已记录 2 条消息，可继续补充或接着推进。",
    isPinned: false,
    hasUnread: false,
    tag: null,
    sourceSessionId: "topic-1",
  },
];

export function renderSidebar(
  props?: Partial<React.ComponentProps<typeof ChatSidebar>>,
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const defaultProps: React.ComponentProps<typeof ChatSidebar> = {
    onNewChat: vi.fn(),
    topics: defaultTopics,
    currentTopicId: "topic-1",
    onSwitchTopic: vi.fn(),
    onDeleteTopic: vi.fn(),
  };

  act(() => {
    root.render(<ChatSidebar {...defaultProps} {...props} />);
  });

  mountedRoots.push({ root, container });
  return container;
}

export function createPendingActionMessage(
  prompt: string,
  question = "请补充需要继续执行的信息。",
): Message {
  return {
    id: "msg-pending-action",
    role: "assistant",
    content: "",
    timestamp: new Date("2026-03-15T09:45:00.001Z"),
    actionRequests: [
      {
        requestId: "req-user-action",
        actionType: "ask_user",
        prompt,
        questions: [{ question }],
      },
    ],
  };
}
