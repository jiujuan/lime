import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import type { AgentToolCallState as ToolCallState } from "@/lib/api/agentProtocol";
import { ToolCallDisplay, ToolCallList } from "./ToolCallDisplay";

vi.mock("@/lib/api/externalUrl", () => ({
  openExternalUrlWithSystemBrowser: vi.fn().mockResolvedValue(undefined),
}));

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
}

const mountedRoots: RenderResult[] = [];

function mount(node: ReactNode): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(node);
  });

  const rendered = { container, root };
  mountedRoots.push(rendered);
  return rendered;
}

export function renderTool(
  toolCall: ToolCallState,
  props: Partial<Omit<ComponentProps<typeof ToolCallDisplay>, "toolCall">> = {},
): RenderResult {
  return mount(<ToolCallDisplay toolCall={toolCall} {...props} />);
}

export function renderToolList(
  props: ComponentProps<typeof ToolCallList>,
): RenderResult {
  return mount(<ToolCallList {...props} />);
}

afterEach(() => {
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
});

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
});
