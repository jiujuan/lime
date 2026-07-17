import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BACKGROUND_IMPORT_FILLER_COMMAND_COUNT = 180;

export const SOURCE_THREAD_ID = "local-history-click-through-thread";
export const IMPORTED_USER_TEXT = "请运行测试并修复失败";
export const IMPORTED_REASONING_TEXT =
  "I need to inspect the test failure first.";
export const IMPORTED_ASSISTANT_SUMMARY_TEXT = "已完成修复。";
export const IMPORTED_MARKDOWN_HEADING_TEXT = "导入选购指南";
export const IMPORTED_ASSISTANT_MARKDOWN_TEXT = [
  "导入选购指南###",
  "####如果历史会话来自本地 CLI，优先保持工具过程和最终正文穿插。",
  "**推荐 做法 **：继续沿用同一套过程渲染",
  "**理由 **：导入态和实时态不应分裂成两套 UI。",
  "对比表：",
  "| 场景 | 过程 | 正文 |",
  "| --- | --- | --- |",
  "| 导入会话 | WebSearch 可见 | Markdown 正常渲染 |",
].join("\n");
export const IMPORTED_ASSISTANT_TEXT = `${IMPORTED_ASSISTANT_SUMMARY_TEXT}\n${IMPORTED_ASSISTANT_MARKDOWN_TEXT}`;
export const IMPORTED_WEB_SEARCH_TITLE = "Lime Codex Import Rendering Source";
export const IMPORTED_WEB_SEARCH_QUERY = "Lime history import rendering";
export const IMPORTED_WEB_SEARCH_URL =
  "https://example.com/lime-codex-import-rendering";
export const IMPORTED_WEB_SEARCH_SOURCE_LABEL =
  "example.com/lime-codex-import-rendering";
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
export const IMPORTED_PREVIEW_XLSX_FILE = "imported-preview.xlsx";
export const IMPORTED_PREVIEW_PPTX_FILE = "imported-preview.pptx";
export const IMPORTED_PREVIEW_PDF_FILE = "imported-preview.pdf";
export const IMPORTED_PREVIEW_MARKDOWN_TEXT =
  "导入会话 Markdown 预览内容：文件打开链路进入 Artifact Workbench。";
export const IMPORTED_PREVIEW_HTML_TEXT =
  "导入会话 HTML 预览内容：iframe 或独立窗口应可显示。";
export const IMPORTED_PREVIEW_DOCX_TEXT =
  "导入会话 DOCX 预览内容：中文不能乱码，也不能显示 ZIP 噪音。";
export const IMPORTED_PREVIEW_XLSX_TEXT =
  "导入会话 XLSX 预览内容：表格文本应进入文档预览。";
export const IMPORTED_PREVIEW_PPTX_TEXT =
  "导入会话 PPTX 预览内容：幻灯片文本应进入文档预览。";
export const IMPORTED_PREVIEW_PDF_TEXT =
  "导入会话 PDF 预览内容：可解析文本流应进入文档预览。";
export let IMPORTED_CWD = "";
export const REQUIRED_BACKEND_METHODS = [
  "conversationImport/source/scan",
  "conversationImport/thread/preview",
  "conversationImport/thread/commit",
  "conversationImport/job/read",
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
  writeMinimalXlsx(
    path.join(docsDir, IMPORTED_PREVIEW_XLSX_FILE),
    IMPORTED_PREVIEW_XLSX_TEXT,
  );
  writeMinimalPptx(
    path.join(docsDir, IMPORTED_PREVIEW_PPTX_FILE),
    IMPORTED_PREVIEW_PPTX_TEXT,
  );
  writeMinimalPdf(
    path.join(docsDir, IMPORTED_PREVIEW_PDF_FILE),
    IMPORTED_PREVIEW_PDF_TEXT,
  );
}

