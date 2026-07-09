#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  assertSmoke,
  createAgentSessionCurrent,
  exportAgentSessionEvidencePackCurrent,
  invokeDevBridge,
  invokeAppServerMethod,
  readAgentRuntimeThreadCurrent,
  readAgentSessionDetailCurrent,
  respondAgentSessionActionCurrent,
  sleep,
  startAgentSessionTurnCurrent,
  summarizeEvidencePack,
  summarizeThreadRead,
  threadSettled,
  updateAgentSessionRuntimeCurrent,
  waitForHealth,
} from "../lib/managed-objective-continuation-smoke-core.mjs";
import {
  fixtureChatRequestCount,
  workspaceIdFromDefaultProject,
  workspaceRootFromDefaultProject,
} from "../lib/managed-objective-automation-smoke-support.mjs";
import {
  assertLiveProviderSmokeAllowed,
  liveProviderSmokeAllowed,
} from "../lib/live-provider-smoke-gate.mjs";
import { startOpenAiCompatibleFixtureServer } from "../lib/openai-compatible-fixture-server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");

const DEFAULT_OUTPUT = path.join(
  rootDir,
  ".lime/qc/agent-runtime-tool-execution-smoke.json",
);
const DEFAULT_HEALTH_URL = "http://127.0.0.1:3030/health";
const DEFAULT_INVOKE_URL = "http://127.0.0.1:3030/invoke";
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_INTERVAL_MS = 1_000;
const LOG_PREFIX = "[smoke:agent-runtime-tool-execution]";
const APP_SERVER_METHOD_AGENT_SESSION_TOOL_INVENTORY_READ =
  "agentSession/toolInventory/read";

const FIXTURE_ROOT = "lime-qc/agent-runtime-tool-execution";
const EDIT_RELATIVE_PATH = `${FIXTURE_ROOT}/files/edit-target.txt`;
const WRITE_RELATIVE_PATH = `${FIXTURE_ROOT}/files/write-target.txt`;
const GREP_RELATIVE_PATH = `${FIXTURE_ROOT}/files/search-target.txt`;
const IMAGE_RELATIVE_PATH = `${FIXTURE_ROOT}/images/tiny.png`;
const NOTEBOOK_RELATIVE_PATH = `${FIXTURE_ROOT}/notebooks/sample.ipynb`;
const AUDIO_RELATIVE_PATH = `${FIXTURE_ROOT}/media/sample-audio.txt`;
const DEFAULT_BATCH_ID = "safe-core-tools";
const CONTEXT7_LIVE_URL = "https://mcp.context7.com/mcp";
const CONTEXT7_HEADER_NAME = "CONTEXT7_API_KEY";
const CONTEXT7_ENV_VAR_NAME = "CONTEXT7_API_KEY";
const CONTEXT7_LIBRARY_ID = "/openai/openai-agents-python";
const SAFE_FILE_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"];
const MEDIA_NOTEBOOK_SHELL_TOOLS = ["view_image", "NotebookEdit", "Bash"];
const TASK_BOARD_TOOLS = ["TaskCreate", "TaskGet", "TaskUpdate", "TaskList"];
const BACKGROUND_TASK_TOOLS = ["Bash", "TaskOutput", "TaskStop"];
const RUNTIME_INTROSPECTION_TOOLS = ["ToolSearch", "SendUserMessage"];
const WEB_TOOLS = ["WebFetch", "WebSearch"];
const AGENT_CONTROL_TOOLS = [
  "TeamCreate",
  "ListPeers",
  "Agent",
  "SendMessage",
  "TeamDelete",
];
const PLAN_WORKTREE_TOOLS = [
  "EnterPlanMode",
  "ExitPlanMode",
  "EnterWorktree",
  "ExitWorktree",
];
const ASK_TOOLS = ["request_user_input"];
const CREATION_TASK_TOOLS = [
  "lime_create_audio_generation_task",
  "lime_create_broadcast_generation_task",
  "lime_create_cover_generation_task",
  "lime_create_image_generation_task",
  "lime_create_modal_resource_search_task",
  "lime_create_transcription_task",
  "lime_create_typesetting_task",
  "lime_create_url_parse_task",
];
const MCP_RESOURCE_TOOLS = ["ListMcpResourcesTool", "ReadMcpResourceTool"];
const SKILL_TOOLS = ["Skill"];
const MCP_CONTEXT7_TOOLSEARCH_BATCH_ID = "mcp-context7-toolsearch";
const BATCH_TARGET_TOOLS = {
  [DEFAULT_BATCH_ID]: SAFE_FILE_TOOLS,
  "media-notebook-shell-tools": MEDIA_NOTEBOOK_SHELL_TOOLS,
  "task-board-tools": TASK_BOARD_TOOLS,
  "background-task-tools": BACKGROUND_TASK_TOOLS,
  "runtime-introspection-tools": RUNTIME_INTROSPECTION_TOOLS,
  "web-tools": WEB_TOOLS,
  "agent-control-tools": AGENT_CONTROL_TOOLS,
  "plan-worktree-tools": PLAN_WORKTREE_TOOLS,
  "ask-tools": ASK_TOOLS,
  "creation-task-tools": CREATION_TASK_TOOLS,
  "mcp-resource-tools": MCP_RESOURCE_TOOLS,
  "skill-tools": SKILL_TOOLS,
  [MCP_CONTEXT7_TOOLSEARCH_BATCH_ID]: ["ToolSearch"],
};
const SUPPORTED_BATCH_IDS = Object.keys(BATCH_TARGET_TOOLS);
const OPTIONAL_RUNTIME_COVERAGE_TOOLS = [
  // 这些工具可能需要额外运行时资源。脚本仍提供 batch 真跑，但覆盖摘要会单独标注。
  "ReadMcpResourceTool",
  "Skill",
  "WebFetch",
  "WebSearch",
];

function printHelp() {
  console.log(`
Lime Agent Runtime Tool Execution Smoke

用途:
  通过 localhost OpenAI-compatible fixture 验证工具从自然语言 runtime 回合进入 provider request，
  并让 Rust runtime 真实执行首批安全工具。该脚本会在 provider request 缺少目标 tool 时失败，
  用于捕获 tools=0 / 工具面未注入 / runtime 未执行 等问题。

用法:
  npm run smoke:agent-runtime-tool-execution

选项:
  --batch <id>          工具批次：${SUPPORTED_BATCH_IDS.join(" / ")}，默认 ${DEFAULT_BATCH_ID}
  --output <path>       evidence JSON 输出路径，默认 .lime/qc/agent-runtime-tool-execution-smoke.json
  --health-url <url>    DevBridge health 地址，默认 ${DEFAULT_HEALTH_URL}
  --invoke-url <url>    DevBridge invoke 地址，默认 ${DEFAULT_INVOKE_URL}
  --timeout-ms <ms>     总等待超时，默认 ${DEFAULT_TIMEOUT_MS}
  --interval-ms <ms>    轮询间隔，默认 ${DEFAULT_INTERVAL_MS}
  --allow-live-provider 保留统一 live gate 语义；本 smoke 默认且推荐使用 localhost fixture
  --no-write            只运行校验并打印摘要，不写 evidence JSON
  -h, --help            显示帮助
`);
}

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    healthUrl: DEFAULT_HEALTH_URL,
    invokeUrl: DEFAULT_INVOKE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    intervalMs: DEFAULT_INTERVAL_MS,
    batch: DEFAULT_BATCH_ID,
    outputExplicit: false,
    allowLiveProvider: liveProviderSmokeAllowed(),
    write: true,
    logPrefix: LOG_PREFIX,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--batch" && argv[index + 1]) {
      options.batch = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--output" && argv[index + 1]) {
      options.output = path.resolve(rootDir, String(argv[index + 1]));
      options.outputExplicit = true;
      index += 1;
      continue;
    }
    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--invoke-url" && argv[index + 1]) {
      options.invokeUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--interval-ms" && argv[index + 1]) {
      options.intervalMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--allow-live-provider") {
      options.allowLiveProvider = true;
      continue;
    }
    if (arg === "--no-write") {
      options.write = false;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!SUPPORTED_BATCH_IDS.includes(options.batch)) {
    throw new Error(
      `未知 batch: ${options.batch}; 支持: ${SUPPORTED_BATCH_IDS.join(", ")}`,
    );
  }
  if (!options.outputExplicit && options.batch !== DEFAULT_BATCH_ID) {
    options.output = path.join(
      rootDir,
      `.lime/qc/agent-runtime-tool-execution-${options.batch}.json`,
    );
  }
  return options;
}

function resolveWorkspaceRelativePath(relativePath) {
  return relativePath.split("/").join(path.sep);
}

function workspacePath(workspaceRoot, relativePath) {
  return path.join(workspaceRoot, resolveWorkspaceRelativePath(relativePath));
}

function setStableFileTimes(filePath) {
  const stableTime = new Date("2024-01-01T00:00:00.000Z");
  fs.utimesSync(filePath, stableTime, stableTime);
}

