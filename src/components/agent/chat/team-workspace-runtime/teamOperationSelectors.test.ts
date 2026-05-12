import { beforeEach, describe, expect, it } from "vitest";
import { changeLimeLocale, getLimeI18n } from "@/i18n/createI18n";
import {
  buildTeamWorkspaceOperationCopy,
  buildTeamOperationDisplayEntries,
  buildVisibleTeamOperationState,
  formatOperationUpdatedAt,
  type TeamWorkspaceOperationCopy,
  type TeamWorkspaceOperationTranslate,
} from "./teamOperationSelectors";

describe("teamOperationSelectors", () => {
  let operationCopy: TeamWorkspaceOperationCopy;

  beforeEach(async () => {
    await changeLimeLocale("en-US");
    const translate: TeamWorkspaceOperationTranslate = (key, options) =>
      String(
        getLimeI18n().t(
          key as never,
          {
            ns: "agent",
            ...(options ?? {}),
          } as never,
        ),
      );
    operationCopy = buildTeamWorkspaceOperationCopy({
      locale: "en-US",
      translate,
    });
  });

  it("wait 命中结果时应生成聚合结果条目", () => {
    const entries = buildTeamOperationDisplayEntries({
      copy: operationCopy,
      sessionNameById: new Map([
        ["child-1", "研究员"],
        ["child-2", "执行器"],
      ]),
      teamWaitSummary: {
        awaitedSessionIds: ["child-1", "child-2"],
        timedOut: false,
        resolvedSessionId: "child-2",
        resolvedStatus: "completed",
        updatedAt: 1_710_000_100_000,
      },
    });

    expect(entries).toEqual([
      {
        id: "wait-1710000100000",
        title: "Result received",
        detail:
          "Just received new results from 执行器; current status is Completed.",
        badgeClassName:
          "border border-emerald-200 bg-emerald-50 text-emerald-700",
        updatedAt: 1_710_000_100_000,
        targetSessionId: "child-2",
      },
    ]);
  });

  it("control 汇总应按 action 生成稳定标题与文案", () => {
    const entries = buildTeamOperationDisplayEntries({
      copy: operationCopy,
      sessionNameById: new Map([["child-1", "研究员"]]),
      teamControlSummary: {
        action: "close",
        requestedSessionIds: ["child-1"],
        cascadeSessionIds: [],
        affectedSessionIds: ["child-1"],
        updatedAt: 1_710_000_200_000,
      },
    });

    expect(entries).toEqual([
      {
        id: "control-close-1710000200000",
        title: "Pause work",
        detail: "Just paused 研究员.",
        badgeClassName: "border border-slate-200 bg-slate-100 text-slate-700",
        updatedAt: 1_710_000_200_000,
        targetSessionId: "child-1",
      },
    ]);
  });

  it("应按更新时间倒序排序，并提供操作时间文案格式化", () => {
    const entries = buildTeamOperationDisplayEntries({
      copy: operationCopy,
      sessionNameById: new Map([["child-1", "研究员"]]),
      teamWaitSummary: {
        awaitedSessionIds: ["child-1"],
        timedOut: true,
        updatedAt: 1_710_000_100_000,
      },
      teamControlSummary: {
        action: "resume",
        requestedSessionIds: ["child-1"],
        cascadeSessionIds: [],
        affectedSessionIds: ["child-1"],
        updatedAt: 1_710_000_200_000,
      },
    });

    expect(entries.map((entry) => entry.id)).toEqual([
      "control-resume-1710000200000",
      "wait-1710000100000",
    ]);
    expect(entries[0]?.detail).toBe("Just resumed 研究员.");
    expect(entries[1]?.detail).toBe(
      "The wait for results just timed out; 1 task(s) are still running.",
    );
    expect(
      formatOperationUpdatedAt(undefined, {
        locale: "en-US",
        nowLabel: "just now",
      }),
    ).toBe("just now");
    expect(
      formatOperationUpdatedAt(1_710_000_100_000, {
        locale: "en-US",
        now: 1_710_000_100_030,
        nowLabel: "just now",
      }),
    ).toBe("just now");
  });

  it("应只保留当前画布可见的 team operation 条目", () => {
    const state = buildVisibleTeamOperationState({
      copy: operationCopy,
      railSessions: [{ id: "child-1", name: "研究员" }],
      teamWaitSummary: {
        awaitedSessionIds: ["child-1"],
        timedOut: false,
        resolvedSessionId: "child-2",
        resolvedStatus: "completed",
        updatedAt: 1_710_000_100_000,
      },
      teamControlSummary: {
        action: "close",
        requestedSessionIds: ["child-2"],
        cascadeSessionIds: [],
        affectedSessionIds: ["child-1"],
        updatedAt: 1_710_000_200_000,
      },
    });

    expect(state.visibleTeamWaitSummary?.resolvedSessionId).toBe("child-2");
    expect(state.visibleTeamControlSummary?.affectedSessionIds).toEqual([
      "child-1",
    ]);
    expect(state.entries).toEqual([
      {
        id: "control-close-1710000200000",
        title: "Pause work",
        detail: "Just paused 研究员.",
        badgeClassName: "border border-slate-200 bg-slate-100 text-slate-700",
        updatedAt: 1_710_000_200_000,
        targetSessionId: "child-1",
      },
    ]);
  });

  it("未命中当前画布 session 时应隐藏 team operation 摘要", () => {
    const state = buildVisibleTeamOperationState({
      copy: operationCopy,
      railSessions: [{ id: "child-1", name: "研究员" }],
      teamWaitSummary: {
        awaitedSessionIds: ["child-2"],
        timedOut: true,
        updatedAt: 1_710_000_100_000,
      },
      teamControlSummary: {
        action: "resume",
        requestedSessionIds: ["child-2"],
        cascadeSessionIds: [],
        affectedSessionIds: ["child-2"],
        updatedAt: 1_710_000_200_000,
      },
    });

    expect(state.visibleTeamWaitSummary).toBeNull();
    expect(state.visibleTeamControlSummary).toBeNull();
    expect(state.entries).toEqual([]);
  });
});
