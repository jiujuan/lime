import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("retired thread rollback projection cannot return", () => {
  assert.equal(
    existsSync(resolve(packageRoot, "src/threadRollbackProjection.ts")),
    false,
  );
  assert.equal(
    existsSync(resolve(packageRoot, "tests/threadRollbackProjection.test.mjs")),
    false,
  );

  const barrel = readFileSync(resolve(packageRoot, "src/index.ts"), "utf8");
  assert.equal(barrel.includes("threadRollbackProjection"), false);
});
