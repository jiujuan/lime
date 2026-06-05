/**
 * Desktop Host fallback system - 统一入口
 *
 * 在浏览器开发模式下提供 Electron host 的轻量 fallback。
 */

function isElectronHostAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__LIME_ELECTRON__" in window || "electronAPI" in window)
  );
}

// 初始化 mock 系统
function initMockSystem() {
  if (isElectronHostAvailable()) {
    console.log("[DesktopHost] Running with Electron host bridge, skipping fallback");
    return;
  }

  console.log("[DesktopHost] Initializing fallback system for web mode");
  console.log("[DesktopHost] Running in WEB MODE - some features may not work");
  console.log("[DesktopHost] For full functionality, run: npm run dev");
}

// 自动初始化
if (import.meta.env.DEV && !isElectronHostAvailable()) {
  initMockSystem();
}
