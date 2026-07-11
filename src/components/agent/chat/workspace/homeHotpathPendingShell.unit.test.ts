import { afterEach, describe, expect, it, vi } from "vitest";
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

function installAnimationFrameQueue() {
  let nextFrameId = 1;
  const callbacks = new Map<
    number,
    Parameters<typeof window.requestAnimationFrame>[0]
  >();
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextFrameId;
    nextFrameId += 1;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });

  return {
    flushFrame() {
      const pendingCallbacks = Array.from(callbacks.entries());
      callbacks.clear();
      pendingCallbacks.forEach(([, callback]) => {
        callback(performance.now());
      });
    },
  };
}

describe("homeHotpathPendingShell", () => {
  afterEach(() => {
    clearHomeHotpathPendingShell({ restoreHome: true });
    document.body.innerHTML = "";
    vi.restoreAllMocks();
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
    expect(
      document.querySelector<HTMLElement>(
        '[data-home-hotpath-pending-shell="true"]',
      )?.style.width,
    ).toBe("100vw");
    expect(
      document.querySelector<HTMLElement>(
        '[data-home-hotpath-pending-shell="true"]',
      )?.style.height,
    ).toBe("100vh");
    expect(
      document.querySelector('[data-testid="message-turn-group"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-message-role="user"]')?.textContent,
    ).toBe("你好");
    expect(readVisibleText(document.body)).not.toContain("青柠一下，灵感即来");
    expect(readVisibleText(document.body)).not.toContain(
      "你可以从这些任务开始",
    );
  });

  it("真实消息列表空壳先挂载时不应提前移除 pending 壳", () => {
    renderHomeSurface();

    applyHomeHotpathPendingShell({
      requestId: "draft-send-empty-frame",
      text: "你好",
    });

    const emptyFrame = document.createElement("div");
    emptyFrame.setAttribute("data-testid", "message-list-frame");
    document.body.appendChild(emptyFrame);

    expect(
      document.querySelector('[data-home-hotpath-pending-shell="true"]'),
    ).not.toBeNull();
    expect(
      document.querySelector<HTMLElement>('[data-testid="empty-state-root"]')
        ?.style.display,
    ).toBe("none");
  });

  it("真实消息组出现后才移除 pending 壳且不恢复首页首屏", () => {
    const animationFrames = installAnimationFrameQueue();
    renderHomeSurface();

    const shell = applyHomeHotpathPendingShell({
      requestId: "draft-send-real-message",
      text: "你好",
    });

    const frame = document.createElement("div");
    frame.setAttribute("data-testid", "message-list-frame");
    const group = document.createElement("section");
    group.setAttribute("data-testid", "message-turn-group");
    const userMessage = document.createElement("div");
    userMessage.setAttribute("data-message-role", "user");
    userMessage.textContent = "你好";
    group.appendChild(userMessage);
    frame.appendChild(group);
    document.body.appendChild(frame);
    shell.refresh();

    expect(
      document.querySelector('[data-home-hotpath-pending-shell="true"]'),
    ).not.toBeNull();

    animationFrames.flushFrame();
    expect(
      document.querySelector('[data-home-hotpath-pending-shell="true"]'),
    ).not.toBeNull();

    animationFrames.flushFrame();
    expect(
      document.querySelector('[data-home-hotpath-pending-shell="true"]'),
    ).toBeNull();
    expect(
      document.querySelector<HTMLElement>('[data-testid="empty-state-root"]')
        ?.style.display,
    ).toBe("none");
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
