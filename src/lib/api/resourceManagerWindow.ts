import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

const RESOURCE_MANAGER_CURRENT_SURFACE = "资源管理器 Desktop Host current 通道";

export interface OpenResourceManagerWindowRequest {
  sessionId: string;
}

export async function openResourceManagerWindow(
  request: OpenResourceManagerWindowRequest,
): Promise<boolean> {
  const result = await safeInvoke("open_resource_manager_window", {
    sessionId: request.sessionId,
  });
  assertNotDiagnosticFacade(
    "open_resource_manager_window",
    result,
    RESOURCE_MANAGER_CURRENT_SURFACE,
  );
  if (!isOpenResourceManagerWindowResult(result) || result.opened !== true) {
    throw new Error(
      "open_resource_manager_window did not return an opened window result",
    );
  }
  return true;
}

function isOpenResourceManagerWindowResult(
  value: unknown,
): value is { opened: boolean } {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { opened?: unknown }).opened === "boolean",
  );
}
