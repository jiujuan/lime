import { describe, expect, it } from "vitest";

import {
  SETTINGS_GATE_A_STATE_ERROR_MARKER,
  buildSettingsGateAStateBridgeResponse,
  readSettingsGateAStateRequest,
} from "./project-gate-settings-a-states.mjs";

function payload(message) {
  return {
    cmd: "app_server_handle_json_lines",
    args: { request: { lines: [JSON.stringify(message)] } },
  };
}

describe("project Gate SETTINGS-01 component-state fixture", () => {
  it("only intercepts archived thread/list reads", () => {
    const archived = {
      id: 7,
      method: "thread/list",
      params: { archived: true },
    };

    expect(readSettingsGateAStateRequest(payload(archived))).toEqual(archived);
    expect(
      readSettingsGateAStateRequest(
        payload({ id: 8, method: "thread/list", params: { archived: false } }),
      ),
    ).toBeNull();
    expect(
      readSettingsGateAStateRequest(
        payload({ id: 9, method: "thread/list", params: { archivedOnly: true } }),
      ),
    ).toBeNull();
    expect(
      readSettingsGateAStateRequest(
        payload({ id: 10, method: "thread/read", params: {} }),
      ),
    ).toBeNull();
  });

  it("ignores non-App-Server and malformed bridge payloads", () => {
    expect(readSettingsGateAStateRequest({ cmd: "get_config" })).toBeNull();
    expect(
      readSettingsGateAStateRequest({
        cmd: "app_server_handle_json_lines",
        args: { request: { lines: ["not-json"] } },
      }),
    ).toBeNull();
  });

  it("preserves JSON-RPC request identity in result and error responses", () => {
    const request = { id: 42 };
    const resultEnvelope = JSON.parse(
      buildSettingsGateAStateBridgeResponse(request, {
        result: { data: [], nextCursor: null },
      }),
    );
    const errorEnvelope = JSON.parse(
      buildSettingsGateAStateBridgeResponse(request, {
        error: { code: -32000, message: SETTINGS_GATE_A_STATE_ERROR_MARKER },
      }),
    );

    expect(JSON.parse(resultEnvelope.result.lines[0])).toEqual({
      jsonrpc: "2.0",
      id: 42,
      result: { data: [], nextCursor: null },
    });
    expect(JSON.parse(errorEnvelope.result.lines[0])).toEqual({
      jsonrpc: "2.0",
      id: 42,
      error: { code: -32000, message: SETTINGS_GATE_A_STATE_ERROR_MARKER },
    });
  });
});
