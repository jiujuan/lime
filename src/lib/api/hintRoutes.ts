import { safeInvoke } from "@/lib/dev-bridge";
import { isOptionalLegacyUxCommandAvailable } from "@/lib/dev-bridge/commandPolicy";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";

export interface HintRouteItem {
  hint: string;
  provider: string;
  model: string;
}

const COMMAND_GET_HINT_ROUTES = "get_hint_routes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function containsErrorEnvelope(value: unknown): boolean {
  if (isRecord(value) && "error" in value) {
    return true;
  }
  return Array.isArray(value) && value.some(containsErrorEnvelope);
}

function assertNotErrorEnvelope(command: string, value: unknown): void {
  if (containsErrorEnvelope(value)) {
    throw new Error(`${command} returned an error envelope`);
  }
}

function isHintRouteItem(value: unknown): value is HintRouteItem {
  if (!isRecord(value)) {
    return false;
  }
  const route = value as Partial<Record<keyof HintRouteItem, unknown>>;
  return (
    typeof route.hint === "string" &&
    typeof route.provider === "string" &&
    typeof route.model === "string"
  );
}

export async function listHintRoutes(): Promise<HintRouteItem[]> {
  if (!isOptionalLegacyUxCommandAvailable(COMMAND_GET_HINT_ROUTES)) {
    return [];
  }

  const routes = await safeInvoke<unknown>(COMMAND_GET_HINT_ROUTES);
  assertNotDiagnosticFacade(
    COMMAND_GET_HINT_ROUTES,
    routes,
    "真实提示路由 current 通道",
  );
  assertNotErrorEnvelope(COMMAND_GET_HINT_ROUTES, routes);
  if (!Array.isArray(routes) || routes.some((route) => !isHintRouteItem(route))) {
    throw new Error(`${COMMAND_GET_HINT_ROUTES} did not return hint routes`);
  }
  return routes;
}
