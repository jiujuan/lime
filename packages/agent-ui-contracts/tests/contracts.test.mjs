import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {} from "../dist/index.js";

test("agent ui contracts package builds a runtime-free module", () => {
  assert.equal(true, true);
});

test("agent ui contracts publish adapter and runtime type declarations", async () => {
  const declarations = await import("../dist/index.js");

  assert.deepEqual(Object.keys(declarations), []);

  const indexDeclarations = await readDeclaration("index");
  assert.equal(
    indexDeclarations,
    [
      'export type * from "./events";',
      'export type * from "./graph";',
      'export type * from "./messages";',
      'export type * from "./projection";',
      'export type * from "./runtime";',
      'export type * from "./timeline";',
      "",
    ].join("\n"),
  );

  const typeDeclarations = [
    await readDeclaration("events"),
    await readDeclaration("runtime"),
    await readDeclaration("projection"),
    await readDeclaration("messages"),
    await readDeclaration("timeline"),
    await readDeclaration("graph"),
  ].join("\n");

  assert.match(typeDeclarations, /export type AgentUiEventClass/);
  assert.match(typeDeclarations, /export interface AgentUiProjectionEvent/);
  assert.match(typeDeclarations, /export interface AgentRuntimeExecutionEvent/);
  assert.match(typeDeclarations, /export interface AgentUiProjectionState/);
  assert.match(typeDeclarations, /actions\?: AgentRuntimeActionProjection\[\]/);
});

async function readDeclaration(name) {
  return fs.readFile(new URL(`../dist/${name}.d.ts`, import.meta.url), "utf8");
}
