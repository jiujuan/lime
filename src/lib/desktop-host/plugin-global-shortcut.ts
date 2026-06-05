/**
 * Mock for @/lib/desktop-host/plugin-global-shortcut
 */

import { getElectronHostBridge } from "@/lib/electron-host";

type ShortcutHandler = () => void;

// 存储快捷键监听器
const shortcuts = new Map<string, ShortcutHandler>();

/**
 * Mock register function
 */
export async function register(
  shortcut: string,
  handler: ShortcutHandler,
): Promise<void> {
  const electronHost = getElectronHostBridge();
  if (electronHost?.globalShortcut) {
    await electronHost.globalShortcut.register(shortcut);
    shortcuts.set(shortcut, handler);
    return;
  }

  console.log(`[Mock] Global shortcut registered: ${shortcut}`);
  shortcuts.set(shortcut, handler);
}

/**
 * Mock unregister function
 */
export async function unregister(shortcut: string): Promise<void> {
  const electronHost = getElectronHostBridge();
  if (electronHost?.globalShortcut) {
    await electronHost.globalShortcut.unregister(shortcut);
  }

  console.log(`[Mock] Global shortcut unregistered: ${shortcut}`);
  shortcuts.delete(shortcut);
}

/**
 * Mock unregisterAll function
 */
export async function unregisterAll(): Promise<void> {
  const electronHost = getElectronHostBridge();
  if (electronHost?.globalShortcut) {
    await electronHost.globalShortcut.unregisterAll();
  }

  console.log("[Mock] All global shortcuts unregistered");
  shortcuts.clear();
}

/**
 * Mock isRegistered function
 */
export async function isRegistered(shortcut: string): Promise<boolean> {
  const electronHost = getElectronHostBridge();
  if (electronHost?.globalShortcut) {
    return electronHost.globalShortcut.isRegistered(shortcut);
  }

  return shortcuts.has(shortcut);
}

/**
 * 手动触发快捷键（用于测试）
 */
export function triggerShortcut(shortcut: string) {
  const handler = shortcuts.get(shortcut);
  if (handler) {
    console.log(`[Mock] Triggering shortcut: ${shortcut}`);
    handler();
  } else {
    console.warn(`[Mock] Shortcut not found: ${shortcut}`);
  }
}
