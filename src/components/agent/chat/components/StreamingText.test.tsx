import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import "./StreamingRenderer.testMocks";
import { StreamingText } from "./StreamingText";

describe("StreamingText", () => {
  it("流式渲染应立即显示当前收到的完整文本", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const text =
      "这是一段已经收到的长文本，前端不应再只显示前十二个字符。";

    await act(async () => {
      root.render(<StreamingText text={text} isStreaming={true} />);
    });

    expect(container.textContent).toContain(text);

    await act(async () => {
      root.unmount();
    });
  });
});
