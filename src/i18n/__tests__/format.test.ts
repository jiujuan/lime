import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatList,
  formatNumber,
  formatRelativeTime,
  localeCompare,
  resolveFormatLocale,
} from "../format";

describe("i18n format helpers", () => {
  it("应把传入 locale 归一到受支持 locale", () => {
    expect(resolveFormatLocale("en-GB")).toBe("en-US");
    expect(resolveFormatLocale("zh-Hant")).toBe("zh-TW");
    expect(resolveFormatLocale("unknown")).toBe("zh-CN");
  });

  it("应按 locale 格式化日期、数字、相对时间和列表", () => {
    const date = Date.UTC(2026, 0, 2, 0, 0, 0);

    expect(
      formatDate(date, {
        day: "2-digit",
        locale: "en-US",
        month: "2-digit",
        timeZone: "UTC",
        year: "numeric",
      }),
    ).toBe("01/02/2026");
    expect(formatNumber(1234.5, { locale: "en-US" })).toBe("1,234.5");
    expect(
      formatRelativeTime(-1, "day", { locale: "en-US", numeric: "auto" }),
    ).toBe("yesterday");
    expect(formatList(["Alpha", "Beta"], { locale: "en-US" })).toBe(
      "Alpha and Beta",
    );
  });

  it("应对无效日期返回空字符串，并提供 localeCompare 封装", () => {
    expect(formatDate("not-a-date", { locale: "en-US" })).toBe("");
    expect(localeCompare("b", "a", { locale: "en-US" })).toBeGreaterThan(0);
  });
});
