/**
 * Mock for @/lib/desktop-host/plugin-shell
 */

import { getElectronHostBridge } from "@/lib/electron-host";

/**
 * Mock open function (opens URL in external browser)
 */
export async function open(path: string, _openWith?: string): Promise<void> {
  const electronHost = getElectronHostBridge();
  if (electronHost?.shell) {
    return electronHost.shell.open(path, _openWith);
  }

  // 在浏览器开发环境中，直接在当前标签页打开
  if (typeof window !== "undefined") {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      window.open(path, "_blank");
    } else {
      console.warn("[Mock] Non-HTTP URL, not opening:", path);
    }
  }
}
