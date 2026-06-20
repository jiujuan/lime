import type { ToolDisplayConfig } from "./toolDisplayTypes";
import { CORE_EXACT_TOOL_CONFIGS } from "./toolDisplayConfig/core";
import { CONTENT_EXACT_TOOL_CONFIGS } from "./toolDisplayConfig/content";
import { SITE_EXACT_TOOL_CONFIGS } from "./toolDisplayConfig/site";

export { BROWSER_TOOL_MATCHERS } from "./toolDisplayConfig/browser";
export {
  CONTENT_CREATE_TASK_TOOL_KEYS,
  CONTENT_TOOL_USER_FACING_COPY,
  DIRECT_CONTENT_GENERATION_TOOL_KEYS,
  DIRECT_CONTENT_GROUP_LABEL_COPY,
} from "./toolDisplayConfig/content";
export { FALLBACK_TOOL_CONFIGS } from "./toolDisplayConfig/fallback";
export { MCP_OPERATION_TOOL_CONFIGS } from "./toolDisplayConfig/mcp";
export { SITE_TOOL_KEYS } from "./toolDisplayConfig/site";

export const PLANNING_TOOL_KEYS = new Set([
  "taskcreate",
  "tasklist",
  "taskget",
  "taskupdate",
  "enterplanmode",
  "exitplanmode",
]);

export const EXACT_TOOL_CONFIGS = new Map<string, ToolDisplayConfig>([
  ...CORE_EXACT_TOOL_CONFIGS,
  ...CONTENT_EXACT_TOOL_CONFIGS,
  ...SITE_EXACT_TOOL_CONFIGS,
]);
