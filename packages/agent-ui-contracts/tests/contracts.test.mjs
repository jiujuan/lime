import assert from "node:assert/strict";
import test from "node:test";

import {} from "../dist/index.js";

test("agent ui contracts package builds a runtime-free module", () => {
  assert.equal(true, true);
});

test("agent ui contracts publish adapter and runtime type declarations", async () => {
  const declarations = await import("../dist/index.js");

  assert.deepEqual(Object.keys(declarations), []);

  const typeDeclarations = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8"),
  );

  assert.match(typeDeclarations, /export type AgentUiEventClass/);
  assert.match(typeDeclarations, /export interface AgentUiProjectionEvent/);
  assert.match(typeDeclarations, /export interface AgentRuntimeExecutionEvent/);
  assert.match(typeDeclarations, /export interface AgentUiProjectionState/);
});