function writeTextFile(workspaceRoot, relativePath, content) {
  const absolutePath = workspacePath(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, "utf8");
  setStableFileTimes(absolutePath);
  return absolutePath;
}

function writeTinyPng(workspaceRoot, relativePath) {
  const absolutePath = workspacePath(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(
    absolutePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  setStableFileTimes(absolutePath);
  return absolutePath;
}

function buildNotebookFixture() {
  return JSON.stringify(
    {
      cells: [
        {
          id: "cell-1",
          cell_type: "markdown",
          metadata: {},
          source: "Initial notebook fixture",
        },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    },
    null,
    2,
  );
}

function prepareFixtureFiles(workspaceRoot) {
  const editPath = writeTextFile(
    workspaceRoot,
    EDIT_RELATIVE_PATH,
    [
      "Lime runtime tool execution fixture",
      "replace-target",
      "LIME_TOOL_EXECUTION_MARKER",
      "",
    ].join("\n"),
  );
  const writePath = workspacePath(workspaceRoot, WRITE_RELATIVE_PATH);
  fs.rmSync(writePath, { force: true });
  writeTextFile(
    workspaceRoot,
    GREP_RELATIVE_PATH,
    ["searchable text", "LIME_TOOL_EXECUTION_MARKER", ""].join("\n"),
  );
  const imagePath = writeTinyPng(workspaceRoot, IMAGE_RELATIVE_PATH);
  const notebookPath = writeTextFile(
    workspaceRoot,
    NOTEBOOK_RELATIVE_PATH,
    buildNotebookFixture(),
  );
  const audioPath = writeTextFile(
    workspaceRoot,
    AUDIO_RELATIVE_PATH,
    "LIME_TRANSCRIPTION_SOURCE_PLACEHOLDER\n",
  );

  return {
    editPath,
    writePath,
    imagePath,
    notebookPath,
    audioPath,
  };
}

function toolCall(name, id, args) {
  return {
    type: "tool_call",
    id,
    name,
    arguments: args,
  };
}

function requestTextFromFixtureContext(context) {
  return requestMessagesText(context?.body);
}

function extractTaskBoardIdFromContext(context) {
  const text = requestTextFromFixtureContext(context);
  const taskObjectMatch = text.match(
    /"task"\s*:\s*\{[\s\S]*?"id"\s*:\s*"([^"]+)"/,
  );
  const looseMatch = text.match(/"id"\s*:\s*"([^"]+)"/);
  const taskId = (taskObjectMatch?.[1] || looseMatch?.[1] || "").trim();
  if (!taskId) {
    throw new Error(
      "fixture dynamic Task* response could not parse TaskCreate result id",
    );
  }
  return taskId;
}

function extractBackgroundTaskIdFromContext(context) {
  const text = requestTextFromFixtureContext(context);
  const metadataMatch = text.match(/"task_id"\s*:\s*"([^"]+)"/);
  const outputMatch = text.match(
    /Background task started with ID:\s*([^\s\n]+)/,
  );
  const taskId = (metadataMatch?.[1] || outputMatch?.[1] || "").trim();
  if (!taskId) {
    throw new Error(
      "fixture dynamic TaskOutput/TaskStop response could not parse Bash background task_id",
    );
  }
  return taskId;
}

function extractAgentIdFromContext(context) {
  const text = requestTextFromFixtureContext(context);
  const metadataMatch = text.match(/"agentId"\s*:\s*"([^"]+)"/);
  const outputMatch = text.match(/Agent launched:\s*([^\s\n]+)/);
  const agentId = (metadataMatch?.[1] || outputMatch?.[1] || "").trim();
  if (!agentId) {
    throw new Error(
      "fixture dynamic SendMessage response could not parse Agent result agentId",
    );
  }
  return agentId;
}

function outputPathFor(toolName) {
  return `${FIXTURE_ROOT}/tasks/${toolName}.json`;
}

function allScenarioTargetTools() {
  return uniqueSorted(Object.values(BATCH_TARGET_TOOLS).flat());
}

