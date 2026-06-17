import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DecisionPanel } from "./DecisionPanel";
import type { ActionRequired, ConfirmResponse } from "../types";
import { changeLimeLocale } from "@/i18n/createI18n";

interface RenderResult {
  container: HTMLDivElement;
  root: Root;
  onSubmit: ReturnType<
    typeof vi.fn<(response: ConfirmResponse) => void | Promise<void>>
  >;
}

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(async () => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLimeLocale("zh-CN");
});

function renderDecisionPanel(request: ActionRequired): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const onSubmit = vi.fn<(response: ConfirmResponse) => void | Promise<void>>();

  act(() => {
    root.render(<DecisionPanel request={request} onSubmit={onSubmit} />);
  });

  mountedRoots.push({ root, container });
  return { container, root, onSubmit };
}

function findButtonByText(
  container: HTMLElement,
  text: string,
): HTMLButtonElement {
  const target = Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
  if (!target) {
    throw new Error(`未找到按钮: ${text}`);
  }
  return target as HTMLButtonElement;
}

function findInputByPlaceholder(
  container: HTMLElement,
  placeholder: string,
): HTMLInputElement {
  const target = container.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );
  if (!target) {
    throw new Error(`未找到输入框: ${placeholder}`);
  }
  return target;
}

function clickButton(button: HTMLButtonElement) {
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function createElicitationRequest(requestId: string): ActionRequired {
  return {
    requestId,
    actionType: "elicitation",
    prompt: "请选择部署环境",
    requestedSchema: {
      properties: {
        answer: {
          description: "请选择一个环境",
          enum: ["开发环境", "生产环境"],
        },
      },
    },
  };
}

function createRichElicitationRequest(requestId: string): ActionRequired {
  return {
    requestId,
    actionType: "elicitation",
    prompt: "继续前请确认执行模式",
    questions: [
      {
        question: "请选择执行模式",
        header: "mode",
        options: [
          {
            label: "自动执行",
            description: "直接继续推进",
          },
          {
            label: "确认后执行",
            description: "每一步都等我确认",
          },
        ],
      },
    ],
    requestedSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["自动执行", "确认后执行"],
        },
      },
    },
  };
}

function createRuntimePermissionConfirmationRequest(): ActionRequired {
  return {
    requestId: "runtime_permission_confirmation:turn-1",
    actionType: "elicitation",
    prompt:
      "当前执行需要确认运行时权限：web_search, write_artifacts。确认后才允许继续模型执行；拒绝会保持阻断。",
    questions: [
      {
        question: "是否允许本次执行使用这些运行时权限？",
        header: "运行时权限确认",
        options: [{ label: "允许本次执行" }, { label: "拒绝" }],
      },
    ],
    requestedSchema: {
      type: "object",
      properties: {
        answer: {
          type: "string",
          enum: ["允许本次执行", "拒绝"],
        },
      },
    },
  };
}

function createAskUserRequest(requestId: string): ActionRequired {
  return {
    requestId,
    actionType: "ask_user",
    questions: [
      {
        question:
          '请选择执行模式："自动执行（Auto）"、"确认后执行（Ask）"、"只读模式"',
      },
    ],
  };
}

function createAskUserMultiSelectRequest(requestId: string): ActionRequired {
  return {
    requestId,
    actionType: "ask_user",
    questions: [
      {
        question: "请选择希望启用的能力",
        multiSelect: true,
        options: [
          {
            label: "分析",
            description: "先收集上下文",
          },
          {
            label: "编码",
            description: "直接修改实现",
          },
        ],
      },
    ],
  };
}

function createAskUserNumberedRequest(requestId: string): ActionRequired {
  return {
    requestId,
    actionType: "ask_user",
    questions: [
      {
        question:
          "请选择宣传画方向：\n1. 产品宣传海报\n2. 活动推广海报\n3. 品牌展示海报",
      },
    ],
  };
}

