import { Globe, Search } from "lucide-react";
import type { ToolDisplayConfig } from "../toolDisplayTypes";

export const SITE_EXACT_TOOL_CONFIGS = [
  [
    "limesitelist",
    {
      family: "list",
      label: "站点能力目录",
      verb: "浏览",
      icon: Globe,
      groupTitle: "站点",
      actionKey: "list",
      actions: {
        failed: "浏览失败",
        completed: "已浏览",
        running: "浏览中",
      },
    },
  ],
  [
    "limesiterecommend",
    {
      family: "search",
      label: "站点能力推荐",
      verb: "推荐",
      icon: Globe,
      groupTitle: "站点",
      actionKey: "search",
      actions: {
        failed: "推荐失败",
        completed: "已推荐",
        running: "推荐中",
      },
    },
  ],
  [
    "limesitesearch",
    {
      family: "search",
      label: "站点能力搜索",
      verb: "搜索",
      icon: Search,
      groupTitle: "站点",
      actionKey: "search",
      actions: {
        failed: "搜索失败",
        completed: "已搜索",
        running: "搜索中",
      },
    },
  ],
  [
    "limesiteinfo",
    {
      family: "read",
      label: "站点能力详情",
      verb: "查看",
      icon: Globe,
      groupTitle: "站点",
      actionKey: "read",
      actions: {
        failed: "查看失败",
        completed: "已查看",
        running: "查看中",
      },
    },
  ],
  [
    "limesiterun",
    {
      family: "generic",
      label: "站点能力执行",
      verb: "执行",
      icon: Globe,
      groupTitle: "站点",
      actionKey: "generic",
      actions: {
        failed: "执行失败",
        completed: "已执行",
        running: "执行中",
      },
    },
  ],
] as const satisfies ReadonlyArray<readonly [string, ToolDisplayConfig]>;

export const SITE_TOOL_KEYS = new Set([
  "limesitelist",
  "limesiterecommend",
  "limesitesearch",
  "limesiteinfo",
  "limesiterun",
]);
