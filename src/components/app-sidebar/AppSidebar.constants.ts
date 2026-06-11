import { UI_LOCALE_OPTIONS } from "@/i18n/locales";

export const APP_SIDEBAR_COLLAPSED_STORAGE_KEY =
  "lime.app-sidebar.collapsed";
export const APP_SIDEBAR_COLLAPSE_EVENT = "lime:app-sidebar-collapse";
export const AGENT_APP_RUNTIME_SIDEBAR_COLLAPSE_SOURCE = "agent-app-runtime";

export const SIDEBAR_RECENT_SESSION_PAGE_SIZE = 10;
export const SIDEBAR_SEARCH_RESULT_LIMIT = 8;
export const SIDEBAR_SESSION_ENTRY_REFRESH_DEFER_MS = 30_000;
export const SIDEBAR_SESSION_LOAD_RESTART_DEFER_MS = 160;
export const SIDEBAR_NEW_TASK_HOME_SESSION_LOAD_DEFER_MS = 0;
export const SIDEBAR_CONVERSATION_NAVIGATION_DEFER_MS =
  SIDEBAR_SESSION_ENTRY_REFRESH_DEFER_MS;

export const SIDEBAR_NAV_LABEL_KEYS: Record<string, string> = {
  "agent-apps": "navigation.sidebar.items.agentApps",
  "agent-app-lab": "navigation.sidebar.items.agentAppLab",
  automation: "navigation.sidebar.items.automation",
  channels: "navigation.sidebar.items.channels",
  experts: "navigation.sidebar.items.experts",
  "home-general": "navigation.sidebar.items.homeGeneral",
  knowledge: "navigation.sidebar.items.knowledge",
  memory: "navigation.sidebar.items.memory",
  settings: "navigation.sidebar.items.settings",
  skills: "navigation.sidebar.items.skills",
};

export const APP_SIDEBAR_LANGUAGE_OPTIONS = UI_LOCALE_OPTIONS.map((option) => ({
  id: option.id,
  label: option.label,
  hint: option.fallbackHint,
}));