function createSubmittedAskUserRequest(requestId: string): ActionRequired {
  return {
    requestId,
    actionType: "ask_user",
    status: "submitted",
    prompt: "请选择执行模式",
    questions: [{ question: "你希望如何执行？" }],
    submittedResponse: "自动执行（Auto）",
    submittedUserData: { answer: "自动执行（Auto）" },
  };
}

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

describe("DecisionPanel elicitation", () => {
  it("应支持从 enum 选项选择并提交 userData.answer", () => {
    const request = createElicitationRequest("req-elicitation-option");
    const { container, onSubmit } = renderDecisionPanel(request);

    const submitButton = findButtonByText(container, "提交");
    expect(submitButton.disabled).toBe(true);

    clickButton(findButtonByText(container, "生产环境"));
    const answerInput = findInputByPlaceholder(container, "请输入回答...");
    expect(answerInput.value).toBe("生产环境");

    clickButton(findButtonByText(container, "提交"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "req-elicitation-option",
      confirmed: true,
      response: JSON.stringify({ answer: "生产环境" }),
      actionType: "elicitation",
      userData: { answer: "生产环境" },
    });
  });

  it("取消时应返回拒绝响应", () => {
    const request = createElicitationRequest("req-elicitation-cancel");
    const { container, onSubmit } = renderDecisionPanel(request);

    clickButton(findButtonByText(container, "取消"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.requestId).toBe("req-elicitation-cancel");
    expect(payload.confirmed).toBe(false);
    expect(payload.actionType).toBe("elicitation");
    expect(payload.response).toBe("用户拒绝了请求");
    expect(payload.userData).toBe("");
  });

  it("带 questions 的 elicitation 应走问题卡片 UI 并提交结构化答案", () => {
    const request = createRichElicitationRequest("req-elicitation-rich");
    const { container, onSubmit } = renderDecisionPanel(request);

    expect(container.textContent).toContain("需要你提供信息");
    expect(container.textContent).toContain("请选择执行模式");
    expect(container.textContent).toContain("每一步都等我确认");
    expect(
      container.querySelector('input[placeholder="请输入回答..."]'),
    ).toBeNull();

    clickButton(findButtonByText(container, "确认后执行"));
    clickButton(findButtonByText(container, "提交答案"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "req-elicitation-rich",
      confirmed: true,
      response: JSON.stringify({ answer: "确认后执行" }),
      actionType: "elicitation",
      userData: { answer: "确认后执行" },
    });
  });

  it("运行时权限确认应使用专属提示并提交结构化选择", () => {
    const request = createRuntimePermissionConfirmationRequest();
    const { container, onSubmit } = renderDecisionPanel(request);

    expect(container.textContent).toContain("确认运行时权限");
    expect(container.textContent).toContain(
      "本轮执行需要这些权限，确认后才会继续",
    );
    expect(container.textContent).toContain("允许本次执行");
    expect(container.textContent).toContain("拒绝");
    expect(container.textContent).not.toContain("confirmationStatus");
    expect(container.textContent).not.toContain("askProfileKeys");

    clickButton(findButtonByText(container, "允许本次执行"));
    clickButton(findButtonByText(container, "提交答案"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "runtime_permission_confirmation:turn-1",
      confirmed: true,
      response: JSON.stringify({ answer: "允许本次执行" }),
      actionType: "elicitation",
      userData: { answer: "允许本次执行" },
    });
  });
});

describe("DecisionPanel ask_user", () => {
  it("缺少 options 时应从问题文本提取可点击选项，并在点击提交按钮后发送", () => {
    const request = createAskUserRequest("req-ask-user-fallback");
    const { container, onSubmit } = renderDecisionPanel(request);

    expect(container.textContent).toContain("助手的问题");
    expect(container.textContent).not.toContain("Claude");
    expect(container.textContent).toContain("自动执行（Auto）");
    expect(container.textContent).toContain("确认后执行（Ask）");
    expect(container.textContent).toContain("只读模式");

    clickButton(findButtonByText(container, "自动执行（Auto）"));
    clickButton(findButtonByText(container, "提交答案"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "req-ask-user-fallback",
      confirmed: true,
      response: JSON.stringify({ answer: "自动执行（Auto）" }),
      actionType: "ask_user",
      userData: { answer: "自动执行（Auto）" },
    });
  });

  it("编号列表文本应提取为可点击选项，并显式提交", () => {
    const request = createAskUserNumberedRequest("req-ask-user-numbered");
    const { container, onSubmit } = renderDecisionPanel(request);

    expect(container.textContent).toContain("产品宣传海报");
    expect(container.textContent).toContain("活动推广海报");
    expect(container.textContent).toContain("品牌展示海报");

    clickButton(findButtonByText(container, "活动推广海报"));
    clickButton(findButtonByText(container, "提交答案"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "req-ask-user-numbered",
      confirmed: true,
      response: JSON.stringify({ answer: "活动推广海报" }),
      actionType: "ask_user",
      userData: { answer: "活动推广海报" },
    });
  });

  it("questions.options 为字符串数组时应归一化，并显式提交", () => {
    const request: ActionRequired = {
      requestId: "req-ask-user-string-options",
      actionType: "ask_user",
      questions: [
        {
          question: "请选择执行模式",
          options: ["自动执行（Auto）", "确认后执行（Ask）"] as any,
        },
      ],
    };
    const { container, onSubmit } = renderDecisionPanel(request);

    clickButton(findButtonByText(container, "确认后执行（Ask）"));
    clickButton(findButtonByText(container, "提交答案"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "req-ask-user-string-options",
      confirmed: true,
      response: JSON.stringify({ answer: "确认后执行（Ask）" }),
      actionType: "ask_user",
      userData: { answer: "确认后执行（Ask）" },
    });
  });

  it("multiSelect 问题应提交结构化数组，避免选项值映射丢失", () => {
    const request = createAskUserMultiSelectRequest("req-ask-user-multi");
    const { container, onSubmit } = renderDecisionPanel(request);

    clickButton(findButtonByText(container, "分析"));
    clickButton(findButtonByText(container, "编码"));
    clickButton(findButtonByText(container, "提交答案"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "req-ask-user-multi",
      confirmed: true,
      response: JSON.stringify({ answer: ["分析", "编码"] }),
      actionType: "ask_user",
      userData: { answer: ["分析", "编码"] },
    });
  });

  it("fallback ask 在 request_id 未就绪时应允许先记录答案", () => {
    const request: ActionRequired = {
      requestId: "fallback:tool-1",
      actionType: "ask_user",
      isFallback: true,
      questions: [
        {
          question: "请选择执行模式",
          options: [{ label: "自动执行（Auto）" }],
        },
      ],
    };
    const { container, onSubmit } = renderDecisionPanel(request);

    expect(container.textContent).toContain("会先被记录");
    const waitingSubmitButton = findButtonByText(container, "记录答案");
    expect(waitingSubmitButton.disabled).toBe(true);
    const optionButton = findButtonByText(container, "自动执行（Auto）");
    expect(optionButton.disabled).toBe(false);
    clickButton(optionButton);
    expect(waitingSubmitButton.disabled).toBe(false);
    clickButton(waitingSubmitButton);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "fallback:tool-1",
      confirmed: true,
      response: JSON.stringify({ answer: "自动执行（Auto）" }),
      actionType: "ask_user",
      userData: { answer: "自动执行（Auto）" },
    });
  });

  it("提交后应显示只读回显，不应再次出现可提交按钮", () => {
    const request = createSubmittedAskUserRequest("req-ask-user-submitted");
    const { container } = renderDecisionPanel(request);

    expect(container.textContent).toContain("已提交你的回答");
    expect(container.textContent).toContain("你的回答");
    expect(container.textContent).toContain("自动执行（Auto）");
    expect(container.textContent).toContain("已提交，等待助手继续执行");
    expect(container.textContent).not.toContain("提交答案");
    expect(container.textContent).not.toContain("取消");
  });

  it("Codex 导入的已处理权限请求应显示友好摘要而不是原始命令和 JSON", () => {
    const request: ActionRequired = {
      requestId: "approval-codex-imported",
      actionType: "tool_confirmation",
      toolName: "exec_command",
      prompt: "Approve Codex command: npm test",
      status: "submitted",
      submittedUserData: {
        decision: "imported_read_only",
        imported_read_only: true,
        source: "codex",
      },
      arguments: {
        command: "npm test",
        cwd: "/workspace/app",
      },
    };
    const { container } = renderDecisionPanel(request);

    expect(container.textContent).toContain("导入的权限记录");
    expect(container.textContent).toContain("处理结果");
    expect(container.textContent).toContain("已导入，只读记录");
    expect(container.textContent).toContain("记录说明");
    expect(container.textContent).toContain("从 Codex 导入的历史审批记录");
    expect(container.textContent).toContain("只读历史记录，不会重新执行");
    expect(container.textContent).not.toContain("Approve Codex command");
    expect(container.textContent).not.toContain("影响范围");
    expect(container.textContent).not.toContain("本次授权");
    expect(container.textContent).not.toContain("/workspace/app");
    expect(container.textContent).not.toContain("npm test");
    expect(container.textContent).not.toContain("imported_read_only");
    expect(container.textContent).not.toContain('"decision"');
    expect(container.textContent).not.toContain("你的回答");
    expect(container.textContent).not.toContain("等待助手继续执行");
  });

  it("显式提交答案等待回调完成时，应展示提交中并禁用交互", async () => {
    const request = createAskUserRequest("req-ask-user-loading");
    let resolveSubmit: (() => void) | null = null;
    const { container, onSubmit } = renderDecisionPanel(request);
    onSubmit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    const optionButton = findButtonByText(container, "自动执行（Auto）");

    await act(async () => {
      optionButton.click();
      await Promise.resolve();
    });

    const submitButton = findButtonByText(container, "提交答案");

    await act(async () => {
      submitButton.click();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(optionButton.disabled).toBe(true);
    expect(submitButton.disabled).toBe(true);
    expect(container.querySelector("svg.animate-spin")).not.toBeNull();

    await act(async () => {
      resolveSubmit?.();
      await Promise.resolve();
    });
  });
});

describe("DecisionPanel copywriting", () => {
  it("tool_confirmation 文案应为中性助手，不应出现 Claude", () => {
    const request: ActionRequired = {
      requestId: "req-tool-confirm",
      actionType: "tool_confirmation",
      toolName: "exec_command",
      arguments: { cmd: "ls" },
    };
    const { container } = renderDecisionPanel(request);

    expect(container.textContent).toContain("助手想要使用");
    expect(container.textContent).not.toContain("Claude");
  });

  it("tool_confirmation 应展示待确认动作、工具名和参数摘要，并继续提交允许响应", () => {
    const request: ActionRequired = {
      requestId: "req-tool-confirm-summary",
      actionType: "tool_confirmation",
      toolName: "exec_command",
      prompt: "允许执行测试命令？",
      arguments: {
        command: "npm test -- DecisionPanel",
        cwd: "/workspace/lime",
        target_path: "src/components/agent/chat/components/DecisionPanel.tsx",
        sandboxed: true,
      },
    };
    const { container, onSubmit } = renderDecisionPanel(request);

    expect(
      container.querySelector(
        '[data-testid="decision-panel-tool-confirmation-summary"]',
      ),
    ).toBeTruthy();
    expect(container.textContent).toContain("待确认动作");
    expect(container.textContent).toContain("等待确认");
    expect(container.textContent).toContain("允许执行测试命令？");
    expect(container.textContent).toContain("助手想要使用");
    expect(container.textContent).toContain("exec_command");
    expect(
      container.querySelector(
        '[data-testid="decision-panel-tool-confirmation-impact"]',
      ),
    ).toBeTruthy();
    expect(container.textContent).toContain("风险判断");
    expect(container.textContent).toContain("需确认");
    expect(container.textContent).toContain("将执行本地命令");
    expect(container.textContent).toContain("影响范围");
    expect(container.textContent).toContain("文件");
    expect(container.textContent).toContain("本次授权");
    expect(container.textContent).toContain(
      "仅允许当前这一次工具操作，不会改变后续默认权限。",
    );
    expect(container.textContent).toContain("参数摘要");
    expect(container.textContent).toContain("命令");
    expect(container.textContent).toContain("npm test -- DecisionPanel");
    expect(container.textContent).toContain("目录");
    expect(container.textContent).toContain("/workspace/lime");
    expect(container.textContent).toContain("路径");
    expect(container.textContent).toContain(
      "src/components/agent/chat/components/DecisionPanel.tsx",
    );
    expect(container.textContent).toContain("查看完整参数");
    expect(
      container.querySelectorAll(
        '[data-testid="decision-panel-tool-confirmation-argument"]',
      ).length,
    ).toBeGreaterThanOrEqual(3);

    clickButton(findButtonByText(container, "允许"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      requestId: "req-tool-confirm-summary",
      confirmed: true,
      response: "允许",
      actionType: "tool_confirmation",
    });
  });

  it("tool_confirmation 应对高影响命令展示高风险判断", () => {
    const request: ActionRequired = {
      requestId: "req-tool-confirm-destructive",
      actionType: "tool_confirmation",
      toolName: "exec_command",
      prompt: "允许删除依赖目录？",
      arguments: {
        command: "rm -rf node_modules",
        cwd: "/workspace/lime",
      },
    };
    const { container } = renderDecisionPanel(request);
    const impact = container.querySelector(
      '[data-testid="decision-panel-tool-confirmation-impact"]',
    );

    expect(impact).toBeTruthy();
    expect(impact?.textContent).toContain("风险判断");
    expect(impact?.textContent).toContain("高风险");
    expect(impact?.textContent).toContain("包含高影响命令");
    expect(impact?.textContent).toContain("影响范围");
    expect(impact?.textContent).toContain("目录");
    expect(impact?.textContent).toContain("/workspace/lime");
    expect(impact?.textContent).toContain("本次授权");
  });

  it("tool_confirmation 应优先展示运行时结构化权限事实，而不是前端启发式判断", () => {
    const request: ActionRequired = {
      requestId: "req-tool-confirm-structured-permission-facts",
      actionType: "tool_confirmation",
      toolName: "exec_command",
      prompt: "允许执行运行时预检？",
      arguments: {
        command: "rm -rf node_modules",
        cwd: "/workspace/lime",
        permission_facts: {
          risk_level: "low",
          risk_reason_label: "后端已判定为只读预检",
          scope_kind: "url",
          scope_value: "https://example.com/preflight",
          authorization_summary: "仅允许本次只读预检请求",
        },
      },
    };
    const { container } = renderDecisionPanel(request);
    const impact = container.querySelector(
      '[data-testid="decision-panel-tool-confirmation-impact"]',
    );

    expect(impact).toBeTruthy();
    expect(impact?.textContent).toContain("低风险");
    expect(impact?.textContent).toContain("后端已判定为只读预检");
    expect(impact?.textContent).toContain("链接");
    expect(impact?.textContent).toContain("https://example.com/preflight");
    expect(impact?.textContent).toContain("仅允许本次只读预检请求");
    expect(impact?.textContent).not.toContain("高风险");
    expect(impact?.textContent).not.toContain("包含高影响命令");
    expect(impact?.textContent).not.toContain("/workspace/lime");
  });

  it("tool_confirmation 提交中时，应展示处理中并禁用按钮", async () => {
    const request: ActionRequired = {
      requestId: "req-tool-confirm-loading",
      actionType: "tool_confirmation",
      toolName: "exec_command",
      arguments: { cmd: "ls" },
    };
    let resolveSubmit: (() => void) | null = null;
    const { container, onSubmit } = renderDecisionPanel(request);
    onSubmit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    const allowButton = findButtonByText(container, "允许");
    const denyButton = findButtonByText(container, "拒绝");

    await act(async () => {
      allowButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(allowButton.textContent).toContain("处理中");
    expect(allowButton.disabled).toBe(true);
    expect(denyButton.disabled).toBe(true);

    await act(async () => {
      resolveSubmit?.();
      await Promise.resolve();
    });
  });
});
