import type { ChatToolPreferences } from "../../../utils/chatToolPreferences";

interface InputbarModeState {
  planEnabled?: boolean;
  subagentEnabled?: boolean;
}

export function buildInputbarToolPreferencesOverride(
  state: InputbarModeState,
): ChatToolPreferences | undefined {
  if (!state.planEnabled) {
    return undefined;
  }

  return {
    task: true,
    subagent: Boolean(state.subagentEnabled),
  };
}
