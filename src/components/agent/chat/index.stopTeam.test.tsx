import { describe, expect, it, vi } from "vitest";
import {
  createMockAgentChatUnifiedState,
  flushEffects,
  getIndexTestMocks,
  installMockAgentChatUnifiedState,
  type MockInputbarSendProps,
  renderPage,
} from "./index.testFixtures";

const {
  mockCloseAgentRuntimeSubagent,
  mockInputbar,
  mockToast,
} = getIndexTestMocks();

describe("AgentChatPage 停止 Team 协作", () => {
  it("点击停止时只停止主输出，迁移期不再调用旧子任务控制 facade", async () => {
    const stopSendingMock = vi.fn(async () => undefined);

    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        isSending: true,
        stopSending: stopSendingMock,
        childSubagentSessions: [
          {
            id: "child-session-running",
            name: "运行中成员",
            created_at: 1700000000,
            updated_at: 1700000001,
            session_type: "sub_agent",
            runtime_status: "running",
          },
          {
            id: "child-session-queued",
            name: "排队中成员",
            created_at: 1700000002,
            updated_at: 1700000003,
            session_type: "sub_agent",
            runtime_status: "queued",
          },
          {
            id: "child-session-done",
            name: "已完成成员",
            created_at: 1700000004,
            updated_at: 1700000005,
            session_type: "sub_agent",
            runtime_status: "completed",
          },
        ],
      }),
    );
    mockCloseAgentRuntimeSubagent
      .mockResolvedValueOnce({
        previous_status: {
          session_id: "child-session-running",
          kind: "running",
        },
        cascade_session_ids: [],
        changed_session_ids: ["child-session-running"],
      })
      .mockResolvedValueOnce({
        previous_status: {
          session_id: "child-session-queued",
          kind: "queued",
        },
        cascade_session_ids: [],
        changed_session_ids: ["child-session-queued"],
      });

    renderPage();
    await flushEffects();

    const latestInputbarProps = [...mockInputbar.mock.calls]
      .map((call) => call[0] as MockInputbarSendProps | undefined)
      .reverse()
      .find((props) => typeof props?.onStop === "function");

    expect(latestInputbarProps?.onStop).toBeTypeOf("function");

    await latestInputbarProps?.onStop?.();
    await flushEffects();

    expect(stopSendingMock).toHaveBeenCalledTimes(1);
    expect(mockCloseAgentRuntimeSubagent).not.toHaveBeenCalled();
    expect(mockToast.info).toHaveBeenCalledTimes(1);
    expect(mockToast.info.mock.calls[0]?.[0]).toBeTypeOf("string");
  });
});
