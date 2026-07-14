import { describe, expect, it, vi } from "vitest";
import {
  createMockAgentChatUnifiedState,
  flushEffects,
  getIndexTestMocks,
  installMockAgentChatUnifiedState,
  type MockInputbarSendProps,
  renderPage,
} from "./index.testFixtures";

const { mockCloseAgentRuntimeSubagent, mockInputbar, mockToast } =
  getIndexTestMocks();

describe("AgentChatPage 停止 Team 协作", () => {
  it("点击停止时只停止主输出，不调用或提示已删除的子任务控制", async () => {
    const stopSendingMock = vi.fn(async () => undefined);

    installMockAgentChatUnifiedState(
      createMockAgentChatUnifiedState({
        isSending: true,
        stopSending: stopSendingMock,
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
    expect(mockToast.info).not.toHaveBeenCalled();
  });
});
