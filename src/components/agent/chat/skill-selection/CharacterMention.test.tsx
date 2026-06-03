import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import type { InputCapabilitySelection } from "./inputCapabilitySelection";
import {
  createCharacter,
  findButtonContaining,
  getButtonsContaining,
  getMentionPopoverContent,
  getTextarea,
  renderHarness,
  typeAtAndWait,
  typeMentionAndWait,
} from "./CharacterMention.testFixtures";
import { recordMentionEntryUsage } from "./mentionEntryUsage";

describe("CharacterMention mention basics", () => {
  it("输入 @ 当次应弹出提及面板（不依赖受控 value 同步）", async () => {
    const container = renderHarness({
      characters: [createCharacter("测试角色")],
      syncValue: false,
    });
    const textarea = getTextarea(container);

    await typeAtAndWait(textarea);

    expect(document.body.textContent).toContain("测试角色");
  });

  it("关闭输入自动补全后不应再弹出现有提及面板", async () => {
    const container = renderHarness({
      characters: [createCharacter("测试角色")],
      inputCompletionEnabled: false,
    });
    const textarea = getTextarea(container);

    await typeAtAndWait(textarea);

    expect(getMentionPopoverContent()).toBeNull();
    expect(document.body.textContent).not.toContain("测试角色");
  });

  it("无角色和技能时仍应显示内建图片命令", async () => {
    const container = renderHarness({
      characters: [],
      skills: [],
    });
    const textarea = getTextarea(container);

    await typeAtAndWait(textarea);

    expect(document.body.textContent).toContain("统一调用注册表");
    expect(document.body.textContent).toContain("先调命令，再补 Skill");
    expect(document.body.textContent).toContain("生成 / 表达");
    expect(document.body.textContent).toContain("搜索 / 读取");
    expect(document.body.textContent).toContain("浏览器 / 编排");
    expect(document.body.textContent).toContain("@配图");
    expect(document.body.textContent).toContain("@封面");
    expect(document.body.textContent).toContain("@海报");
    expect(document.body.textContent).toContain("@修图");
    expect(document.body.textContent).toContain("@重绘");
    expect(document.body.textContent).toContain("@视频");
    expect(document.body.textContent).toContain("@配音");
    expect(document.body.textContent).toContain("@播报");
    expect(document.body.textContent).toContain("@素材");
    expect(document.body.textContent).toContain("@研报");
    expect(document.body.textContent).toContain("@竞品");
    expect(document.body.textContent).toContain("@读PDF");
    expect(document.body.textContent).toContain("@转写");
    expect(document.body.textContent).toContain("@链接解析");
    expect(document.body.textContent).toContain("@浏览器");
  });

  it("提供 onSelectInputCapability 时，选择配图命令应走统一 capability 回调", async () => {
    const onChangeSpy = vi.fn<(value: string) => void>();
    const onSelectInputCapability =
      vi.fn<
        (
          capability: InputCapabilitySelection,
          options?: { replayText?: string },
        ) => void
      >();
    const container = renderHarness({
      onChangeSpy,
      onSelectInputCapability,
    });
    const textarea = getTextarea(container);

    await typeAtAndWait(textarea);

    const builtinButton = findButtonContaining("@配图");
    expect(builtinButton).toBeTruthy();

    act(() => {
      builtinButton?.click();
    });

    expect(onSelectInputCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "builtin_command",
        command: expect.objectContaining({
          key: "image_generate",
          commandPrefix: "@配图",
        }),
      }),
      undefined,
    );
    expect(onChangeSpy).toHaveBeenLastCalledWith("");
  });

  it("@ 空查询时应先显示命令注册表，最近调用只作为续跑入口", async () => {
    act(() => {
      recordMentionEntryUsage({
        kind: "builtin_command",
        entryId: "research",
        usedAt: 1_712_345_678_900,
      });
    });

    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeAtAndWait(textarea);

    expect(document.body.textContent).toContain("最近调用");
    const bodyText = document.body.textContent ?? "";
    expect(bodyText.indexOf("搜索 / 读取")).toBeLessThan(
      bodyText.indexOf("最近调用"),
    );

    const recentCommandButtons = getButtonsContaining("@搜索");
    expect(recentCommandButtons).toHaveLength(2);
  });

  it("@ 面板打开后新增内建命令 recent usage 时，应即时刷新最近调用分组", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeAtAndWait(textarea);

    expect(document.body.textContent).not.toContain("最近调用");

    await act(async () => {
      recordMentionEntryUsage({
        kind: "builtin_command",
        entryId: "research",
        usedAt: 1_712_345_678_901,
        replayText: "关键词:AI Agent 融资 站点:36Kr",
      });
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("最近调用");
    expect(document.body.textContent).toContain("@搜索");
    expect(document.body.textContent).toContain(
      "上次输入：关键词:AI Agent 融资",
    );
  });

  it("选择最近使用的 @命令时应回填上次成功草稿", async () => {
    const replayText = "关键词:AI Agent 融资 站点:36Kr";
    act(() => {
      recordMentionEntryUsage({
        kind: "builtin_command",
        entryId: "research",
        usedAt: 1_712_345_678_900,
        replayText,
      });
    });

    const onChangeSpy = vi.fn<(value: string) => void>();
    const onSelectInputCapability =
      vi.fn<
        (
          capability: InputCapabilitySelection,
          options?: { replayText?: string },
        ) => void
      >();
    const container = renderHarness({
      onChangeSpy,
      onSelectInputCapability,
    });
    const textarea = getTextarea(container);

    await typeAtAndWait(textarea);

    expect(document.body.textContent).toContain("上次输入：");
    expect(document.body.textContent).toContain("关键词:AI Agent 融资");

    const recentCommandButton = findButtonContaining("@搜索", "上次输入：");
    expect(recentCommandButton).toBeTruthy();

    act(() => {
      recentCommandButton?.click();
    });

    expect(onChangeSpy).toHaveBeenLastCalledWith(replayText);
    expect(onSelectInputCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "builtin_command",
        command: expect.objectContaining({
          key: "research",
        }),
      }),
      expect.objectContaining({
        replayText,
      }),
    );
  });

  it("普通 @命令搜索结果也应自动带入上次成功草稿", async () => {
    const replayText =
      "关键词:AI Agent 融资 站点:36Kr 时间:近30天 深度:深度 重点:融资额与产品发布 输出:要点";
    act(() => {
      recordMentionEntryUsage({
        kind: "builtin_command",
        entryId: "research",
        usedAt: 1_712_345_678_900,
        replayText,
      });
    });

    const onChangeSpy = vi.fn<(value: string) => void>();
    const onSelectInputCapability =
      vi.fn<
        (
          capability: InputCapabilitySelection,
          options?: { replayText?: string },
        ) => void
      >();
    const container = renderHarness({
      onChangeSpy,
      onSelectInputCapability,
    });
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@搜");

    expect(document.body.textContent).toContain("上次输入：");
    expect(document.body.textContent).toContain(
      "关键词:AI Agent 融资 站点:36Kr 时间:近30天",
    );

    const builtinButton = findButtonContaining("@搜索");
    expect(builtinButton).toBeTruthy();

    act(() => {
      builtinButton?.click();
    });

    expect(onChangeSpy).toHaveBeenLastCalledWith(replayText);
    expect(onSelectInputCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "builtin_command",
        command: expect.objectContaining({
          key: "research",
          commandPrefix: "@搜索",
        }),
      }),
      expect.objectContaining({
        replayText,
      }),
    );
  });

  it("普通 @命令搜索结果在只有 slotValues 时也应自动反推参数骨架", async () => {
    const replayText =
      "关键词:AI Agent 融资 站点:36Kr 时间:近30天 深度:深度 重点:融资额与产品发布 输出:要点";
    act(() => {
      recordMentionEntryUsage({
        kind: "builtin_command",
        entryId: "research",
        usedAt: 1_712_345_678_900,
        slotValues: {
          query: "AI Agent 融资",
          site: "36Kr",
          time_range: "近30天",
          depth: "deep",
          focus: "融资额与产品发布",
          output_format: "要点",
        },
      });
    });

    const onChangeSpy = vi.fn<(value: string) => void>();
    const onSelectInputCapability =
      vi.fn<
        (
          capability: InputCapabilitySelection,
          options?: { replayText?: string },
        ) => void
      >();
    const container = renderHarness({
      onChangeSpy,
      onSelectInputCapability,
    });
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@搜");

    expect(document.body.textContent).toContain("上次输入：");
    expect(document.body.textContent).toContain(
      "关键词:AI Agent 融资 站点:36Kr 时间:近30天",
    );

    const builtinButton = findButtonContaining("@搜索");
    expect(builtinButton).toBeTruthy();

    act(() => {
      builtinButton?.click();
    });

    expect(onChangeSpy).toHaveBeenLastCalledWith(replayText);
    expect(onSelectInputCapability).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "builtin_command",
        command: expect.objectContaining({
          key: "research",
          commandPrefix: "@搜索",
        }),
      }),
      expect.objectContaining({
        replayText,
      }),
    );
  });

  it("@ 搜索时不应显示最近调用，而应回到普通命令结果", async () => {
    act(() => {
      recordMentionEntryUsage({
        kind: "builtin_command",
        entryId: "research",
        usedAt: 1_712_345_678_900,
      });
    });

    const container = renderHarness();
    const textarea = getTextarea(container);

    await act(async () => {
      await import("./CharacterMentionPanel");
    });

    act(() => {
      textarea.focus();
      textarea.value = "@搜";
      textarea.setSelectionRange(2, 2);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain("最近调用");
    expect(document.body.textContent).toContain("搜索 / 读取");
    expect(document.body.textContent).toContain("@搜索");
  });
});
