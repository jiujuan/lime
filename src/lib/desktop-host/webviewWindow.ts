import { MockWindow, type WindowOptions, getCurrentWindow } from "./window";

type WebviewWindowOptions = WindowOptions & {
  url?: string;
  center?: boolean;
  focus?: boolean;
};

const windows = new Map<string, WebviewWindow>();

function isTestEnvironment(): boolean {
  return Boolean(import.meta.env?.MODE === "test" || import.meta.env?.VITEST);
}

function assertTestWebviewWindowFixture(): void {
  if (isTestEnvironment()) {
    return;
  }
  throw new Error(
    "[Mock] WebviewWindow 只能在测试环境使用；生产独立窗口必须进入 Electron Desktop Host IPC。",
  );
}

export class WebviewWindow extends MockWindow {
  readonly url?: string;

  constructor(label: string, options: WebviewWindowOptions = {}) {
    assertTestWebviewWindowFixture();
    super(label, options);
    this.url = options.url;
    windows.set(label, this);
    queueMicrotask(() => {
      void this.emit("desktop-host://created");
    });
  }

  static async getByLabel(label: string): Promise<WebviewWindow | null> {
    return windows.get(label) ?? null;
  }

  async once(event: string, handler: () => void): Promise<() => void> {
    if (event === "desktop-host://created") {
      queueMicrotask(handler);
      return () => undefined;
    }
    return super.listen(event, handler);
  }
}

export function getCurrentWebviewWindow(): MockWindow {
  return getCurrentWindow();
}
