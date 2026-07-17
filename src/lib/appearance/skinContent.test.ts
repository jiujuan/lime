import { describe, expect, it } from "vitest";
import { LIME_COLOR_SCHEMES } from "./colorSchemes";
import { getLimeSkinCopy } from "./skinContent";

describe("skinContent", () => {
  it("为每套皮肤覆盖所有支持的界面语言", () => {
    const locales = ["zh-CN", "zh-TW", "en-US", "ja-JP", "ko-KR"];

    for (const scheme of LIME_COLOR_SCHEMES) {
      for (const locale of locales) {
        const copy = getLimeSkinCopy(scheme.id, locale);
        expect(copy.brandSubtitle).toBeTruthy();
        expect(copy.tagline).toBeTruthy();
        expect(copy.eyebrow).toBeTruthy();
        expect(copy.slogan).toBeTruthy();
        expect(copy.description).toBeTruthy();
        expect(copy.status).toBeTruthy();
      }
    }
  });

  it("财神主题提供与画面一致的俏皮工作台文案", () => {
    const copy = getLimeSkinCopy("lime-forest", "zh-CN");

    expect(copy.brandSubtitle).toContain("财神");
    expect(copy.eyebrow).toBe("财神打工版");
    expect(copy.slogan).toContain("财神");
    expect(copy.status).toContain("财运");
  });

  it("未知皮肤和语言会稳定回落", () => {
    expect(getLimeSkinCopy("unknown", "unknown").slogan).toBe(
      "青柠一下，灵感即来",
    );
  });
});
