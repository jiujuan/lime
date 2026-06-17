import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SOURCE_THREAD_ID = "local-history-click-through-thread";
export const IMPORTED_USER_TEXT = "请运行测试并修复失败";
export const IMPORTED_REASONING_TEXT =
  "I need to inspect the test failure first.";
export const IMPORTED_ASSISTANT_TEXT = "已完成修复。";
export const IMPORTED_ATTACHMENT_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
export const CONTINUE_USER_TEXT = "在这个导入会话里继续总结下一步";
export const CONTINUE_ASSISTANT_TEXT =
  "这条导入会话已经恢复了原始问题、执行记录、文件变更和只读确认记录。下一步可以继续复核测试结果，或基于当前会话继续安排后续修改。";
export const LEGACY_CONTINUATION_SENTINEL = "CODEX_IMPORT_CLICK_THROUGH_DONE";
export const IMPORTED_WORKSPACE_DIRNAME = "imported-local-history";
export const IMPORTED_PREVIEW_MARKDOWN_FILE = "imported-preview.md";
export const IMPORTED_PREVIEW_HTML_FILE = "imported-preview.html";
export const IMPORTED_PREVIEW_DOCX_FILE = "imported-preview.docx";
export const IMPORTED_PREVIEW_MARKDOWN_TEXT =
  "导入会话 Markdown 预览内容：文件打开链路进入 Artifact Workbench。";
export const IMPORTED_PREVIEW_HTML_TEXT =
  "导入会话 HTML 预览内容：iframe 或独立窗口应可显示。";
export const IMPORTED_PREVIEW_DOCX_TEXT =
  "导入会话 DOCX 预览内容：中文不能乱码，也不能显示 ZIP 噪音。";
export let IMPORTED_CWD = "";
export const REQUIRED_BACKEND_METHODS = [
  "conversationImport/source/scan",
  "conversationImport/thread/preview",
  "conversationImport/thread/commit",
  "agentSession/read",
  "agentSession/turn/start",
];