function buildSafeFileFixtureResponses() {
  return [
    toolCall("Read", "call-tool-exec-read", {
      path: EDIT_RELATIVE_PATH,
    }),
    toolCall("Edit", "call-tool-exec-edit", {
      path: EDIT_RELATIVE_PATH,
      old_str: "replace-target",
      new_str: "replace-done",
    }),
    toolCall("Write", "call-tool-exec-write", {
      path: WRITE_RELATIVE_PATH,
      content: "LIME_TOOL_EXECUTION_WRITE_OK\n",
    }),
    toolCall("Glob", "call-tool-exec-glob", {
      pattern: `${FIXTURE_ROOT}/**/*.txt`,
      max_results: 20,
    }),
    toolCall("Grep", "call-tool-exec-grep", {
      pattern: "LIME_TOOL_EXECUTION_MARKER",
      path: FIXTURE_ROOT,
      mode: "content",
      include_hidden: true,
      max_results: 20,
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_SAFE_FILE_TOOLS_DONE",
    },
  ];
}

function buildMediaNotebookShellFixtureResponses({ notebookPath }) {
  const bashScript = "console.log('LIME_TOOL_EXECUTION_BASH_OK')";
  return [
    toolCall("view_image", "call-tool-exec-view-image", {
      path: IMAGE_RELATIVE_PATH,
      detail: "high",
    }),
    toolCall("NotebookEdit", "call-tool-exec-notebook-edit", {
      notebook_path: notebookPath,
      cell_id: "cell-1",
      new_source: "# Notebook fixture updated",
      cell_type: "markdown",
      edit_mode: "replace",
    }),
    toolCall("Bash", "call-tool-exec-bash", {
      command: `node -e ${JSON.stringify(bashScript)}`,
      timeout: 30,
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_MEDIA_NOTEBOOK_SHELL_TOOLS_DONE",
    },
  ];
}

function buildTaskBoardFixtureResponses() {
  return [
    toolCall("TaskCreate", "call-tool-exec-task-create", {
      subject: "Tool execution task",
      description: "Created by agent runtime tool execution smoke.",
    }),
    (context) =>
      toolCall("TaskGet", "call-tool-exec-task-get", {
        taskId: extractTaskBoardIdFromContext(context),
      }),
    (context) =>
      toolCall("TaskUpdate", "call-tool-exec-task-update", {
        taskId: extractTaskBoardIdFromContext(context),
        status: "completed",
      }),
    toolCall("TaskList", "call-tool-exec-task-list", {}),
    {
      type: "text",
      content: "AGENT_RUNTIME_TASK_BOARD_TOOLS_DONE",
    },
  ];
}

function buildBackgroundTaskFixtureResponses() {
  const backgroundScript = [
    "let count = 0;",
    "const timer = setInterval(() => {",
    "  count += 1;",
    "  console.log(`LIME_BACKGROUND_TASK_TICK_${count}`);",
    "}, 200);",
    "setTimeout(() => { clearInterval(timer); }, 60000);",
  ].join(" ");

  return [
    toolCall("Bash", "call-tool-exec-background-bash", {
      command: `node -e ${JSON.stringify(backgroundScript)}`,
      background: true,
      timeout: 30,
    }),
    (context) =>
      toolCall("TaskOutput", "call-tool-exec-task-output", {
        task_id: extractBackgroundTaskIdFromContext(context),
        block: true,
        timeout: 2_000,
      }),
    (context) =>
      toolCall("TaskStop", "call-tool-exec-task-stop", {
        task_id: extractBackgroundTaskIdFromContext(context),
      }),
    {
      type: "text",
      content: "AGENT_RUNTIME_BACKGROUND_TASK_TOOLS_DONE",
    },
  ];
}

function buildRuntimeIntrospectionFixtureResponses() {
  return [
    toolCall("ToolSearch", "call-tool-exec-tool-search", {
      query: "select:Read,ToolSearch,SendUserMessage",
      max_results: 10,
    }),
    toolCall("SendUserMessage", "call-tool-exec-send-user-message", {
      message:
        "LIME_TOOL_EXECUTION_SEND_USER_MESSAGE_OK: runtime tool smoke delivered a user-visible message.",
      status: "normal",
      attachments: [],
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_INTROSPECTION_TOOLS_DONE",
    },
  ];
}

function buildWebFixtureResponses() {
  return [
    toolCall("WebFetch", "call-tool-exec-web-fetch", {
      url: "https://example.com/",
      prompt:
        "Return the page title and mention LIME_TOOL_EXECUTION_WEBFETCH_OK.",
      focus_query: "Example Domain",
      dynamic_filter: true,
      max_chars: 2000,
      max_chunks: 2,
    }),
    toolCall("WebSearch", "call-tool-exec-web-search", {
      query: "Lime runtime tool smoke example domain",
      allowed_domains: ["example.com"],
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_WEB_TOOLS_DONE",
    },
  ];
}

function buildAgentControlFixtureResponses() {
  const teamName = `lime-tool-smoke-${Date.now()}-${process.pid}`;
  return [
    toolCall("TeamCreate", "call-tool-exec-team-create", {
      team_name: teamName,
      description: "Agent runtime tool execution smoke team.",
    }),
    toolCall("ListPeers", "call-tool-exec-list-peers", {}),
    toolCall("Agent", "call-tool-exec-agent", {
      description: "tool smoke child",
      prompt:
        "Respond with AGENT_RUNTIME_AGENT_CHILD_OK and do not call tools.",
      name: "tool-smoke-child",
      team_name: teamName,
      run_in_background: true,
    }),
    (context) =>
      toolCall("SendMessage", "call-tool-exec-send-message", {
        to: extractAgentIdFromContext(context),
        summary: "runtime smoke ping",
        message: "LIME_TOOL_EXECUTION_SEND_MESSAGE_OK",
      }),
    toolCall("TeamDelete", "call-tool-exec-team-delete", {}),
    {
      type: "text",
      content: "AGENT_RUNTIME_AGENT_CONTROL_TOOLS_DONE",
    },
  ];
}

function buildPlanWorktreeFixtureResponses() {
  return [
    toolCall("EnterPlanMode", "call-tool-exec-enter-plan-mode", {}),
    toolCall("ExitPlanMode", "call-tool-exec-exit-plan-mode", {
      allowedPrompts: [],
    }),
    toolCall("EnterWorktree", "call-tool-exec-enter-worktree", {
      name: `lime-tool-smoke-${Date.now()}-${process.pid}`,
    }),
    toolCall("ExitWorktree", "call-tool-exec-exit-worktree", {
      action: "remove",
      discard_changes: true,
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_PLAN_WORKTREE_TOOLS_DONE",
    },
  ];
}

function buildAskFixtureResponses() {
  return [
    toolCall("request_user_input", "call-tool-exec-request-user-input", {
      questions: [
        {
          id: "continue_ask_validation",
          question: "Continue Lime runtime tool smoke?",
          header: "Runtime",
          options: [
            {
              label: "Continue",
              description: "Proceed with request_user_input validation.",
            },
            {
              label: "Stop",
              description: "Stop the smoke validation.",
            },
          ],
        },
      ],
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_ASK_TOOLS_DONE",
    },
  ];
}

function buildCreationTaskFixtureResponses({ audioPath }) {
  return [
    toolCall(
      "lime_create_audio_generation_task",
      "call-tool-exec-create-audio",
      {
        sourceText: "LIME_TOOL_EXECUTION_AUDIO_TASK_OK",
        title: "Audio task smoke",
        outputPath: outputPathFor("audio"),
      },
    ),
    toolCall(
      "lime_create_broadcast_generation_task",
      "call-tool-exec-create-broadcast",
      {
        content: "LIME_TOOL_EXECUTION_BROADCAST_TASK_OK",
        title: "Broadcast task smoke",
        outputPath: outputPathFor("broadcast"),
      },
    ),
    toolCall(
      "lime_create_cover_generation_task",
      "call-tool-exec-create-cover",
      {
        prompt: "LIME_TOOL_EXECUTION_COVER_TASK_OK",
        title: "Cover task smoke",
        outputPath: outputPathFor("cover"),
      },
    ),
    toolCall(
      "lime_create_image_generation_task",
      "call-tool-exec-create-image",
      {
        prompt: "LIME_TOOL_EXECUTION_IMAGE_TASK_OK",
        title: "Image task smoke",
        output_path: outputPathFor("image"),
      },
    ),
    toolCall(
      "lime_create_modal_resource_search_task",
      "call-tool-exec-create-resource-search",
      {
        resourceType: "image",
        query: "LIME_TOOL_EXECUTION_RESOURCE_SEARCH_TASK_OK",
        title: "Resource search task smoke",
        outputPath: outputPathFor("resource-search"),
      },
    ),
    toolCall(
      "lime_create_transcription_task",
      "call-tool-exec-create-transcription",
      {
        sourcePath: audioPath,
        prompt: "LIME_TOOL_EXECUTION_TRANSCRIPTION_TASK_OK",
        title: "Transcription task smoke",
        outputPath: outputPathFor("transcription"),
      },
    ),
    toolCall(
      "lime_create_typesetting_task",
      "call-tool-exec-create-typesetting",
      {
        content: "LIME_TOOL_EXECUTION_TYPESETTING_TASK_OK",
        title: "Typesetting task smoke",
        outputPath: outputPathFor("typesetting"),
      },
    ),
    toolCall("lime_create_url_parse_task", "call-tool-exec-create-url-parse", {
      url: "https://example.com/",
      title: "URL parse task smoke",
      summary: "LIME_TOOL_EXECUTION_URL_PARSE_TASK_OK",
      outputPath: outputPathFor("url-parse"),
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_CREATION_TASK_TOOLS_DONE",
    },
  ];
}

function buildMcpResourceFixtureResponses() {
  return [
    toolCall("ListMcpResourcesTool", "call-tool-exec-mcp-list", {}),
    toolCall("ReadMcpResourceTool", "call-tool-exec-mcp-read", {
      server: "lime-tool-smoke-missing-server",
      uri: "lime://tool-smoke/missing-resource",
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_MCP_RESOURCE_TOOLS_DONE",
    },
  ];
}

function buildSkillFixtureResponses() {
  return [
    toolCall("Skill", "call-tool-exec-skill", {
      skill: "project:lime-tool-smoke-missing-skill",
      args: "LIME_TOOL_EXECUTION_SKILL_OK",
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_SKILL_TOOLS_DONE",
    },
  ];
}

function makeContext7AgentTurnServerName() {
  return `Context7Agent${Date.now().toString(36)}${process.pid.toString(36)}`;
}

function mcpRuntimeToolName(serverName, toolName) {
  return `mcp__${serverName}__${toolName}`;
}

function buildContext7ToolSearchFixtureResponses({ queryDocsToolName }) {
  return [
    toolCall("ToolSearch", "call-tool-exec-context7-tool-search", {
      query: `select:${queryDocsToolName}`,
      max_results: 10,
    }),
    toolCall(queryDocsToolName, "call-tool-exec-context7-query-docs", {
      libraryId: CONTEXT7_LIBRARY_ID,
      query: "AI Agent 是什么",
    }),
    {
      type: "text",
      content: "AGENT_RUNTIME_MCP_CONTEXT7_TOOLSEARCH_DONE",
    },
  ];
}

async function createContext7AgentTurnServer(options, serverName) {
  const serverId = `mcp-context7-agent-turn-${Date.now()}-${process.pid}`;
  const result = await invokeAppServerMethod(
    options,
    "mcpServer/create",
    {
      server: {
        id: serverId,
        name: serverName,
        description: "Agent turn Context7 ToolSearch smoke",
        server_config: {
          transport: "streamable_http",
          url: CONTEXT7_LIVE_URL,
          timeout: 10,
          env_http_headers: {
            [CONTEXT7_HEADER_NAME]: CONTEXT7_ENV_VAR_NAME,
          },
        },
        enabled_lime: true,
        enabled_claude: false,
        enabled_codex: false,
        enabled_gemini: false,
        created_at: Date.now(),
      },
    },
    30_000,
  );
  const createdServer = Array.isArray(result?.servers)
    ? result.servers.find(
        (server) => server?.id === serverId || server?.name === serverName,
      )
    : null;
  return {
    serverId,
    serverName,
    serverCreated: Boolean(createdServer),
    serverCreateReturnedServers: Array.isArray(result?.servers),
    urlHost: new URL(CONTEXT7_LIVE_URL).host,
    envHttpHeaderNames: [CONTEXT7_HEADER_NAME],
    envHttpHeaderEnvVars: [CONTEXT7_ENV_VAR_NAME],
    context7ApiKeyEnvPresent: Boolean(process.env.CONTEXT7_API_KEY),
  };
}

async function cleanupContext7AgentTurnServer(options, context) {
  if (!context?.serverName && !context?.serverId) {
    return;
  }
  if (context.serverName) {
    await invokeAppServerMethod(
      options,
      "mcpServer/stop",
      { name: context.serverName },
      30_000,
    ).catch((error) => {
      console.warn(
        `${LOG_PREFIX} context7 stop failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
  if (context.serverId) {
    await invokeAppServerMethod(
      options,
      "mcpServer/delete",
      { id: context.serverId },
      30_000,
    ).catch((error) => {
      console.warn(
        `${LOG_PREFIX} context7 delete failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }
}

function buildBatchScenario(batchId, fixtureFiles) {
  if (batchId === MCP_CONTEXT7_TOOLSEARCH_BATCH_ID) {
    const serverName = makeContext7AgentTurnServerName();
    const queryDocsToolName = mcpRuntimeToolName(serverName, "query-docs");
    return {
      id: MCP_CONTEXT7_TOOLSEARCH_BATCH_ID,
      prompt:
        "请从普通输入框自然语言触发 Context7 MCP 工具验收：先用 ToolSearch 精确选择 Context7 query-docs 工具，再调用 query-docs 查询 AI Agent 是什么。不要使用命令入口。",
      promptNeedle: "Context7 MCP 工具验收",
      targetTools: ["ToolSearch", queryDocsToolName],
      initialInventoryTargetTools: ["ToolSearch"],
      requiresTargetToolsInInitialInventory: false,
      requiresEvidenceToolPresence: false,
      deferScriptedToolCallsUntilAvailable: true,
      expectedFixtureRequestCount: 3,
      turnMetadata: {
        harness: {
          skip_mcp_prewarm: false,
        },
      },
      scriptedResponses: buildContext7ToolSearchFixtureResponses({
        queryDocsToolName,
      }),
      async prepareAfterInventory(options) {
        const context = await createContext7AgentTurnServer(
          options,
          serverName,
        );
        return {
          ...context,
          queryDocsToolName,
          resolveLibraryToolName: mcpRuntimeToolName(
            serverName,
            "resolve-library-id",
          ),
          createdContext7WithoutManualStart: true,
        };
      },
      async cleanup(options, context) {
        await cleanupContext7AgentTurnServer(options, context);
      },
      buildAssertions({
        evidencePackText,
        providerRequests,
        runtimeContext,
        toolOutputText,
      }) {
        const toolSearchOutput =
          toolOutputText
            .split("\n")
            .find((line) => line.startsWith("ToolSearch:")) || "";
        const normalizedToolSearchOutput = toolSearchOutput
          .replace(/\\"/g, '"')
          .replace(/\\n/g, "\n");
        const toolSearchReturnedEmptyMatches = /"matches"\s*:\s*\[\s*\]/.test(
          normalizedToolSearchOutput,
        );
        const toolSearchReturnedZeroDeferred =
          /"total_deferred_tools"\s*:\s*0\b/.test(normalizedToolSearchOutput);
        const queryDocsProviderRequestSeen = providerRequests.some((request) =>
          request.toolNames.includes(queryDocsToolName),
        );
        return {
          usesCurrentMcpControlPlane: Boolean(runtimeContext?.serverCreated),
          createdContext7WithoutManualStart:
            runtimeContext?.createdContext7WithoutManualStart === true,
          toolSearchSawContext7QueryDocs:
            normalizedToolSearchOutput.includes('"matches"') &&
            normalizedToolSearchOutput.includes(queryDocsToolName) &&
            normalizedToolSearchOutput.includes('"total_deferred_tools"') &&
            !toolSearchReturnedEmptyMatches &&
            !toolSearchReturnedZeroDeferred,
          providerExposedContext7QueryDocsAfterToolSearch:
            queryDocsProviderRequestSeen,
          context7QueryDocsExecuted:
            toolOutputText.includes(queryDocsToolName) &&
            !toolOutputText.includes('"isError":true') &&
            !toolOutputText.includes('"is_error":true'),
          evidencePackMentionsContext7ToolSearch:
            evidencePackText.includes(queryDocsToolName) ||
            toolOutputText.includes(queryDocsToolName) ||
            evidencePackText.includes(
              "AGENT_RUNTIME_MCP_CONTEXT7_TOOLSEARCH_DONE",
            ),
          agentTurnAutostartedContext7:
            runtimeContext?.createdContext7WithoutManualStart === true &&
            queryDocsProviderRequestSeen &&
            normalizedToolSearchOutput.includes(queryDocsToolName),
        };
      },
    };
  }

  if (batchId === "media-notebook-shell-tools") {
    return {
      id: "media-notebook-shell-tools",
      prompt:
        "请从普通输入框自然语言触发媒体、notebook 和命令工具验收：查看一张 fixture 图片，编辑一个 notebook 单元格，然后运行一个输出 LIME_TOOL_EXECUTION_BASH_OK 的最小本地命令。不要使用命令入口。",
      promptNeedle: "媒体、notebook 和命令工具验收",
      targetTools: MEDIA_NOTEBOOK_SHELL_TOOLS,
      scriptedResponses: buildMediaNotebookShellFixtureResponses({
        notebookPath: fixtureFiles.notebookPath,
      }),
      buildAssertions({ evidencePackText, fixtureFiles, toolOutputText }) {
        const notebookContent = readTextIfExists(fixtureFiles.notebookPath);
        return {
          viewImageReturnedMetadata:
            toolOutputText.includes("Viewed image:") ||
            toolOutputText.includes("Format: image/png"),
          notebookToolMutatedFile: notebookContent.includes(
            "# Notebook fixture updated",
          ),
          bashToolReturnedOutput: toolOutputText.includes(
            "LIME_TOOL_EXECUTION_BASH_OK",
          ),
          evidencePackMentionsMediaNotebookShell:
            evidencePackText.includes("view_image") ||
            evidencePackText.includes("NotebookEdit") ||
            evidencePackText.includes("LIME_TOOL_EXECUTION_BASH_OK"),
        };
      },
    };
  }

  if (batchId === "task-board-tools") {
    return {
      id: "task-board-tools",
      prompt:
        "请从普通输入框自然语言触发任务板工具验收：创建一个标题为 Tool execution task 的任务，读取同一个任务，将它更新为 completed，然后列出任务板。不要使用命令入口。",
      promptNeedle: "任务板工具验收",
      targetTools: TASK_BOARD_TOOLS,
      scriptedResponses: buildTaskBoardFixtureResponses(),
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          taskToolsReturnedTask: toolOutputText.includes("Tool execution task"),
          taskUpdateCompleted:
            toolOutputText.includes('"status": "completed"') ||
            toolOutputText.includes('"status":"completed"') ||
            toolOutputText.includes("completed"),
          evidencePackMentionsTaskBoard:
            evidencePackText.includes("Tool execution task") ||
            evidencePackText.includes("TaskCreate") ||
            evidencePackText.includes("TaskUpdate"),
        };
      },
    };
  }

  if (batchId === "background-task-tools") {
    return {
      id: "background-task-tools",
      prompt:
        "请从普通输入框自然语言触发后台任务工具验收：用 Bash 后台启动一个会持续输出 LIME_BACKGROUND_TASK_TICK 的本地命令，然后用 TaskOutput 读取同一个后台任务，再用 TaskStop 停止同一个后台任务。不要使用命令入口。",
      promptNeedle: "后台任务工具验收",
      targetTools: BACKGROUND_TASK_TOOLS,
      scriptedResponses: buildBackgroundTaskFixtureResponses(),
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          backgroundBashReturnedRuntimeTaskId: toolOutputText.includes(
            "Background task started with ID:",
          ),
          taskOutputUsedRuntimeTaskId:
            toolOutputText.includes("LIME_BACKGROUND_TASK_TICK") ||
            toolOutputText.includes('"retrieval_status"'),
          taskStopUsedRuntimeTaskId: toolOutputText.includes(
            "Successfully stopped task",
          ),
          evidencePackMentionsToolExecution:
            evidencePackText.includes("LIME_BACKGROUND_TASK") ||
            evidencePackText.includes("Background task started"),
        };
      },
    };
  }

  if (batchId === "runtime-introspection-tools") {
    return {
      id: "runtime-introspection-tools",
      prompt:
        "请从普通输入框自然语言触发运行时自检工具验收：先搜索当前工具面，再发送一条包含 LIME_TOOL_EXECUTION_SEND_USER_MESSAGE_OK 的用户可见消息。不要使用命令入口。",
      promptNeedle: "运行时自检工具验收",
      targetTools: RUNTIME_INTROSPECTION_TOOLS,
      scriptedResponses: buildRuntimeIntrospectionFixtureResponses(),
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          toolSearchReturnedToolSurface:
            toolOutputText.includes('"tools"') ||
            toolOutputText.includes("ToolSearch"),
          sendUserMessageDelivered: toolOutputText.includes(
            "Message delivered to user",
          ),
          evidencePackMentionsRuntimeIntrospection:
            evidencePackText.includes(
              "LIME_TOOL_EXECUTION_SEND_USER_MESSAGE_OK",
            ) ||
            evidencePackText.includes("runtime-introspection-tools") ||
            (toolOutputText.includes(
              "LIME_TOOL_EXECUTION_SEND_USER_MESSAGE_OK",
            ) &&
              toolOutputText.includes('"matches"')),
        };
      },
    };
  }

  if (batchId === "web-tools") {
    return {
      id: "web-tools",
      prompt:
        "请从普通输入框自然语言触发网页工具验收：用 WebFetch 抓取 example.com，再用 WebSearch 搜索 example.com 相关结果。不要使用命令入口。",
      promptNeedle: "网页工具验收",
      targetTools: WEB_TOOLS,
      scriptedResponses: buildWebFixtureResponses(),
      turnMetadata: {
        web_search_enabled: true,
        webSearchEnabled: true,
      },
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          webFetchReturnedExampleDomain:
            toolOutputText.includes("Example Domain") ||
            toolOutputText.includes("example.com"),
          webSearchReturnedQuery:
            toolOutputText.includes("Lime runtime tool smoke example domain") ||
            toolOutputText.includes("example.com"),
          evidencePackMentionsWebExecution:
            evidencePackText.includes("WebFetch") ||
            evidencePackText.includes("WebSearch"),
        };
      },
    };
  }

  if (batchId === "agent-control-tools") {
    return {
      id: "agent-control-tools",
      prompt:
        "请从普通输入框自然语言触发协作工具验收：创建一个 team，列出 peers，启动一个后台子代理，给它发送一条消息，然后删除 team。不要使用命令入口。",
      promptNeedle: "协作工具验收",
      targetTools: AGENT_CONTROL_TOOLS,
      scriptedResponses: buildAgentControlFixtureResponses(),
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          teamToolCreatedTeam:
            toolOutputText.includes("team_name") ||
            toolOutputText.includes("TeamCreate") ||
            toolOutputText.includes("lime-tool-smoke"),
          listPeersReturnedPeerSurface:
            toolOutputText.includes("peers") ||
            toolOutputText.includes("ListPeers"),
          agentToolLaunchedChild:
            toolOutputText.includes("Agent launched:") ||
            toolOutputText.includes('"agentId"'),
          sendMessageDelivered:
            toolOutputText.includes("Message sent") ||
            toolOutputText.includes("LIME_TOOL_EXECUTION_SEND_MESSAGE_OK") ||
            toolOutputText.includes("SendMessage"),
          teamDeleteCompleted:
            toolOutputText.includes("TeamDelete") ||
            toolOutputText.includes("deleted") ||
            toolOutputText.includes("删除"),
          evidencePackMentionsAgentTool:
            evidencePackText.includes("TeamCreate") ||
            evidencePackText.includes("SendMessage") ||
            evidencePackText.includes("agent-control-tools"),
        };
      },
    };
  }

  if (batchId === "plan-worktree-tools") {
    return {
      id: "plan-worktree-tools",
      prompt:
        "请从普通输入框自然语言触发计划和 worktree 工具验收：进入计划模式，退出计划模式，然后创建隔离 worktree，再删除并退出该 worktree。不要使用命令入口。",
      promptNeedle: "计划和 worktree 工具验收",
      targetTools: PLAN_WORKTREE_TOOLS,
      scriptedResponses: buildPlanWorktreeFixtureResponses(),
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          planModeEntered:
            toolOutputText.includes("plan mode") ||
            toolOutputText.includes("Plan mode") ||
            toolOutputText.includes("计划模式"),
          planModeExited:
            toolOutputText.includes("ExitPlanMode") ||
            toolOutputText.includes("退出计划") ||
            toolOutputText.includes("plan"),
          worktreeEntered:
            toolOutputText.includes("worktree") ||
            toolOutputText.includes("worktreePath"),
          worktreeExited:
            toolOutputText.includes("ExitWorktree") ||
            toolOutputText.includes("remove") ||
            toolOutputText.includes("removed"),
          evidencePackMentionsPlanWorktree:
            evidencePackText.includes("EnterPlanMode") ||
            evidencePackText.includes("EnterWorktree") ||
            evidencePackText.includes("plan-worktree-tools"),
        };
      },
    };
  }

  if (batchId === "ask-tools") {
    return {
      id: "ask-tools",
      prompt:
        "请从普通输入框自然语言触发 request_user_input 工具验收：向用户询问是否继续。不要使用命令入口。",
      promptNeedle: "request_user_input 工具验收",
      targetTools: ASK_TOOLS,
      scriptedResponses: buildAskFixtureResponses(),
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          askUserQuestionResolved:
            toolOutputText.includes("User has answered your questions") ||
            toolOutputText.includes("Continue"),
          evidencePackMentionsAsk:
            evidencePackText.includes("request_user_input") ||
            evidencePackText.includes("ask-tools"),
          evidencePackDoesNotMentionAskUserQuestion:
            !evidencePackText.includes("AskUserQuestion"),
        };
      },
    };
  }

  if (batchId === "creation-task-tools") {
    return {
      id: "creation-task-tools",
      prompt:
        "请从普通输入框自然语言触发内容创建任务工具验收：依次创建音频、播报、封面、图片、素材搜索、转写、排版和链接解析任务。不要使用命令入口。",
      promptNeedle: "内容创建任务工具验收",
      targetTools: CREATION_TASK_TOOLS,
      scriptedResponses: buildCreationTaskFixtureResponses({
        audioPath: fixtureFiles.audioPath,
      }),
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          creationToolsCreatedTaskArtifact:
            toolOutputText.includes("LIME_TOOL_EXECUTION_AUDIO_TASK_OK") ||
            toolOutputText.includes("task") ||
            toolOutputText.includes("artifact"),
          creationToolsMentionOutput:
            toolOutputText.includes(FIXTURE_ROOT) ||
            toolOutputText.includes("output") ||
            toolOutputText.includes("projectId"),
          evidencePackMentionsCreationTools:
            evidencePackText.includes("lime_create_audio_generation_task") ||
            evidencePackText.includes("creation-task-tools"),
        };
      },
    };
  }

  if (batchId === "mcp-resource-tools") {
    return {
      id: "mcp-resource-tools",
      prompt:
        "请从普通输入框自然语言触发 MCP 资源工具验收：先列出 MCP 资源，再尝试读取指定 MCP 资源。不要使用命令入口。",
      promptNeedle: "MCP 资源工具验收",
      targetTools: MCP_RESOURCE_TOOLS,
      scriptedResponses: buildMcpResourceFixtureResponses(),
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          mcpListExecuted:
            toolOutputText.includes("ListMcpResourcesTool") ||
            toolOutputText.includes("[]") ||
            toolOutputText.includes("resources"),
          mcpReadAttempted:
            toolOutputText.includes("lime-tool-smoke-missing-server") ||
            toolOutputText.includes("MCP") ||
            toolOutputText.includes("resource"),
          evidencePackMentionsMcpResourceTools:
            evidencePackText.includes("ReadMcpResourceTool") ||
            evidencePackText.includes("ListMcpResourcesTool") ||
            evidencePackText.includes("mcp-resource-tools"),
        };
      },
    };
  }

  if (batchId === "skill-tools") {
    return {
      id: "skill-tools",
      prompt:
        "请从普通输入框自然语言触发 Skill 工具验收：调用一个项目 Skill，并传入 LIME_TOOL_EXECUTION_SKILL_OK 参数。不要使用命令入口。",
      promptNeedle: "Skill 工具验收",
      targetTools: SKILL_TOOLS,
      scriptedResponses: buildSkillFixtureResponses(),
      buildAssertions({ evidencePackText, toolOutputText }) {
        return {
          skillToolAttempted:
            toolOutputText.includes("Skill") ||
            toolOutputText.includes("lime-tool-smoke-missing-skill") ||
            toolOutputText.includes("LIME_TOOL_EXECUTION_SKILL_OK"),
          evidencePackMentionsSkillTool:
            evidencePackText.includes("Skill") ||
            evidencePackText.includes("skill-tools"),
        };
      },
    };
  }

  return {
    id: DEFAULT_BATCH_ID,
    prompt:
      "请从普通输入框自然语言触发本地文件工具验收：读取文件、编辑文件、写入文件、按 glob 搜索文件、按 grep 搜索文件内容。不要使用命令入口。",
    promptNeedle: "本地文件工具验收",
    targetTools: SAFE_FILE_TOOLS,
    scriptedResponses: buildSafeFileFixtureResponses(),
    buildAssertions({ evidencePackText, fixtureFiles, toolOutputText }) {
      const editContent = readTextIfExists(fixtureFiles.editPath);
      const writeContent = readTextIfExists(fixtureFiles.writePath);
      return {
        editToolMutatedFile: editContent.includes("replace-done"),
        writeToolCreatedFile: writeContent.includes(
          "LIME_TOOL_EXECUTION_WRITE_OK",
        ),
        grepToolReturnedMarker: toolOutputText.includes(
          "LIME_TOOL_EXECUTION_MARKER",
        ),
        globToolReturnedFixturePath:
          toolOutputText.includes("edit-target.txt") ||
          toolOutputText.includes("write-target.txt") ||
          toolOutputText.includes("search-target.txt"),
        evidencePackMentionsToolExecution:
          evidencePackText.includes("LIME_TOOL_EXECUTION_MARKER") ||
          evidencePackText.includes("LIME_TOOL_EXECUTION_WRITE_OK"),
      };
    },
  };
}

