import { describe, expect, it } from "vitest";
import { changeLimeLocale, getLimeI18n } from "@/i18n/createI18n";
import type { AsterSessionDetail } from "@/lib/api/agentRuntime";
import {
  buildActivityPreviewCopy,
  buildPreviewableRailSessionsSyncKey,
  buildSelectedSessionActivityState,
  collectStaleSessionActivityTargets,
  extractSessionActivitySnapshot,
  type ActivityPreviewTranslate,
  type SessionActivityPreviewState,
} from "./activityPreviewSelectors";

async function buildEnglishActivityPreviewCopy() {
  await changeLimeLocale("en-US");
  const translate: ActivityPreviewTranslate = (key, options) =>
    String(
      getLimeI18n().t(
        key as never,
        {
          ns: "agent",
          ...(options ?? {}),
        } as never,
      ),
    );

  return buildActivityPreviewCopy({
    translate,
  });
}

describe("activityPreviewSelectors", () => {
  it("选中会话的 activity state 应优先合并实时进展并生成预览文案", () => {
    const state = buildSelectedSessionActivityState({
      selectedSession: {
        id: "child-1",
        sessionType: "sub_agent",
        runtimeStatus: "running",
        latestTurnStatus: "running",
      },
      selectedBaseSession: {
        id: "child-1",
        sessionType: "sub_agent",
        runtimeStatus: "queued",
        latestTurnStatus: "queued",
      },
      liveActivityBySessionId: {
        "child-1": [
          {
            id: "live-1",
            title: "工具 页面截图",
            detail: "页面结构差异已提取完成。",
            statusLabel: "完成",
            badgeClassName:
              "border border-emerald-200 bg-emerald-50 text-emerald-700",
          },
        ],
      },
      previewBySessionId: {
        "child-1": {
          preview: "回复：旧内容",
          entries: [
            {
              id: "stored-1",
              title: "回复",
              detail: "历史里的旧内容。",
              statusLabel: "消息",
              badgeClassName:
                "border border-slate-200 bg-slate-50 text-slate-600",
            },
          ],
          status: "ready",
          fingerprint: "child-1:1:queued:queued:0",
          refreshVersion: 0,
        },
      },
      activityRefreshVersionBySessionId: {
        "child-1": 2,
      },
      activityTimelineEntryLimit: 4,
    });

    expect(state.supportsPreview).toBe(true);
    expect(state.activityId).toBe("child-1");
    expect(state.previewText).toBe("工具 页面截图：页面结构差异已提取完成。");
    expect(state.entries[0]?.title).toBe("工具 页面截图");
    expect(state.refreshVersion).toBe(2);
    expect(state.shouldPoll).toBe(true);
    expect(state.fingerprint).toBe("child-1:0:queued:queued:0");
  });

  it("应支持注入英文 activity preview copy 且保留消息正文", async () => {
    const copy = await buildEnglishActivityPreviewCopy();
    const detail = {
      id: "child-1",
      created_at: 0,
      updated_at: 0,
      items: [],
      messages: [
        {
          id: "message-1",
          role: "assistant",
          timestamp: 1,
          content: [
            {
              type: "tool_response",
              id: "tool-1",
              success: true,
              output: "页面结构差异已提取完成。",
            },
          ],
        },
      ],
    } satisfies AsterSessionDetail;

    const snapshot = extractSessionActivitySnapshot(detail, 3, { copy });

    expect(snapshot.preview).toBe("Output: 页面结构差异已提取完成。");
    expect(snapshot.entries[0]).toMatchObject({
      title: "Output",
      detail: "页面结构差异已提取完成。",
      statusLabel: "Message",
    });
  });

  it("preview sync key 应稳定编码 fingerprint 与 refreshVersion", () => {
    const syncKey = buildPreviewableRailSessionsSyncKey({
      sessions: [
        {
          id: "child-1",
          sessionType: "sub_agent",
          runtimeStatus: "running",
          latestTurnStatus: "running",
        },
        {
          id: "child-2",
          sessionType: "sub_agent",
          runtimeStatus: "queued",
          latestTurnStatus: "queued",
        },
      ],
      activityRefreshVersionBySessionId: {
        "child-1": 1,
        "child-2": 3,
      },
    });

    expect(syncKey).toBe(
      "child-1:child-1:0:running:running:0:1|child-2:child-2:0:queued:queued:0:3",
    );
  });

  it("stale target 只应返回 fingerprint 或 refreshVersion 已过期的会话", () => {
    const previewBySessionId: Record<string, SessionActivityPreviewState> = {
      "child-1": {
        preview: "最新",
        entries: [],
        status: "ready",
        fingerprint: "child-1:0:running:running:0",
        refreshVersion: 1,
      },
      "child-2": {
        preview: "旧的",
        entries: [],
        status: "ready",
        fingerprint: "child-2:0:queued:queued:0",
        refreshVersion: 0,
      },
    };

    const staleTargets = collectStaleSessionActivityTargets({
      sessions: [
        {
          id: "child-1",
          sessionType: "sub_agent",
          runtimeStatus: "running",
          latestTurnStatus: "running",
        },
        {
          id: "child-2",
          sessionType: "sub_agent",
          runtimeStatus: "queued",
          latestTurnStatus: "queued",
        },
        {
          id: "child-3",
          sessionType: "sub_agent",
          runtimeStatus: "completed",
          latestTurnStatus: "completed",
        },
      ],
      previewBySessionId,
      activityRefreshVersionBySessionId: {
        "child-1": 1,
        "child-2": 2,
        "child-3": 0,
      },
    });

    expect(staleTargets).toEqual([
      {
        sessionId: "child-2",
        fingerprint: "child-2:0:queued:queued:0",
        refreshVersion: 2,
      },
      {
        sessionId: "child-3",
        fingerprint: "child-3:0:completed:completed:0",
        refreshVersion: 0,
      },
    ]);
  });
});
