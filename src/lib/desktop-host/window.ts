import { emit } from "./event";
import {
  getElectronHostBridge,
  type ElectronHostWindowBridge,
} from "@/lib/electron-host";

export interface WindowOptions {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  x?: number;
  y?: number;
  title?: string;
  visible?: boolean;
  resizable?: boolean;
  decorations?: boolean;
  alwaysOnTop?: boolean;
  skipTaskbar?: boolean;
  fullscreen?: boolean;
  maximized?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
  closable?: boolean;
  center?: boolean;
}

type WindowBridgeMethod = keyof ElectronHostWindowBridge;

const shouldLogMockWindowInfo = import.meta.env.MODE !== "test";

function isTestEnvironment(): boolean {
  return Boolean(import.meta.env?.MODE === "test" || import.meta.env?.VITEST);
}

function assertTestWindowFixture(apiName: string): void {
  if (isTestEnvironment()) {
    return;
  }
  throw new Error(
    `[Mock] ${apiName} 只能在测试环境使用；生产窗口能力必须进入 Electron Desktop Host IPC。`,
  );
}

function logMockWindowInfo(...args: Parameters<typeof console.log>): void {
  if (!shouldLogMockWindowInfo) {
    return;
  }
  console.log(...args);
}

function resolveWindowBridge(
  apiName: string,
  methodName?: WindowBridgeMethod,
): ElectronHostWindowBridge | null {
  const bridge = getElectronHostBridge()?.window;
  if (bridge && (!methodName || typeof bridge[methodName] === "function")) {
    return bridge;
  }

  assertTestWindowFixture(apiName);
  return null;
}

export class MockWindow {
  label: string;
  options: WindowOptions;

  constructor(label: string, options: WindowOptions = {}) {
    this.label = label;
    this.options = options;
  }

  async emit(event: string, payload?: any): Promise<void> {
    return emit(event, payload);
  }

  async listen(event: string, handler: any): Promise<() => void> {
    const { listen } = await import("./event");
    return listen(event, handler);
  }

  async show(): Promise<void> {
    const bridge = resolveWindowBridge("window.show", "show");
    if (bridge) {
      return bridge.show();
    }
    logMockWindowInfo(`[Mock] Window ${this.label} show`);
    this.options.visible = true;
  }

  async hide(): Promise<void> {
    const bridge = resolveWindowBridge("window.hide", "hide");
    if (bridge) {
      return bridge.hide();
    }
    logMockWindowInfo(`[Mock] Window ${this.label} hide`);
    this.options.visible = false;
  }

  async close(): Promise<void> {
    const bridge = resolveWindowBridge("window.close", "close");
    if (bridge) {
      return bridge.close();
    }
    logMockWindowInfo(`[Mock] Window ${this.label} close`);
  }

  async minimize(): Promise<void> {
    const bridge = resolveWindowBridge("window.minimize", "minimize");
    if (bridge) {
      return bridge.minimize();
    }
    logMockWindowInfo(`[Mock] Window ${this.label} minimize`);
  }

  async maximize(): Promise<void> {
    const bridge = resolveWindowBridge("window.maximize", "maximize");
    if (bridge) {
      return bridge.maximize();
    }
    logMockWindowInfo(`[Mock] Window ${this.label} maximize`);
    this.options.maximized = true;
  }

  async unmaximize(): Promise<void> {
    const bridge = resolveWindowBridge("window.unmaximize", "unmaximize");
    if (bridge) {
      return bridge.unmaximize();
    }
    logMockWindowInfo(`[Mock] Window ${this.label} unmaximize`);
    this.options.maximized = false;
  }

  async center(): Promise<void> {
    const bridge = resolveWindowBridge("window.center", "center");
    if (bridge) {
      return bridge.center();
    }
    logMockWindowInfo(`[Mock] Window ${this.label} center`);
  }

