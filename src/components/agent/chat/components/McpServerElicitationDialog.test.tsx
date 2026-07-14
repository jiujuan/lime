import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLimeLocale } from "@/i18n/createI18n";
import { getLimeI18n } from "@/i18n/createI18n";
import { SUPPORTED_LOCALES } from "@/i18n/locales";
import {
  McpServerElicitationController,
  type ScopedMcpServerElicitationRequestParams,
} from "@/lib/api/mcpServerElicitation";
import { McpServerElicitationDialog } from "./McpServerElicitationDialog";

type Handler = (
  params: ScopedMcpServerElicitationRequestParams,
  request: unknown,
  signal: AbortSignal,
) => Promise<unknown> | unknown;

interface Harness {
  container: HTMLDivElement;
  controller: McpServerElicitationController;
  dispatch: (
    input?: ScopedMcpServerElicitationRequestParams,
  ) => Promise<unknown>;
  root: Root;
}

const mounted: Harness[] = [];

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await changeLimeLocale("zh-CN");
});

afterEach(async () => {
  for (const harness of mounted.splice(0)) {
    act(() => harness.root.unmount());
    harness.container.remove();
  }
  document.body.replaceChildren();
  await changeLimeLocale("zh-CN");
  vi.unstubAllGlobals();
});

function renderDialog(): Harness {
  let handler: Handler | undefined;
  const dispatcher = {
    register(_method: string, next: Handler) {
      handler = next;
      return () => undefined;
    },
  };
  const controller = new McpServerElicitationController(dispatcher as never);
  controller.attach();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() =>
    root.render(<McpServerElicitationDialog controller={controller} />),
  );
  const harness = {
    container,
    controller,
    dispatch(input = params()) {
      if (!handler) throw new Error("handler missing");
      return Promise.resolve(handler(input, {}, new AbortController().signal));
    },
    root,
  };
  mounted.push(harness);
  return harness;
}

function params(): ScopedMcpServerElicitationRequestParams {
  return {
    mode: "form",
    serverName: "release-tools",
    threadId: "thread-1",
    turnId: "turn-1",
    message: "请确认发布参数",
    requestedSchema: {
      type: "object",
      properties: {
        environment: {
          type: "string",
          title: "环境",
          enum: ["staging", "production"],
          enumNames: ["预发布", "生产"],
        },
        retries: {
          type: "integer",
          title: "重试次数",
          minimum: 0,
          maximum: 3,
        },
        confirmed: {
          type: "boolean",
          title: "确认发布",
        },
      },
      required: ["environment", "retries", "confirmed"],
    },
  };
}

function button(text: string): HTMLButtonElement {
  const match = [...document.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!match) throw new Error(`button missing: ${text}`);
  return match as HTMLButtonElement;
}

function click(element: HTMLElement) {
  act(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function change(element: HTMLInputElement | HTMLSelectElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      "value",
    )?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("McpServerElicitationDialog", () => {
  it("五种支持语言都提供稳定的 MCP form 文案", async () => {
    const i18n = getLimeI18n();
    for (const locale of SUPPORTED_LOCALES) {
      await changeLimeLocale(locale);
      for (const key of [
        "agentChat.mcpElicitation.title",
        "agentChat.mcpElicitation.action.accept",
        "agentChat.mcpElicitation.action.decline",
        "agentChat.mcpElicitation.action.cancel",
        "agentChat.mcpElicitation.validation.missing_required",
        "agentChat.mcpElicitation.validation.invalid_integer",
      ]) {
        expect(i18n.t(key, { ns: "agent" })).not.toBe(key);
      }
    }
  });

  it("按 schema key 提交 enum、integer 与 boolean structured content", async () => {
    const harness = renderDialog();
    let response!: Promise<unknown>;
    await act(async () => {
      response = harness.dispatch();
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("MCP 服务需要信息");
    expect(document.body.textContent).toContain("请确认发布参数");
    const select = document.querySelector("select") as HTMLSelectElement;
    const number = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    const checkbox = document.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    change(select, "production");
    change(number, "2");
    click(checkbox);
    click(button("提交"));

    await expect(response).resolves.toEqual({
      action: "accept",
      content: {
        environment: "production",
        retries: 2,
        confirmed: true,
      },
    });
    expect(harness.controller.getSnapshot()).toEqual([]);
  });

  it("required 与 integer 校验失败时保持请求 pending", async () => {
    const harness = renderDialog();
    await act(async () => {
      void harness.dispatch();
      await Promise.resolve();
    });
    const number = document.querySelector(
      'input[type="number"]',
    ) as HTMLInputElement;
    change(number, "1.5");
    click(button("提交"));

    expect(document.body.textContent).toContain("此项为必填项");
    expect(document.body.textContent).toContain("请输入整数");
    expect(harness.controller.getSnapshot()).toHaveLength(1);
  });

  it("optional boolean 不伪造 false，number default 未编辑也会提交", async () => {
    const harness = renderDialog();
    let response!: Promise<unknown>;
    await act(async () => {
      response = harness.dispatch({
        ...params(),
        requestedSchema: {
          type: "object",
          properties: {
            optional: { type: "boolean" },
            retries: { type: "number", default: 1.5 },
          },
          required: ["retries"],
        },
      });
      await Promise.resolve();
    });

    click(button("提交"));

    await expect(response).resolves.toEqual({
      action: "accept",
      content: { retries: 1.5 },
    });
  });

  it("optional boolean 经用户操作后可以明确提交 false", async () => {
    const harness = renderDialog();
    let response!: Promise<unknown>;
    await act(async () => {
      response = harness.dispatch({
        ...params(),
        requestedSchema: {
          type: "object",
          properties: { optional: { type: "boolean" } },
        },
      });
      await Promise.resolve();
    });
    const checkbox = document.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    click(checkbox);
    click(checkbox);
    click(button("提交"));

    await expect(response).resolves.toEqual({
      action: "accept",
      content: { optional: false },
    });
  });

  it("datetime-local 输入转换为 RFC3339 后提交", async () => {
    const harness = renderDialog();
    let response!: Promise<unknown>;
    await act(async () => {
      response = harness.dispatch({
        ...params(),
        requestedSchema: {
          type: "object",
          properties: {
            scheduledAt: { type: "string", format: "date-time" },
          },
          required: ["scheduledAt"],
        },
      });
      await Promise.resolve();
    });
    const input = document.querySelector(
      'input[type="datetime-local"]',
    ) as HTMLInputElement;
    change(input, "2026-07-13T11:00:00");
    click(button("提交"));

    const result = (await response) as {
      action: string;
      content: { scheduledAt: string };
    };
    expect(result.action).toBe("accept");
    expect(result.content.scheduledAt).toMatch(
      /^2026-07-13T\d{2}:00:00\.000Z$/,
    );
  });

  it("拒绝与关闭分别返回 decline 和 cancel", async () => {
    const harness = renderDialog();
    let declined!: Promise<unknown>;
    await act(async () => {
      declined = harness.dispatch();
      await Promise.resolve();
    });
    click(button("拒绝"));
    await expect(declined).resolves.toEqual({ action: "decline" });

    let canceled!: Promise<unknown>;
    await act(async () => {
      canceled = harness.dispatch();
      await Promise.resolve();
    });
    click(button("取消"));
    await expect(canceled).resolves.toEqual({ action: "cancel" });
  });
});
