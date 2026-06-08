import { safeInvoke } from "@/lib/dev-bridge";
import { isOptionalLegacyUxCommandAvailable } from "@/lib/dev-bridge/commandPolicy";

export interface HintRouteItem {
  hint: string;
  provider: string;
  model: string;
}

const COMMAND_GET_HINT_ROUTES = "get_hint_routes";

export async function listHintRoutes(): Promise<HintRouteItem[]> {
  if (!isOptionalLegacyUxCommandAvailable(COMMAND_GET_HINT_ROUTES)) {
    return [];
  }

  const routes = await safeInvoke<HintRouteItem[]>(COMMAND_GET_HINT_ROUTES);
  return Array.isArray(routes) ? routes : [];
}