function writeEvidence(outputPath, evidence) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
  return outputPath;
}

function writeEvidenceWithFallback(outputPath, evidence) {
  try {
    return writeEvidence(outputPath, evidence);
  } catch (error) {
    if (outputPath !== DEFAULT_OUTPUT) {
      throw error;
    }
    const fallbackPath = path.join(
      os.tmpdir(),
      "agent-runtime-tool-execution-smoke.json",
    );
    const writtenPath = writeEvidence(fallbackPath, evidence);
    console.warn(
      `${LOG_PREFIX} default evidence write failed, fallback=${writtenPath}: ${error.message}`,
    );
    return writtenPath;
  }
}

function requestToolNames(body) {
  if (!Array.isArray(body?.tools)) {
    return [];
  }
  return body.tools
    .map((tool) =>
      String(
        tool?.function?.name || tool?.name || tool?.tool?.function?.name || "",
      ).trim(),
    )
    .filter(Boolean);
}

function requestMessagesText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages
    .map((message) => {
      if (typeof message?.content === "string") {
        return message.content;
      }
      return JSON.stringify(message?.content || "");
    })
    .join("\n");
}

function requestUserMessagesText(body) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return messages
    .filter((message) => message?.role === "user")
    .map((message) => {
      if (typeof message?.content === "string") {
        return message.content;
      }
      return JSON.stringify(message?.content || "");
    })
    .join("\n");
}

