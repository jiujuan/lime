#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runVitestSmoke } from "./lib/vitest-smoke-runner.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const LOG_PREFIX = "smoke:agent-runtime-async-tabs";

function runVitest(label, args) {
  return runVitestSmoke({
    rootDir,
    label,
    args,
    logPrefix: LOG_PREFIX,
  });
}

function main() {
  runVitest("刷新恢复与后台队列自动续跑", [
    "src/components/agent/chat/hooks/useAsterAgentChat.test.tsx",
    "-t",
    "页面刷新恢复到排队会话时应自动恢复后台执行|切换到 running thread_read 时只恢复线程|切换话题时应恢复后端返回的排队项",
  ]);

  runVitest("任务标题与 tab 运行态提示", [
    "src/components/agent/chat/components/ChatSidebar.test.tsx",
    "src/components/agent/chat/components/TaskCenterTabStrip.test.tsx",
    "src/components/agent/chat/utils/taskCenterTabs.test.ts",
    "src/components/agent/chat/workspace/taskCenterTabProjection.test.ts",
    "-t",
    "当前运行中的任务标题旁应显示加载状态|任务中心侧栏应使用对话与归档分组标题|应渲染第二层会话 tabs 和加号入口|默认标签应纳入非当前运行中任务|应把草稿与可见任务投影为第二层标签",
  ]);

  console.log(
    `[${LOG_PREFIX}] async-tabs.summary: hydration_resume=covered; background_running_tabs=covered; title_loading=covered`,
  );
  console.log(`\n[${LOG_PREFIX}] 通过`);
}

main();
