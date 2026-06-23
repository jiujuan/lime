import { describe, expect, it } from "vitest";

import { normalizeProcessDisplayText } from "./processDisplayText";

describe("normalizeProcessDisplayText", () => {
  it("只规范换行、连续空行和首尾空白", () => {
    const input = "\r\n  第一行\r\n\r\n\r\n第二行  \r\n";

    expect(normalizeProcessDisplayText(input)).toBe("第一行\n\n第二行");
  });

  it("不再压平被切碎的过程性 prose 文本", () => {
    const input = ["目录", "", "也", "", "不存在。"].join("\n");

    expect(normalizeProcessDisplayText(input)).toBe("目录\n\n也\n\n不存在。");
  });

  it("不再识别或改写 markdown 列表结构", () => {
    const input = ["先确认当前状态", "- 再检查目录", "- 最后补回退说明"].join(
      "\n",
    );

    expect(normalizeProcessDisplayText(input)).toBe(input);
  });
});
