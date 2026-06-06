import { getElectronHostBridge } from "@/lib/electron-host";

function getWindowObject(): (Window & typeof globalThis) | null {
  return typeof window === "undefined" ? null : window;
}

export function hasDesktopHostRuntimeMarkers(): boolean {
  const currentWindow = getWindowObject();
  if (!currentWindow) {
    return false;
  }

  return (
    Boolean(getElectronHostBridge()) ||
    currentWindow.__LIME_ELECTRON__ === true
  );
}

export function hasDesktopHostInvokeCapability(): boolean {
  return typeof getElectronHostBridge()?.invoke === "function";
}

export function hasDesktopHostEventCapability(): boolean {
  const electronHost = getElectronHostBridge();

  return (
    typeof electronHost?.listen === "function" ||
    typeof electronHost?.on === "function"
  );
}

export function hasDesktopHostEventListenerCapability(): boolean {
  const electronHost = getElectronHostBridge();

  return (
    typeof electronHost?.listen === "function" ||
    typeof electronHost?.on === "function"
  );
}