export function createClickThroughFixtureRuntimeEnv() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "local-history-import-click-through-"),
  );
  const home = path.join(tempRoot, "home");
  const xdgDataHome = path.join(tempRoot, "xdg-data");
  const localAppData = path.join(tempRoot, "local-app-data");
  const roamingAppData = path.join(tempRoot, "roaming-app-data");
  const electronUserDataDir = path.join(tempRoot, "electron-user-data");
  const sourceRoot = path.join(tempRoot, "local-history-home");
  const sessionsDir = path.join(sourceRoot, "sessions");
  const workspaceRoot = path.join(tempRoot, "workspace");
  const importedCwd = path.join(workspaceRoot, IMPORTED_WORKSPACE_DIRNAME);
  const docsDir = path.join(importedCwd, "docs");
  const backendPath = path.join(tempRoot, "local-history-import-backend.mjs");
  const backendLedgerPath = path.join(
    tempRoot,
    "local-history-import-backend.jsonl",
  );
  const rolloutPath = path.join(
    sessionsDir,
    `rollout-${SOURCE_THREAD_ID}.jsonl`,
  );
  const sessionIndexPath = path.join(sourceRoot, "session_index.jsonl");

  for (const dir of [
    home,
    xdgDataHome,
    localAppData,
    roamingAppData,
    electronUserDataDir,
    sourceRoot,
    sessionsDir,
    workspaceRoot,
    importedCwd,
    docsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  IMPORTED_CWD = importedCwd;

  fs.writeFileSync(backendLedgerPath, "");
  writeImportedPreviewFiles(docsDir);
  writeFixtureBackend(backendPath);
  writeSourceRolloutFixture(rolloutPath, importedCwd);
  writeSessionIndexFixture(sessionIndexPath, rolloutPath, importedCwd);

  return {
    tempRoot,
    electronUserDataDir,
    sourceRoot,
    importedCwd,
    rolloutPath,
    sessionIndexPath,
    backendPath,
    backendLedgerPath,
    env: {
      ...process.env,
      HOME: home,
      XDG_DATA_HOME: xdgDataHome,
      APPDATA: roamingAppData,
      LOCALAPPDATA: localAppData,
      CODEX_HOME: sourceRoot,
    },
  };
}

function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function writeImportedPreviewFiles(docsDir) {
  fs.writeFileSync(
    path.join(docsDir, IMPORTED_PREVIEW_MARKDOWN_FILE),
    `# 导入会话文件预览\n\n${IMPORTED_PREVIEW_MARKDOWN_TEXT}\n`,
  );
  fs.writeFileSync(
    path.join(docsDir, IMPORTED_PREVIEW_HTML_FILE),
    `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>导入会话 HTML 预览</title>
  </head>
  <body>
    <main>
      <h1>导入会话 HTML 预览</h1>
      <p>${IMPORTED_PREVIEW_HTML_TEXT}</p>
    </main>
  </body>
</html>
`,
  );
  writeMinimalDocx(
    path.join(docsDir, IMPORTED_PREVIEW_DOCX_FILE),
    IMPORTED_PREVIEW_DOCX_TEXT,
  );
}

function writeMinimalDocx(filePath, text) {
  writeZipFile(filePath, [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
`,
    },
    {
      name: "word/document.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${escapeXmlText(text)}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>
`,
    },
  ]);
}

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function resolveZipDosTimestamp() {
  const year = 2026;
  const month = 1;
  const day = 1;
  const hour = 0;
  const minute = 0;
  const second = 0;
  return {
    time: (hour << 11) | (minute << 5) | Math.floor(second / 2),
    date: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function writeZipFile(filePath, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const timestamp = resolveZipDosTimestamp();

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(timestamp.time, 10);
    localHeader.writeUInt16LE(timestamp.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(timestamp.time, 12);
    centralHeader.writeUInt16LE(timestamp.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);

    offset += localHeader.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectoryOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(centralDirectoryOffset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(
    filePath,
    Buffer.concat([...localParts, centralDirectory, end]),
  );
}

function writeFixtureBackend(backendPath) {
  fs.writeFileSync(
    backendPath,
    `#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";

const ledgerPath = process.argv[2];
const input = JSON.parse(readFileSync(0, "utf8"));

if (ledgerPath) {
  appendFileSync(ledgerPath, JSON.stringify({
    kind: input.kind,
    request: input.request,
    recordedAt: new Date().toISOString()
  }) + "\\n");
}

if (input.kind === "turnStart") {
  console.log(JSON.stringify({
    events: [
      {
        type: "message.delta",
        payload: {
          backend: "local-history-import-click-through-fixture",
          text: "${CONTINUE_ASSISTANT_TEXT}"
        }
      },
      {
        type: "turn.completed",
        payload: {
          status: "completed",
          text: "${CONTINUE_ASSISTANT_TEXT}"
        }
      }
    ]
  }));
  process.exit(0);
}

console.log(JSON.stringify({ events: [] }));
`,
    { mode: 0o755 },
  );
}

function writeSessionIndexFixture(sessionIndexPath, rolloutPath, importedCwd) {
  const line = {
    id: SOURCE_THREAD_ID,
    thread_name: "本地历史导入点击闭环",
    title: "本地历史导入点击闭环",
    created_at: "2026-06-16T00:00:00.000Z",
    updated_at: "2026-06-16T00:00:09.000Z",
    cwd: importedCwd,
    path: rolloutPath,
  };
  fs.writeFileSync(sessionIndexPath, `${JSON.stringify(line)}\n`);
}

function writeSourceRolloutFixture(rolloutPath, importedCwd) {
  const markdownPath = path.join(
    importedCwd,
    "docs",
    IMPORTED_PREVIEW_MARKDOWN_FILE,
  );
  const htmlPath = path.join(importedCwd, "docs", IMPORTED_PREVIEW_HTML_FILE);
  const docxPath = path.join(importedCwd, "docs", IMPORTED_PREVIEW_DOCX_FILE);
  const lines = [
    {
      timestamp: "2026-06-16T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: SOURCE_THREAD_ID,
        timestamp: "2026-06-16T00:00:00.000Z",
        cwd: importedCwd,
        source: "cli",
        model_provider: "openai",
        model: "gpt-5.5",
        reasoning_effort: "high",
        approval_policy: "on-request",
        sandbox_policy: "workspace-write",
        memory_mode: "enabled",
      },
    },
    {
      timestamp: "2026-06-16T00:00:01.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: `## My request for Codex: ${IMPORTED_USER_TEXT}`,
        images: [IMPORTED_ATTACHMENT_DATA_URL],
        image_details: ["low"],
      },
    },
    {
      timestamp: "2026-06-16T00:00:02.000Z",
      type: "response_item",
      payload: {
        type: "reasoning",
        content: [{ type: "reasoning_text", text: IMPORTED_REASONING_TEXT }],
      },
    },
    {
      timestamp: "2026-06-16T00:00:03.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "call_exec",
        call_id: "call_exec",
        name: "exec_command",
        arguments: JSON.stringify({
          cmd: "npm test",
          workdir: importedCwd,
        }),
      },
    },
    {
      timestamp: "2026-06-16T00:00:04.000Z",
      type: "event_msg",
      payload: {
        type: "exec_approval_request",
        call_id: "call_exec",
        command: ["npm", "test"],
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_exec",
        output: "Exit code: 0\\nWall time: 0 seconds\\nOutput:\\nok",
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.100Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "call_read_md",
        call_id: "call_read_md",
        name: "read_file",
        arguments: JSON.stringify({ path: markdownPath }),
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.200Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_read_md",
        output: IMPORTED_PREVIEW_MARKDOWN_TEXT,
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.300Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "call_read_html",
        call_id: "call_read_html",
        name: "read_file",
        arguments: JSON.stringify({ path: htmlPath }),
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.400Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_read_html",
        output: IMPORTED_PREVIEW_HTML_TEXT,
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.500Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "call_read_docx",
        call_id: "call_read_docx",
        name: "read_file",
        arguments: JSON.stringify({ path: docxPath }),
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.600Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_read_docx",
        output: IMPORTED_PREVIEW_DOCX_TEXT,
      },
    },
    {
      timestamp: "2026-06-16T00:00:06.000Z",
      type: "response_item",
      payload: {
        type: "web_search_call",
        id: "call_search",
        call_id: "call_search",
        action: "search_query",
        query: "Lime history import",
      },
    },
    {
      timestamp: "2026-06-16T00:00:07.000Z",
      type: "event_msg",
      payload: {
        type: "web_search_end",
        call_id: "call_search",
        action: "search_query",
        query: "Lime history import",
      },
    },
    {
      timestamp: "2026-06-16T00:00:08.000Z",
      type: "event_msg",
      payload: {
        type: "patch_apply_end",
        call_id: "call_patch",
        success: true,
        changes: {
          [path.join(importedCwd, "src", "lib.rs")]: { type: "modify" },
        },
      },
    },
    {
      timestamp: "2026-06-16T00:00:09.000Z",
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: IMPORTED_ASSISTANT_TEXT,
      },
    },
  ];
  fs.writeFileSync(
    rolloutPath,
    `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`,
  );
}

export function readBackendLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) {
    return [];
  }
  return fs
    .readFileSync(ledgerPath, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