  async setFocus(): Promise<void> {
    const bridge = resolveWindowBridge("window.setFocus", "setFocus");
    if (bridge) {
      return bridge.setFocus();
    }
    logMockWindowInfo(`[Mock] Window ${this.label} setFocus`);
  }

  async startDragging(): Promise<void> {
    const bridge = resolveWindowBridge("window.startDragging", "startDragging");
    if (bridge) {
      return bridge.startDragging();
    }
    logMockWindowInfo(`[Mock] Window ${this.label} startDragging`);
  }

  async setTitle(title: string): Promise<void> {
    const bridge = resolveWindowBridge("window.setTitle", "setTitle");
    if (bridge) {
      return bridge.setTitle(title);
    }
    logMockWindowInfo(`[Mock] Window ${this.label} setTitle: ${title}`);
    this.options.title = title;
  }

  async resize(width: number, height: number): Promise<void> {
    const bridge = resolveWindowBridge("window.resize", "setSize");
    if (bridge) {
      return bridge.setSize(width, height);
    }
    logMockWindowInfo(`[Mock] Window ${this.label} resize: ${width}x${height}`);
    this.options.width = width;
    this.options.height = height;
  }

  async setPosition(x: number, y: number): Promise<void> {
    const bridge = resolveWindowBridge("window.setPosition", "setPosition");
    if (bridge) {
      return bridge.setPosition(x, y);
    }
    logMockWindowInfo(`[Mock] Window ${this.label} setPosition: ${x},${y}`);
    this.options.x = x;
    this.options.y = y;
  }

  async isVisible(): Promise<boolean> {
    const bridge = resolveWindowBridge("window.isVisible", "isVisible");
    if (bridge) {
      return bridge.isVisible();
    }
    return this.options.visible ?? true;
  }

  async isMaximized(): Promise<boolean> {
    const bridge = resolveWindowBridge("window.isMaximized", "isMaximized");
    if (bridge) {
      return bridge.isMaximized();
    }
    return this.options.maximized ?? false;
  }

  async isFullscreen(): Promise<boolean> {
    const bridge = resolveWindowBridge("window.isFullscreen", "isFullscreen");
    if (bridge) {
      return bridge.isFullscreen();
    }
    return this.options.fullscreen ?? false;
  }

  async isDecorated(): Promise<boolean> {
    const bridge = resolveWindowBridge("window.isDecorated", "isDecorated");
    if (bridge) {
      return bridge.isDecorated();
    }
    return this.options.decorations ?? true;
  }

  async isResizable(): Promise<boolean> {
    const bridge = resolveWindowBridge("window.isResizable", "isResizable");
    if (bridge) {
      return bridge.isResizable();
    }
    return this.options.resizable ?? true;
  }

  async onFocusChanged(
    _handler: (focused: boolean) => void,
  ): Promise<() => void> {
    assertTestWindowFixture("window.onFocusChanged");
    logMockWindowInfo(`[Mock] Window ${this.label} onFocusChanged`);
    return () => {};
  }

  async onScaleChanged(_handler: (scale: number) => void): Promise<() => void> {
    assertTestWindowFixture("window.onScaleChanged");
    logMockWindowInfo(`[Mock] Window ${this.label} onScaleChanged`);
    return () => {};
  }

  async onThemeChanged(_handler: (theme: string) => void): Promise<() => void> {
    assertTestWindowFixture("window.onThemeChanged");
    logMockWindowInfo(`[Mock] Window ${this.label} onThemeChanged`);
    return () => {};
  }
}

// 当前窗口实例
let currentWindow: MockWindow | null = null;

export function getCurrentWindow(): MockWindow {
  if (!currentWindow) {
    currentWindow = new MockWindow("main", { visible: true });
  }
  return currentWindow;
}

export function getAllWindows(): MockWindow[] {
  return [getCurrentWindow()];
}

export async function getCurrentWindowLabel(): Promise<string> {
  return getCurrentWindow().label;
}

// 导出常用函数
export const appWindow = getCurrentWindow();