function providerRequestSummaries(fixtureRequests) {
  return fixtureRequests.map((request, index) => {
    const toolNames = requestToolNames(request?.body);
    return {
      index,
      path: request?.path || null,
      model: request?.body?.model || null,
      stream: request?.body?.stream === true,
      toolCount: toolNames.length,
      toolNames,
    };
  });
}

function getToolCalls(threadRead) {
  return Array.isArray(threadRead?.tool_calls)
    ? threadRead.tool_calls
    : Array.isArray(threadRead?.toolCalls)
      ? threadRead.toolCalls
      : [];
}

function toolName(toolCall) {
  return String(toolCall?.tool_name || toolCall?.toolName || "").trim();
}

function toolStatus(toolCall) {
  return String(toolCall?.status || "")
    .trim()
    .toLowerCase();
}

function toolOutput(toolCall) {
  return String(
    toolCall?.output ||
      toolCall?.output_preview ||
      toolCall?.outputPreview ||
      toolCall?.error ||
      "",
  );
}

function buildToolExecutionMatrix(threadRead, targetTools) {
  const calls = getToolCalls(threadRead);
  return targetTools.map((name) => {
    const matching = calls.find((call) => toolName(call) === name);
    return {
      tool: name,
      requested: true,
      executed: Boolean(matching),
      status: matching ? toolStatus(matching) : "missing",
      success: matching?.success ?? null,
      outputPreview: matching ? toolOutput(matching).slice(0, 500) : "",
    };
  });
}