function writeMinimalPdf(filePath, text) {
  fs.writeFileSync(
    filePath,
    `%PDF-1.4
1 0 obj
<< /Length ${Buffer.byteLength(`BT\n(${text}) Tj\nET`, "utf8")} >>
stream
BT
(${text}) Tj
ET
endstream
endobj
%%EOF
`,
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

function writeMinimalXlsx(filePath, text) {
  writeZipFile(filePath, [
    {
      name: "xl/sharedStrings.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>${escapeXmlText(text)}</t></si>
</sst>
`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
    </row>
  </sheetData>
</worksheet>
`,
    },
  ]);
}

function writeMinimalPptx(filePath, text) {
  writeZipFile(filePath, [
    {
      name: "ppt/slides/slide1.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>${escapeXmlText(text)}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>
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
  const xlsxPath = path.join(importedCwd, "docs", IMPORTED_PREVIEW_XLSX_FILE);
  const pptxPath = path.join(importedCwd, "docs", IMPORTED_PREVIEW_PPTX_FILE);
  const pdfPath = path.join(importedCwd, "docs", IMPORTED_PREVIEW_PDF_FILE);
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
      timestamp: "2026-06-16T00:00:05.700Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "call_read_xlsx",
        call_id: "call_read_xlsx",
        name: "read_file",
        arguments: JSON.stringify({ path: xlsxPath }),
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.800Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_read_xlsx",
        output: IMPORTED_PREVIEW_XLSX_TEXT,
      },
    },
    {
      timestamp: "2026-06-16T00:00:05.900Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "call_read_pptx",
        call_id: "call_read_pptx",
        name: "read_file",
        arguments: JSON.stringify({ path: pptxPath }),
      },
    },
    {
      timestamp: "2026-06-16T00:00:06.000Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_read_pptx",
        output: IMPORTED_PREVIEW_PPTX_TEXT,
      },
    },
    {
      timestamp: "2026-06-16T00:00:06.100Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "call_read_pdf",
        call_id: "call_read_pdf",
        name: "read_file",
        arguments: JSON.stringify({ path: pdfPath }),
      },
    },
    {
      timestamp: "2026-06-16T00:00:06.200Z",
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call_read_pdf",
        output: IMPORTED_PREVIEW_PDF_TEXT,
      },
    },
    {
      timestamp: "2026-06-16T00:00:07.000Z",
      type: "response_item",
      payload: {
        type: "web_search_call",
        id: "call_search",
        call_id: "call_search",
        action: {
          type: "search",
          query: IMPORTED_WEB_SEARCH_QUERY,
          queries: [IMPORTED_WEB_SEARCH_QUERY],
        },
      },
    },
    {
      timestamp: "2026-06-16T00:00:08.000Z",
      type: "event_msg",
      payload: {
        type: "web_search_end",
        call_id: "call_search",
        query: IMPORTED_WEB_SEARCH_QUERY,
        action: {
          type: "search",
          query: IMPORTED_WEB_SEARCH_QUERY,
          queries: [IMPORTED_WEB_SEARCH_QUERY],
        },
        results: [
          {
            title: "Help",
            url: "https://help.yahoo.com/kb/search-for-desktop",
            snippet: "Yahoo search help navigation",
          },
          {
            title: "Sign In",
            url: "https://login.yahoo.com/?src=search",
            snippet: "Yahoo sign in navigation",
          },
          {
            title: "Yahoo Scout",
            url: "https://scout.yahoo.com/search?q=lime",
            snippet: "Yahoo assistant navigation",
          },
          {
            title: IMPORTED_WEB_SEARCH_TITLE,
            url: IMPORTED_WEB_SEARCH_URL,
            snippet:
              "Imported Codex history source used to verify unified rendering",
          },
        ],
      },
    },
    {
      timestamp: "2026-06-16T00:00:09.000Z",
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
      timestamp: "2026-06-16T00:00:10.000Z",
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: IMPORTED_ASSISTANT_TEXT,
      },
    },
  ];
  const backgroundImportFiller = Array.from(
    { length: BACKGROUND_IMPORT_FILLER_COMMAND_COUNT },
    (_, index) => {
      const callId = `call_background_import_${index}`;
      return [
        {
          timestamp: "2026-06-16T00:00:09.100Z",
          type: "response_item",
          payload: {
            type: "function_call",
            id: callId,
            call_id: callId,
            name: "exec_command",
            arguments: JSON.stringify({
              cmd: `printf background-import-${index}`,
              workdir: importedCwd,
            }),
          },
        },
        {
          timestamp: "2026-06-16T00:00:09.200Z",
          type: "response_item",
          payload: {
            type: "function_call_output",
            call_id: callId,
            output: "Exit code: 0\\nWall time: 0 seconds\\nOutput:\\nok",
          },
        },
      ];
    },
  ).flat();
  const filePreviewStartIndex = lines.findIndex(
    (line) => line.payload?.call_id === "call_read_md",
  );
  if (filePreviewStartIndex < 0) {
    throw new Error("click-through fixture is missing call_read_md");
  }
  lines.splice(filePreviewStartIndex, 0, ...backgroundImportFiller);
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
