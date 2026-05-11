import type { Editor, Range } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeLimeLocale } from "@/i18n/createI18n";
import { createExtensions } from "./extensions";
import {
  createSlashCommandItems,
  filterSlashCommandItems,
} from "./slashCommandItems";

function createChainApi() {
  const chainApi = {
    focus: vi.fn(),
    deleteRange: vi.fn(),
    setImage: vi.fn(),
    run: vi.fn(() => true),
  };
  chainApi.focus.mockReturnValue(chainApi);
  chainApi.deleteRange.mockReturnValue(chainApi);
  chainApi.setImage.mockReturnValue(chainApi);
  return chainApi;
}

describe("Document SlashCommand i18n", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("英文 locale 下命令项与图片 URL prompt 应来自 workspace namespace", async () => {
    await changeLimeLocale("en-US");

    const items = createSlashCommandItems();
    expect(items.map((item) => item.title)).toContain("Heading 1");
    expect(items.map((item) => item.title)).toContain("Image");
    expect(
      items.find((item) => item.id === "image")?.description,
    ).toBe("Insert an image link");

    expect(filterSlashCommandItems("photo").map((item) => item.id)).toEqual([
      "image",
    ]);

    const prompt = vi
      .spyOn(window, "prompt")
      .mockReturnValue("https://img.test/a.png");
    const chainApi = createChainApi();
    const editor = { chain: vi.fn(() => chainApi) } as unknown as Editor;
    const range = { from: 1, to: 2 } as Range;

    items.find((item) => item.id === "image")?.command({ editor, range });

    expect(prompt).toHaveBeenCalledWith("Enter image URL");
    expect(chainApi.setImage).toHaveBeenCalledWith({
      src: "https://img.test/a.png",
    });
  });

  it("编辑器 placeholder 应由调用方注入，避免扩展内硬编码中文", () => {
    const extensions = createExtensions({
      onStateChange: vi.fn(),
      onKeyDownRef: { current: null },
      placeholder: "Type content, press / to open the command menu...",
    });
    const placeholderExtension = extensions.find(
      (extension) => extension.name === "placeholder",
    ) as { options: { placeholder: string } } | undefined;

    expect(placeholderExtension?.options.placeholder).toBe(
      "Type content, press / to open the command menu...",
    );
  });
});