function allTargetToolsPresentInProviderRequests(requests, targetTools) {
  return Object.fromEntries(
    targetTools.map((tool) => [
      tool,
      requests.some((request) => request.toolNames.includes(tool)),
    ]),
  );
}

function allTargetToolsCompleted(matrix) {
  return Object.fromEntries(
    matrix.map((entry) => [
      entry.tool,
      entry.executed && entry.status === "completed" && entry.success !== false,
    ]),
  );
}

function evidencePackToolPresence(evidencePackText, targetTools) {
  return Object.fromEntries(
    targetTools.map((tool) => [tool, evidencePackText.includes(tool)]),
  );
}

function buildToolStageMatrix({
  targetTools,
  inventoryCoverage,
  providerToolPresence,
  matrix,
  evidenceToolPresence,
  evidenceToolPresenceRequired = true,
}) {
  return targetTools.map((tool) => {
    const runtimeToolVisible =
      inventoryCoverage.targetToolsVisibleInInventory?.[tool] === true;
    const runtimeToolPresent =
      inventoryCoverage.targetToolsInInventory?.[tool] === true;
    const providerRequestPresent = providerToolPresence?.[tool] === true;
    const runtime = matrix.find((entry) => entry.tool === tool) || null;
    const runtimeCompleted =
      Boolean(runtime) &&
      runtime.status === "completed" &&
      runtime.success !== false;
    const evidenceReturned =
      evidenceToolPresenceRequired !== true ||
      evidenceToolPresence?.[tool] === true;
    let failureStage = null;
    if ((!runtimeToolPresent || !runtimeToolVisible) && !runtimeCompleted) {
      failureStage = "runtime_inventory";
    } else if (!providerRequestPresent) {
      failureStage = "provider_request";
    } else if (!runtimeCompleted) {
      failureStage = "runtime_execution";
    } else if (!evidenceReturned) {
      failureStage = "evidence_pack";
    }
    return {
      tool,
      runtimeToolPresent,
      runtimeToolVisible,
      providerRequestPresent,
      threadReadReturned: Boolean(runtime),
      runtimeStatus: runtime?.status || "missing",
      runtimeSuccess: runtime?.success ?? null,
      runtimeCompleted,
      evidenceReturned,
      failureStage,
      outputPreview: runtime?.outputPreview || "",
    };
  });
}

function runtimeTurnObserved(threadRead, fixture) {
  const summary = summarizeThreadRead(threadRead);
  const status = String(threadRead?.status || "").toLowerCase();
  const latestTurnStatus = String(summary.latestTurnStatus || "").toLowerCase();
  return (
    fixtureChatRequestCount(fixture.requests) > 0 ||
    summary.turnCount > 0 ||
    Boolean(summary.activeTurnId) ||
    (latestTurnStatus !== "" && latestTurnStatus !== "idle") ||
    (status !== "" && status !== "idle")
  );
}

