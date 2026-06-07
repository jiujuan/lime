import { hasDesktopHostInvokeCapability } from "@/lib/desktop-runtime";

const NATIVE_STARTUP_OVERLAY_SELECTOR = "[data-lime-startup-shell]";
const NATIVE_STARTUP_OVERLAY_EXIT_MS = 180;

export function hasNativeStartupScreen(): boolean {
  return hasDesktopHostInvokeCapability() && hasNativeStartupScreenFlag();
}

export function hideNativeStartupOverlayWhenReady(): void {
  if (!hasNativeStartupScreenFlag() || typeof window === "undefined") {
    return;
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const overlay = document.querySelector<HTMLElement>(
        NATIVE_STARTUP_OVERLAY_SELECTOR,
      );
      if (!overlay) {
        return;
      }

      document.documentElement.dataset.limeNativeStartupReady = "1";
      window.setTimeout(() => {
        overlay.remove();
        delete document.documentElement.dataset.limeNativeStartup;
        delete document.documentElement.dataset.limeNativeStartupReady;
      }, NATIVE_STARTUP_OVERLAY_EXIT_MS);
    });
  });
}

function hasNativeStartupScreenFlag(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return new URLSearchParams(window.location.search).get("nativeStartup") === "1";
}
