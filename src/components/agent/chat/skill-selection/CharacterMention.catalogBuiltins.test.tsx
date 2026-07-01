import { describe, expect, it } from "vitest";
import {
  findButtonContaining,
  getTextarea,
  renderHarness,
  typeMentionAndWait,
} from "./CharacterMention.testFixtures";

describe("CharacterMention mention built-in commands", () => {
  it("输入 @网 时应展示新的内建网页命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@网");

    expect(document.body.textContent).toContain("生成 / 表达");
    expect(document.body.textContent).toContain("@网页");
  });

  it("输入 @P 时应展示新的内建 PPT 命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@P");

    expect(document.body.textContent).toContain("生成 / 表达");
    expect(document.body.textContent).toContain("@PPT");
  });

  it("输入 @表 时应展示新的内建表单命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@表");

    expect(document.body.textContent).toContain("生成 / 表达");
    expect(document.body.textContent).toContain("@表单");
  });

  it("输入 @代 时应展示新的内建代码命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@代");

    expect(document.body.textContent).toContain("浏览器 / 编排");
    expect(document.body.textContent).toContain("@代码");
  });

  it("输入 @发 时应展示新的内建发布命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@发");

    expect(document.body.textContent).toContain("预览 / 发布");
    expect(document.body.textContent).toContain("@发布");
  });

  it("输入 @配 时应同时展示配图与配音命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@配");

    expect(document.body.textContent).toContain("生成 / 表达");
    expect(document.body.textContent).toContain("媒体转换");
    expect(document.body.textContent).toContain("@配图");
    expect(document.body.textContent).toContain("@配音");
  });

  it("输入完整 @配图 时仍应展示配图命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@配图");

    const commandButton = findButtonContaining("@配图");
    const commandRoot = document.body.querySelector(
      '[data-testid="mention-command-root"]',
    );
    expect(document.body.textContent).toContain("生成 / 表达");
    expect(commandRoot?.getAttribute("data-should-filter")).toBe("false");
    expect(commandButton).toBeTruthy();
    expect(commandButton?.hidden).toBe(false);
    expect(commandButton?.disabled).toBe(false);
  });

  it("输入 @海 时应展示新的海报命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@海");

    expect(document.body.textContent).toContain("生成 / 表达");
    expect(document.body.textContent).toContain("@海报");
  });

  it("输入 @渠 时应展示新的渠道预览命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@渠");

    expect(document.body.textContent).toContain("预览 / 发布");
    expect(document.body.textContent).toContain("@渠道预览");
  });

  it("输入 @上 时应展示新的上传命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@上");

    expect(document.body.textContent).toContain("预览 / 发布");
    expect(document.body.textContent).toContain("@上传");
  });

  it("输入 @合 时应展示新的发布合规命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@合");

    expect(document.body.textContent).toContain("预览 / 发布");
    expect(document.body.textContent).toContain("@发布合规");
  });

  it("输入 @浏 时应展示新的内建浏览器命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@浏");

    expect(document.body.textContent).toContain("浏览器 / 编排");
    expect(document.body.textContent).toContain("@浏览器");
  });

  it("输入 @竞 时应展示新的竞品命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@竞");

    expect(document.body.textContent).toContain("搜索 / 读取");
    expect(document.body.textContent).toContain("@竞品");
  });

  it("输入 @抓 时应展示新的网页抓取命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@抓");

    expect(document.body.textContent).toContain("搜索 / 读取");
    expect(document.body.textContent).toContain("@抓取");
  });

  it("输入 @网页读 时应展示新的网页读取命令", async () => {
    const container = renderHarness();
    const textarea = getTextarea(container);

    await typeMentionAndWait(textarea, "@网页读");

    expect(document.body.textContent).toContain("搜索 / 读取");
    expect(document.body.textContent).toContain("@网页读取");
  });
});
