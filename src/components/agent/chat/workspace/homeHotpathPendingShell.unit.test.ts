import { afterEach, describe, expect, it } from "vitest";
import {
  applyHomeHotpathPendingShell,
  clearHomeHotpathPendingShell,
} from "./homeHotpathPendingShell";

function renderHomeSurface() {
  document.body.innerHTML = `
    <main style="width: 960px; height: 640px;">
      <div data-testid="empty-state-root">
        <div data-testid="empty-state-first-screen">
          <h1>青柠一下，灵感即来</h1>
        </div>
        <section data-testid="home-second-screen">你可以从这些任务开始</section>
      </div>
    </main>
  `;
}

function readVisibleText(root: HTMLElement): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    const parent = textNode.parentElement;
    if (!parent || parent.closest('[style*="display: none"]')) {
      continue;
    }
    parts.push(textNode.textContent || "");
  }
  return parts.join(" ");
}

describe("homeHotpathPendingShell", () => {
  afterEach(() => {
    clearHomeHotpathPendingShell({ restoreHome: true });
    document.body.innerHTML = "";
  });

  it("首页首发提交后应同步隐藏首页并插入用户消息壳", () => {
    renderHomeSurface();

    applyHomeHotpathPendingShell({
      requestId: "draft-send-test",
      text: "你好",
    });

    expect(
      document.querySelector('[data-testid="empty-state-first-screen"]'),
    ).toBeNull();
    expect(
      document.querySelector<HTMLElement>('[data-testid="empty-state-root"]')
        ?.style.display,
    ).toBe("none");
    expect(document.querySelector('[data-testid="message-list-frame"]')).toBe(
      document.querySelector('[data-home-hotpath-pending-shell="true"]'),
    );
    expect(document.querySelector('[data-testid="message-turn-group"]')).not
      .toBeNull();
    expect(
      document.querySelector('[data-message-role="user"]')?.textContent,
    ).toBe("你好");
    expect(readVisibleText(document.body)).not.toContain(
      "青柠一下，灵感即来",
    );
    expect(readVisibleText(document.body)).not.toContain(
      "你可以从这些任务开始",
    );
  });

  it("发送失败时应恢复首页首屏", () => {
    renderHomeSurface();
    const shell = applyHomeHotpathPendingShell({
      requestId: "draft-send-failed",
      text: "失败恢复",
    });

    shell.clear(true);

    expect(
      document.querySelector('[data-testid="empty-state-first-screen"]'),
    ).not.toBeNull();
    expect(
      document.querySelector<HTMLElement>('[data-testid="empty-state-root"]')
        ?.style.display,
    ).toBe("");
    expect(
      document.querySelector('[data-home-hotpath-pending-shell="true"]'),
    ).toBeNull();
  });
});
