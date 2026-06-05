/**
 * Mock for @/lib/desktop-host/window
 */

import { emit } from "./event";
import { getElectronHostBridge } from "@/lib/electron-host";

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

export class MockWindow {
  label: string;
  options: WindowOptions;

  constructor(label: string, options: WindowOptions = {}) {
    this.label = label;
    this.options = options;
  }

  async emit(event: string, payload?: any): Promise<void> {
    console.log(`[Mock] Window ${this.label} emit: ${event}`, payload);
    return emit(event, payload);
  }

  async listen(event: string, handler: any): Promise<() => void> {
    console.log(`[Mock] Window ${this.label} listen: ${event}`);
    const { listen } = await import("./event");
    return listen(event, handler);
  }

  // 窗口控制方法
  async show(): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.show();
    }
    console.log(`[Mock] Window ${this.label} show`);
    this.options.visible = true;
  }

  async hide(): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.hide();
    }
    console.log(`[Mock] Window ${this.label} hide`);
    this.options.visible = false;
  }

  async close(): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.close();
    }
    console.log(`[Mock] Window ${this.label} close`);
  }

  async minimize(): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.minimize();
    }
    console.log(`[Mock] Window ${this.label} minimize`);
  }

  async maximize(): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.maximize();
    }
    console.log(`[Mock] Window ${this.label} maximize`);
    this.options.maximized = true;
  }

  async unmaximize(): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.unmaximize();
    }
    console.log(`[Mock] Window ${this.label} unmaximize`);
    this.options.maximized = false;
  }

  async center(): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.center();
    }
    console.log(`[Mock] Window ${this.label} center`);
  }

  async setFocus(): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window?.setFocus) {
      return electronHost.window.setFocus();
    }
    console.log(`[Mock] Window ${this.label} setFocus`);
  }

  async startDragging(): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window?.startDragging) {
      return electronHost.window.startDragging();
    }
    console.log(`[Mock] Window ${this.label} startDragging`);
  }

  async setTitle(title: string): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.setTitle(title);
    }
    console.log(`[Mock] Window ${this.label} setTitle: ${title}`);
    this.options.title = title;
  }

  async resize(width: number, height: number): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.setSize(width, height);
    }
    console.log(`[Mock] Window ${this.label} resize: ${width}x${height}`);
    this.options.width = width;
    this.options.height = height;
  }

  async setPosition(x: number, y: number): Promise<void> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.setPosition(x, y);
    }
    console.log(`[Mock] Window ${this.label} setPosition: ${x},${y}`);
    this.options.x = x;
    this.options.y = y;
  }

  async isVisible(): Promise<boolean> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.isVisible();
    }
    return this.options.visible ?? true;
  }

  async isMaximized(): Promise<boolean> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.isMaximized();
    }
    return this.options.maximized ?? false;
  }

  async isFullscreen(): Promise<boolean> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.isFullscreen();
    }
    return this.options.fullscreen ?? false;
  }

  async isDecorated(): Promise<boolean> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.isDecorated();
    }
    return this.options.decorations ?? true;
  }

  async isResizable(): Promise<boolean> {
    const electronHost = getElectronHostBridge();
    if (electronHost?.window) {
      return electronHost.window.isResizable();
    }
    return this.options.resizable ?? true;
  }

  async onFocusChanged(
    _handler: (focused: boolean) => void,
  ): Promise<() => void> {
    console.log(`[Mock] Window ${this.label} onFocusChanged`);
    // 返回 unlisten 函数
    return () => {};
  }

  async onScaleChanged(_handler: (scale: number) => void): Promise<() => void> {
    console.log(`[Mock] Window ${this.label} onScaleChanged`);
    return () => {};
  }

  async onThemeChanged(_handler: (theme: string) => void): Promise<() => void> {
    console.log(`[Mock] Window ${this.label} onThemeChanged`);
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
