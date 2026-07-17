import assert from "node:assert/strict";
import { test } from "vitest";

import { createRuntimeRequest } from "../src/runtime-request.ts";

test("runtime request preserves websocket capability across current provider config inputs", () => {
  assert.deepEqual(
    createRuntimeRequest({
      providerConfig: {
        providerId: "codex",
        supportsWebsockets: true,
      },
    }),
    {
      providerConfig: {
        providerId: "codex",
        supportsWebsockets: true,
      },
    },
  );

  assert.deepEqual(
    createRuntimeRequest({
      providerConfig: {
        provider_id: "openai",
        supports_websockets: false,
      },
    }),
    {
      providerConfig: {
        providerId: "openai",
        supportsWebsockets: false,
      },
    },
  );
});

test("runtime request drops a non-boolean websocket capability", () => {
  assert.deepEqual(
    createRuntimeRequest({
      providerConfig: {
        providerId: "codex",
        supportsWebsockets: "true",
      },
    }),
    {
      providerConfig: {
        providerId: "codex",
      },
    },
  );
});
