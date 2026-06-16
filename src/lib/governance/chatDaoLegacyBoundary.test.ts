import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const CHAT_DAO_SOURCE = "lime-rs/crates/core/src/database/dao/chat.rs";

function readChatDaoSource(): string {
  return readFileSync(join(REPO_ROOT, CHAT_DAO_SOURCE), "utf8");
}

function expectCfgTestBoundary(source: string, declaration: string): void {
  expect(source).toMatch(
    new RegExp(`#\\[cfg\\(test\\)\\][\\s\\S]{0,240}${declaration}`),
  );
}

describe("ChatDao legacy agent_messages boundary", () => {
  it("应只在测试编译图保留旧消息模型和 API", () => {
    const source = readChatDaoSource();

    for (const structName of ["ChatMessage", "ChatSessionDetail"]) {
      expectCfgTestBoundary(source, `\\bpub\\s+struct\\s+${structName}\\b`);
    }

    for (const methodName of [
      "list_sessions",
      "add_message",
      "get_messages",
      "get_message_count",
      "delete_messages",
      "get_session_detail",
    ]) {
      expectCfgTestBoundary(source, `\\bpub\\s+fn\\s+${methodName}\\s*\\(`);
    }

    expectCfgTestBoundary(source, "\\bfn\\s+map_message_row\\s*\\(");
  });

  it("应保留会话元数据读取在生产编译图", () => {
    const source = readChatDaoSource();

    expect(source).toMatch(/pub\s+fn\s+get_session\s*\(/);
    expect(source).not.toMatch(
      /#\[cfg\(test\)\][\s\S]{0,240}pub\s+fn\s+get_session\s*\(/,
    );
  });
});
