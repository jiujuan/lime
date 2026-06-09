import { hasDesktopHostInvokeCapability } from "@/lib/desktop-runtime";
import {
  buildResourceManagerSession,
  writeResourceManagerSession,
} from "./resourceManagerSession";
import type { OpenResourceManagerInput } from "./types";

export const RESOURCE_MANAGER_WINDOW_LABEL = "resource-manager";
export const RESOURCE_MANAGER_SESSION_EVENT = "lime:resource-manager-session";

function buildResourceManagerUrl(sessionId: string): string {
  return `/resource-manager?session=${encodeURIComponent(sessionId)}`;
}

function openResourceManagerFallback(url: string): void {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

async function openDesktopHostResourceManagerWindow(params: {
  url: string;
  sessionId: string;
}): Promise<boolean> {
  if (!hasDesktopHostInvokeCapability()) {
    return false;
  }

  try {
    const { WebviewWindow } = await import("@/lib/desktop-host/webviewWindow");
    const existingWindow = await WebviewWindow.getByLabel(
      RESOURCE_MANAGER_WINDOW_LABEL,
    ).catch(() => null);

    if (existingWindow) {
      await existingWindow.emit(RESOURCE_MANAGER_SESSION_EVENT, {
        sessionId: params.sessionId,
      });
      await existingWindow.show().catch(() => undefined);
      await existingWindow.setFocus().catch(() => undefined);
      return true;
    }

    const resourceWindow = new WebviewWindow(RESOURCE_MANAGER_WINDOW_LABEL, {
      url: params.url,
      title: "Lime 资源管理器",
      width: 1240,
      height: 820,
      minWidth: 860,
      minHeight: 560,
      center: true,
      visible: true,
      focus: true,
      resizable: true,
      decorations: true,
    });

    await Promise.race([
      new Promise<void>((resolve) => {
        void resourceWindow.once("desktop-host://created", () => resolve());
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 160)),
    ]);
    return true;
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? `Desktop Host 独立资源管理器窗口打开失败：${error.message.trim()}`
        : "Desktop Host 独立资源管理器窗口打开失败";
    throw new Error(message);
  }
}

export async function openResourceManager(
  input: OpenResourceManagerInput,
): Promise<string | null> {
  const session = buildResourceManagerSession(input);
  if (!session) {
    return null;
  }

  writeResourceManagerSession(session);
  const url = buildResourceManagerUrl(session.id);
  const openedInDesktopHost = await openDesktopHostResourceManagerWindow({
    url,
    sessionId: session.id,
  });

  if (!openedInDesktopHost) {
    openResourceManagerFallback(url);
  }

  return session.id;
}