function uniqueSorted(values) {
  return [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function runtimeToolsFromInventory(inventory) {
  return Array.isArray(inventory?.runtime_tools)
    ? inventory.runtime_tools
    : Array.isArray(inventory?.runtimeTools)
      ? inventory.runtimeTools
      : [];
}

function inventoryToolName(tool) {
  return String(tool?.name || "").trim();
}

function inventoryToolVisible(tool) {
  return Boolean(tool?.visible_in_context ?? tool?.visibleInContext);
}

function inventoryRuntimeToolNames(inventory) {
  return uniqueSorted(
    runtimeToolsFromInventory(inventory).map(inventoryToolName),
  );
}

function inventoryVisibleRuntimeToolNames(inventory) {
  return uniqueSorted(
    runtimeToolsFromInventory(inventory)
      .filter(inventoryToolVisible)
      .map(inventoryToolName),
  );
}

function summarizeInventory(inventory) {
  const runtimeToolNames = inventoryRuntimeToolNames(inventory);
  const visibleRuntimeToolNames = inventoryVisibleRuntimeToolNames(inventory);
  return {
    request: inventory?.request || null,
    agentInitialized:
      inventory?.agent_initialized ?? inventory?.agentInitialized ?? null,
    warnings: Array.isArray(inventory?.warnings) ? inventory.warnings : [],
    counts: inventory?.counts || null,
    runtimeToolCount: runtimeToolNames.length,
    visibleRuntimeToolCount: visibleRuntimeToolNames.length,
    runtimeTools: runtimeToolNames,
    visibleRuntimeTools: visibleRuntimeToolNames,
  };
}

function buildInventoryCoverage(inventories, matrix, targetTools) {
  const inventoryEntries = Object.entries(inventories || {});
  const visibleToolNames = uniqueSorted(
    inventoryEntries.flatMap(([, inventory]) =>
      inventoryVisibleRuntimeToolNames(inventory),
    ),
  );
  const runtimeToolNames = uniqueSorted(
    inventoryEntries.flatMap(([, inventory]) =>
      inventoryRuntimeToolNames(inventory),
    ),
  );
  const executedTools = uniqueSorted(
    matrix.filter((entry) => entry.executed).map((entry) => entry.tool),
  );
  const completedTools = uniqueSorted(
    matrix
      .filter(
        (entry) =>
          entry.executed &&
          entry.status === "completed" &&
          entry.success !== false,
      )
      .map((entry) => entry.tool),
  );
  const allScenarioTargets = allScenarioTargetTools();
  const coveredVisibleRuntimeTools = visibleToolNames.filter((tool) =>
    allScenarioTargets.includes(tool),
  );
  const uncoveredVisibleRuntimeTools = visibleToolNames.filter(
    (tool) => !allScenarioTargets.includes(tool),
  );
  const optionalUncoveredVisibleRuntimeTools =
    uncoveredVisibleRuntimeTools.filter((tool) =>
      OPTIONAL_RUNTIME_COVERAGE_TOOLS.includes(tool),
    );
  const requiredUncoveredVisibleRuntimeTools =
    uncoveredVisibleRuntimeTools.filter(
      (tool) => !OPTIONAL_RUNTIME_COVERAGE_TOOLS.includes(tool),
    );
  const extraScenarioToolsNotVisible = allScenarioTargets.filter(
    (tool) => !visibleToolNames.includes(tool),
  );

  return {
    runtimeToolCount: runtimeToolNames.length,
    visibleRuntimeToolCount: visibleToolNames.length,
    allScenarioTargetTools: allScenarioTargets,
    coveredVisibleRuntimeTools,
    uncoveredVisibleRuntimeTools,
    optionalUncoveredVisibleRuntimeTools,
    requiredUncoveredVisibleRuntimeTools,
    extraScenarioToolsNotVisible,
    incompleteBatchTargetTools: targetTools.filter(
      (tool) => !completedTools.includes(tool),
    ),
    targetToolsInInventory: Object.fromEntries(
      targetTools.map((tool) => [tool, runtimeToolNames.includes(tool)]),
    ),
    targetToolsVisibleInInventory: Object.fromEntries(
      targetTools.map((tool) => [tool, visibleToolNames.includes(tool)]),
    ),
    missingTargetToolsInInventory: targetTools.filter(
      (tool) => !runtimeToolNames.includes(tool),
    ),
    hiddenTargetToolsInInventory: targetTools.filter(
      (tool) =>
        runtimeToolNames.includes(tool) && !visibleToolNames.includes(tool),
    ),
    executedTargets: executedTools,
    completedTargets: completedTools,
  };
}

function pendingRequestsFromThreadRead(threadRead) {
  return Array.isArray(threadRead?.pending_requests)
    ? threadRead.pending_requests
    : Array.isArray(threadRead?.pendingRequests)
      ? threadRead.pendingRequests
      : [];
}

function normalizeActionType(requestType) {
  const normalized = String(requestType || "").toLowerCase();
  if (normalized.includes("tool") || normalized.includes("approval")) {
    return "tool_confirmation";
  }
  if (normalized.includes("ask") || normalized.includes("user")) {
    return "ask_user";
  }
  return "elicitation";
}

function buildActionScope(sessionId, request, fallbackTurnId) {
  const scope =
    request?.scope && typeof request.scope === "object" ? request.scope : {};
  return {
    session_id: scope.session_id || scope.sessionId || sessionId,
    thread_id:
      scope.thread_id ||
      scope.threadId ||
      request?.thread_id ||
      request?.threadId ||
      sessionId,
    turn_id:
      scope.turn_id ||
      scope.turnId ||
      request?.turn_id ||
      request?.turnId ||
      fallbackTurnId,
  };
}

function buildUserResponseForRequest(request) {
  const payload = request?.payload;
  const questions = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.questions)
      ? payload.questions
      : [];
  const firstQuestion = questions[0] || {};
  const firstOption = Array.isArray(firstQuestion.options)
    ? firstQuestion.options[0]
    : null;
  const answer =
    String(firstOption?.value || firstOption?.label || "Continue").trim() ||
    "Continue";
  const questionText = String(
    firstQuestion.question || request?.title || "",
  ).trim();
  const header = String(firstQuestion.header || "").trim();
  const answers = {};
  if (questionText) {
    answers[questionText] = answer;
  }
  if (header) {
    answers[header] = answer;
  }
  return {
    answer,
    answers,
    Runtime: answer,
  };
}

async function respondPendingRequests(
  options,
  sessionId,
  eventName,
  turnId,
  threadRead,
  seenRequestIds,
) {
  const pendingRequests = pendingRequestsFromThreadRead(threadRead).filter(
    (request) =>
      String(request?.status || "pending").toLowerCase() === "pending",
  );
  let respondedCount = 0;
  for (const request of pendingRequests) {
    const requestId = String(request?.id || "").trim();
    if (!requestId || seenRequestIds.has(requestId)) {
      continue;
    }
    seenRequestIds.add(requestId);
    const actionType = normalizeActionType(
      request?.request_type || request?.requestType,
    );
    const userData = buildUserResponseForRequest(request);
    await respondAgentSessionActionCurrent(options, {
      sessionId,
      requestId,
      actionType,
      confirmed: true,
      response: JSON.stringify(userData),
      userData,
      eventName,
      actionScope: buildActionScope(sessionId, request, turnId),
    });
    respondedCount += 1;
    console.log(
      `${LOG_PREFIX} responded_pending_request id=${requestId} type=${actionType}`,
    );
  }
  return respondedCount;
}

function mergeScenarioTurnMetadata(scenario, targetTools) {
  const scenarioMetadata =
    scenario?.turnMetadata && typeof scenario.turnMetadata === "object"
      ? scenario.turnMetadata
      : {};
  const scenarioHarness =
    scenarioMetadata?.harness && typeof scenarioMetadata.harness === "object"
      ? scenarioMetadata.harness
      : {};
  return {
    ...scenarioMetadata,
    tool_scope: {
      allowed_tools: targetTools,
    },
    harness: {
      ...scenarioHarness,
      access_mode: "full-access",
      skip_mcp_prewarm: scenarioHarness.skip_mcp_prewarm ?? true,
      runtime_tool_execution: {
        scenario_id: scenario.id,
        source: "smoke:agent-runtime-tool-execution",
        expected_tools: targetTools,
      },
    },
  };
}

async function collectToolInventories(options, metadata) {
  const baseRequest = {
    caller: "assistant",
    metadata,
  };
  const [core, workbench, browserAssist] = await Promise.all([
    readToolInventoryCurrent(options, baseRequest),
    readToolInventoryCurrent(options, {
      ...baseRequest,
      workbench: true,
    }),
    readToolInventoryCurrent(options, {
      ...baseRequest,
      browserAssist: true,
    }),
  ]);

  return { core, workbench, browserAssist };
}

async function readToolInventoryCurrent(options, request) {
  const response = await invokeAppServerMethod(
    options,
    APP_SERVER_METHOD_AGENT_SESSION_TOOL_INVENTORY_READ,
    request,
  );
  const inventory = response?.inventory;
  assertSmoke(
    inventory && typeof inventory === "object" && !Array.isArray(inventory),
    "agentSession/toolInventory/read 未返回工具库存",
  );
  return inventory;
}

async function resolveWorkspaceRoot(options, workspace, workspaceId) {
  const directRoot = workspaceRootFromDefaultProject(workspace);
  if (directRoot) {
    return directRoot;
  }

  const ensured = await invokeDevBridge(options, "workspace_ensure_ready", {
    id: workspaceId,
  });
  const ensuredRoot = workspaceRootFromDefaultProject(ensured);
  assertSmoke(ensuredRoot, "默认 workspace 缺少 rootPath");
  return ensuredRoot;
}

async function waitForRuntimeCompletion(
  options,
  sessionId,
  fixture,
  expectedRequestCount,
  targetTools,
  eventName,
  turnId,
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  const seenRequestIds = new Set();

  while (Date.now() - startedAt < options.timeoutMs) {
    const [threadRead, sessionDetail] = await Promise.all([
      readAgentRuntimeThreadCurrent(options, sessionId, { historyLimit: 80 }),
      readAgentSessionDetailCurrent(options, sessionId, { historyLimit: 80 }),
    ]);
    const matrix = buildToolExecutionMatrix(threadRead, targetTools);
    const turnObserved = runtimeTurnObserved(threadRead, fixture);
    const pendingRequests = pendingRequestsFromThreadRead(threadRead).filter(
      (request) =>
        String(request?.status || "pending").toLowerCase() === "pending",
    );
    lastSnapshot = {
      threadRead: summarizeThreadRead(threadRead),
      session: {
        id: sessionDetail?.id || null,
        executionStrategy:
          sessionDetail?.execution_strategy ||
          sessionDetail?.executionStrategy ||
          null,
        itemCount: Array.isArray(sessionDetail?.items)
          ? sessionDetail.items.length
          : 0,
        turnCount: Array.isArray(sessionDetail?.turns)
          ? sessionDetail.turns.length
          : 0,
      },
      fixtureChatRequestCount: fixtureChatRequestCount(fixture.requests),
      expectedFixtureChatRequestCount: expectedRequestCount,
      turnObserved,
      pendingRequestCount: pendingRequests.length,
      completedToolCount: matrix.filter(
        (entry) => entry.status === "completed" && entry.success !== false,
      ).length,
      matrix,
    };

    const pendingResponseCount = await respondPendingRequests(
      options,
      sessionId,
      eventName,
      turnId,
      threadRead,
      seenRequestIds,
    );
    if (pendingResponseCount > 0 || pendingRequests.length > 0) {
      await sleep(options.intervalMs);
      continue;
    }

    if (turnObserved && threadSettled(threadRead)) {
      return { threadRead, sessionDetail, snapshot: lastSnapshot };
    }

    await sleep(options.intervalMs);
  }

  throw new Error(
    `${LOG_PREFIX} wait runtime completion timeout; last=${JSON.stringify(lastSnapshot)}`,
  );
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

async function runSmoke(options) {
  console.log(`${LOG_PREFIX} stage=health`);
  const health = await waitForHealth(options);

  if (options.allowLiveProvider) {
    assertLiveProviderSmokeAllowed({
      allowed: options.allowLiveProvider,
      scriptName: "smoke:agent-runtime-tool-execution",
    });
  }

  console.log(`${LOG_PREFIX} stage=workspace`);
  const workspace = await invokeDevBridge(
    options,
    "get_or_create_default_project",
    {},
    30_000,
  );
  const workspaceId = workspaceIdFromDefaultProject(workspace);
  assertSmoke(workspaceId, "默认 workspace 缺少 id");
  const workspaceRoot = await resolveWorkspaceRoot(
    options,
    workspace,
    workspaceId,
  );
  const fixtureFiles = prepareFixtureFiles(workspaceRoot);
  const scenario = buildBatchScenario(options.batch, fixtureFiles);
  const scriptedResponses = scenario.scriptedResponses;
  const targetTools = scenario.targetTools;
  const turnMetadata = mergeScenarioTurnMetadata(scenario, targetTools);

  console.log(`${LOG_PREFIX} stage=tool-inventory`);
  const inventories = await collectToolInventories(options, turnMetadata);
  const inventorySummaries = Object.fromEntries(
    Object.entries(inventories).map(([key, inventory]) => [
      key,
      summarizeInventory(inventory),
    ]),
  );
  let runtimeContext = null;
  if (typeof scenario.prepareAfterInventory === "function") {
    console.log(`${LOG_PREFIX} stage=scenario-prepare`);
    runtimeContext = await scenario.prepareAfterInventory(options, {
      workspaceId,
      workspaceRoot,
      turnMetadata,
    });
  }

  console.log(`${LOG_PREFIX} stage=fixture-provider`);
  const fixture = await startOpenAiCompatibleFixtureServer({
    deferScriptedToolCallsUntilAvailable:
      scenario.deferScriptedToolCallsUntilAvailable === true ||
      options.batch === "web-tools",
    scriptedResponses,
  });
  console.log(
    `${LOG_PREFIX} provider=localhost-fixture baseUrl=${fixture.baseUrl}`,
  );

  try {
    console.log(`${LOG_PREFIX} stage=session`);
    const sessionId = await createAgentSessionCurrent(options, {
      workspaceId,
      title: `Tool execution fixture ${scenario.id} ${new Date().toISOString()}`,
      executionStrategy: "react",
      metadata: {
        harness: {
          hiddenFromUserRecents: true,
          source: "smoke:agent-runtime-tool-execution",
          scenarioId: scenario.id,
        },
      },
    });
    assertSmoke(sessionId, "agentSession/start 未返回 sessionId");

    await updateAgentSessionRuntimeCurrent(options, {
      sessionId,
      provider: fixture.provider,
      executionStrategy: "react",
    });

    console.log(`${LOG_PREFIX} stage=submit-turn session=${sessionId}`);
    const turnId = `tool-execution-${Date.now()}-${process.pid}`;
    const eventName = `app_server_tool_execution_${turnId}`;
    await startAgentSessionTurnCurrent(options, {
      sessionId,
      workspaceId,
      message: scenario.prompt,
      eventName,
      turnId,
      turnConfig: {
        providerPreference: fixture.provider.providerPreference,
        modelPreference: fixture.provider.modelPreference,
        providerConfig: fixture.provider.providerConfig,
        approvalPolicy: "never",
        sandboxPolicy: "danger-full-access",
        metadata: turnMetadata,
      },
      skipPreSubmitResume: true,
    });

    console.log(`${LOG_PREFIX} stage=wait-runtime`);
    const finalState = await waitForRuntimeCompletion(
      options,
      sessionId,
      fixture,
      scenario.expectedFixtureRequestCount || scriptedResponses.length,
      targetTools,
      eventName,
      turnId,
    );

    console.log(`${LOG_PREFIX} stage=export-evidence-pack`);
    const evidencePack = await exportAgentSessionEvidencePackCurrent(options, {
      sessionId,
      turnId,
    });

    const providerRequests = providerRequestSummaries(fixture.requests);
    const matrix = buildToolExecutionMatrix(finalState.threadRead, targetTools);
    const providerToolPresence = allTargetToolsPresentInProviderRequests(
      providerRequests,
      targetTools,
    );
    const completedTools = allTargetToolsCompleted(matrix);
    const inventoryTargetTools = Array.isArray(
      scenario.initialInventoryTargetTools,
    )
      ? scenario.initialInventoryTargetTools
      : targetTools;
    const inventoryCoverage = buildInventoryCoverage(
      inventories,
      matrix,
      inventoryTargetTools,
    );
    const firstUserRequestText = requestUserMessagesText(
      fixture.requests[0]?.body,
    );
    const detailText = JSON.stringify(finalState.sessionDetail || {});
    const evidencePackText = JSON.stringify(evidencePack || {});
    const evidenceToolPresence = evidencePackToolPresence(
      evidencePackText,
      targetTools,
    );
    const toolStageMatrix = buildToolStageMatrix({
      targetTools,
      inventoryCoverage,
      providerToolPresence,
      matrix,
      evidenceToolPresence,
      evidenceToolPresenceRequired:
        scenario.requiresEvidenceToolPresence !== false,
    });
    const toolOutputText = matrix
      .map((entry) => `${entry.tool}:${entry.outputPreview}`)
      .join("\n");
    const scenarioAssertions = scenario.buildAssertions({
      evidencePackText,
      fixtureFiles,
      providerRequests,
      runtimeContext,
      toolOutputText,
    });
    const assertions = {
      fixtureProviderUsed:
        fixtureChatRequestCount(fixture.requests) >= scriptedResponses.length,
      naturalLanguageWithoutAtCommand:
        firstUserRequestText.includes(scenario.promptNeedle) &&
        !firstUserRequestText.trimStart().startsWith("@") &&
        !firstUserRequestText.includes("code_command"),
      allTargetToolsPresentInProviderRequests:
        Object.values(providerToolPresence).every(Boolean),
      allTargetToolsPresentInRuntimeInventory:
        scenario.requiresTargetToolsInInitialInventory === false ||
        inventoryCoverage.missingTargetToolsInInventory.length === 0,
      allTargetToolsCompleted: Object.values(completedTools).every(Boolean),
      sessionDefaultedToReact:
        finalState.sessionDetail?.execution_strategy === "react" ||
        finalState.sessionDetail?.executionStrategy === "react",
      currentAgentRuntimeObserved:
        detailText.includes('"execution_strategy":"react"') ||
        detailText.includes('"executionStrategy":"react"'),
      evidencePackExported: Boolean(evidencePack),
      ...scenarioAssertions,
    };

    const failedAssertions = Object.entries(assertions)
      .filter(([, passed]) => !passed)
      .map(([key]) => key);

    const evidence = {
      schemaVersion: "v1",
      scenarioId: scenario.id,
      status: failedAssertions.length > 0 ? "fail" : "pass",
      generatedAt: new Date().toISOString(),
      command: "smoke:agent-runtime-tool-execution",
      coverage: {
        usesCurrentRuntimeSubmitTurn: true,
        usesLocalhostFixtureProvider: true,
        failsWhenProviderRequestOmitsTargetTool: true,
        verifiesProviderRequestTools: true,
        verifiesRuntimeInventoryTools: true,
        verifiesRuntimeToolExecution: true,
        verifiesEvidencePack: true,
        usesCompatToolInventoryCommand: true,
        usesAppServerEvidenceExportCurrent: true,
        batchId: scenario.id,
        targetTools,
        initialInventoryTargetTools: inventoryTargetTools,
        allScenarioTargetTools: inventoryCoverage.allScenarioTargetTools,
        coveredVisibleRuntimeTools:
          inventoryCoverage.coveredVisibleRuntimeTools,
        uncoveredVisibleRuntimeTools:
          inventoryCoverage.uncoveredVisibleRuntimeTools,
        requiredUncoveredVisibleRuntimeTools:
          inventoryCoverage.requiredUncoveredVisibleRuntimeTools,
        optionalUncoveredVisibleRuntimeTools:
          inventoryCoverage.optionalUncoveredVisibleRuntimeTools,
        extraScenarioToolsNotVisible:
          inventoryCoverage.extraScenarioToolsNotVisible,
        incompleteBatchTargetTools:
          inventoryCoverage.incompleteBatchTargetTools,
      },
      devBridge: {
        healthStatus: health?.status || null,
      },
      workspace: {
        id: workspaceId,
        root: workspaceRoot,
        fixtureRoot: FIXTURE_ROOT,
      },
      provider: {
        providerPreference: fixture.provider.providerPreference,
        providerName: fixture.provider.providerName,
        modelPreference: fixture.provider.modelPreference,
        source: fixture.provider.source,
        requests: providerRequests,
        targetToolPresence: providerToolPresence,
      },
      inventory: {
        summaries: inventorySummaries,
        coverage: inventoryCoverage,
      },
      scenarioRuntimeContext: runtimeContext,
      runtime: {
        sessionId,
        turnId,
        eventName,
        finalSnapshot: finalState.snapshot,
        matrix,
        toolStageMatrix,
        completedTools,
      },
      files: {
        editPath: EDIT_RELATIVE_PATH,
        writePath: WRITE_RELATIVE_PATH,
        grepPath: GREP_RELATIVE_PATH,
        imagePath: IMAGE_RELATIVE_PATH,
        notebookPath: NOTEBOOK_RELATIVE_PATH,
        audioPath: AUDIO_RELATIVE_PATH,
      },
      evidencePack: summarizeEvidencePack(evidencePack),
      assertions,
      failedAssertions,
    };

    if (options.write) {
      const writtenPath = writeEvidenceWithFallback(options.output, evidence);
      console.log(`${LOG_PREFIX} evidence=${writtenPath}`);
    }

    for (const key of failedAssertions) {
      assertSmoke(false, `断言失败: ${key}`);
    }

    console.log(`${LOG_PREFIX} pass session=${sessionId}`);
    return evidence;
  } finally {
    if (typeof scenario.cleanup === "function") {
      await scenario.cleanup(options, runtimeContext).catch((error) => {
        console.warn(
          `${LOG_PREFIX} scenario cleanup failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }
    await fixture.close();
  }
}

runSmoke(parseArgs(process.argv.slice(2))).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
