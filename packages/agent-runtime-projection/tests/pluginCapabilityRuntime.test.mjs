import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexPluginCapabilityRuntimeProjectionEvent,
  extractCodexPluginCapabilityRuntimeSnapshot,
} from "../dist/index.js";

const pluginRoot = "/tmp/repo/plugins/demo-plugin";

function validCatalog(overrides = {}) {
  return {
    generation: "cap-g2",
    installedPluginIds: ["sample-plugin"],
    skillNames: ["sample-plugin:deploy", "plan-work"],
    mcpServerNames: ["sample-mcp"],
    appToolNames: ["calendar.create_event"],
    provenanceIds: [
      "sample-plugin",
      "plugins~Plugin_00000000000000000000000000000000",
    ],
    ...overrides,
  };
}

function validInstall(overrides = {}) {
  return {
    pluginId: "sample-plugin",
    pluginName: "Sample Plugin",
    completed: true,
    userConfirmed: true,
    cacheRefreshed: true,
    wroteGlobalMcpConfig: false,
    skillNames: ["sample-plugin:deploy"],
    mcpServerNames: ["sample-mcp"],
    appToolNames: ["calendar.create_event"],
    ...overrides,
  };
}

function validFollowup(overrides = {}) {
  return {
    requestId: "followup-1",
    turnId: "turn-followup",
    wentThroughTurnStart: true,
    skillNames: ["sample-plugin:deploy"],
    mcpServerNames: ["sample-mcp"],
    appToolNames: ["calendar.create_event"],
    recommendationToolNames: [],
    ...overrides,
  };
}

test("plugin capability runtime projects read/list/install into catalog and followup request", () => {
  const event = buildCodexPluginCapabilityRuntimeProjectionEvent(
    {
      pluginList: [
        {
          id: "demo-plugin@codex-curated",
          name: "demo-plugin",
          root: pluginRoot,
          source: "codex-curated",
          installed: false,
          enabled: false,
          interface: {
            composerIcon: `${pluginRoot}/assets/icon.png`,
            logo: `${pluginRoot}/assets/logo.png`,
            screenshots: [
              `${pluginRoot}/assets/screenshot1.png`,
              `${pluginRoot}/assets/screenshot2.png`,
            ],
          },
        },
      ],
      skillReads: [
        {
          remoteMarketplaceName: "openai-curated-remote",
          remotePluginId: "plugins~Plugin_00000000000000000000000000000000",
          skillName: "plan-work",
          status: "ENABLED",
          contents: "# Plan Work\n\nUse Linear issues to create a plan.",
        },
      ],
      installResults: [validInstall()],
      capabilityCatalog: validCatalog(),
      followupRequests: [validFollowup()],
    },
    {
      sequence: 101,
      sessionId: "session-plugin",
      threadId: "thread-plugin",
      turnId: "turn-followup",
      timestamp: "2026-07-09T00:00:00.000Z",
    },
  );

  assert.deepEqual(
    {
      type: event.type,
      sourceType: event.sourceType,
      sequence: event.sequence,
      sessionId: event.sessionId,
      threadId: event.threadId,
      turnId: event.turnId,
      owner: event.owner,
      scope: event.scope,
      surface: event.surface,
      persistence: event.persistence,
      control: event.control,
      runtimeStatus: event.runtimeStatus,
    },
    {
      type: "context.changed",
      sourceType: "plugin_capability_runtime_projection",
      sequence: 101,
      sessionId: "session-plugin",
      threadId: "thread-plugin",
      turnId: "turn-followup",
      owner: "context",
      scope: "thread",
      surface: "timeline_evidence",
      persistence: "snapshot",
      control: "open_detail",
      runtimeStatus: "completed",
    },
  );
  assert.equal(event.payload.catalogStable, true);
  assert.equal(event.payload.followupStable, true);
  assert.deepEqual(event.payload.installedPluginIds, ["sample-plugin"]);
  assert.deepEqual(event.payload.mcpServerNames, ["sample-mcp"]);
  assert.deepEqual(event.payload.skillNames, ["sample-plugin:deploy", "plan-work"]);
  assert.deepEqual(event.payload.validationIssues, []);
});

test("plugin capability runtime fails closed when plugin list keeps relative asset paths", () => {
  const snapshot = extractCodexPluginCapabilityRuntimeSnapshot({
    pluginList: [
      {
        id: "demo-plugin@codex-curated",
        root: pluginRoot,
        interface: {
          composerIcon: "./assets/icon.png",
        },
      },
    ],
    capabilityCatalog: validCatalog(),
  });

  assert.deepEqual(snapshot.plugins[0].interfaceAssetPaths, [
    {
      field: "composerIcon",
      path: "./assets/icon.png",
      absolute: false,
      withinPluginRoot: false,
    },
  ]);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    [
      "plugin_interface_asset_not_absolute",
      "plugin_interface_asset_outside_root",
    ],
  );
});

test("plugin capability runtime fails closed when enabled remote skill read loses contents", () => {
  const snapshot = extractCodexPluginCapabilityRuntimeSnapshot({
    skillReads: [
      {
        remoteMarketplaceName: "openai-curated-remote",
        remotePluginId: "plugins~Plugin_00000000000000000000000000000000",
        skillName: "plan-work",
        status: "ENABLED",
      },
    ],
    capabilityCatalog: validCatalog(),
  });

  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    ["plugin_read_missing_skill_contents"],
  );
});

test("plugin capability runtime rejects plugin install that writes bundled MCP to global config", () => {
  const snapshot = extractCodexPluginCapabilityRuntimeSnapshot({
    installResults: [validInstall({ wroteGlobalMcpConfig: true })],
    capabilityCatalog: validCatalog(),
    followupRequests: [validFollowup()],
  });

  assert.equal(snapshot.catalogStable, true);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    ["install_wrote_global_mcp_config"],
  );
});

test("plugin capability runtime requires refreshed catalog before followup requests", () => {
  const snapshot = extractCodexPluginCapabilityRuntimeSnapshot({
    installResults: [
      validInstall({
        cacheRefreshed: false,
      }),
    ],
    capabilityCatalog: validCatalog({
      generation: undefined,
      installedPluginIds: [],
      skillNames: [],
      mcpServerNames: [],
      provenanceIds: [],
    }),
    followupRequests: [validFollowup()],
  });

  assert.equal(snapshot.catalogStable, false);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    [
      "capability_catalog_missing_generation",
      "capability_missing_provenance",
      "remote_install_cache_not_refreshed",
      "installed_plugin_missing_from_catalog",
      "installed_mcp_missing_from_catalog",
      "installed_skill_missing_from_catalog",
    ],
  );
});

test("plugin capability runtime requires followup requests to use turn/start and refreshed tools", () => {
  const snapshot = extractCodexPluginCapabilityRuntimeSnapshot({
    installResults: [validInstall()],
    capabilityCatalog: validCatalog(),
    followupRequests: [
      validFollowup({
        wentThroughTurnStart: false,
        skillNames: [],
        mcpServerNames: [],
        recommendationToolNames: ["request_plugin_install"],
      }),
    ],
  });

  assert.equal(snapshot.followupStable, false);
  assert.deepEqual(
    snapshot.validationIssues.map((item) => item.code),
    [
      "followup_request_bypassed_turn_start",
      "followup_request_missing_installed_mcp",
      "followup_request_missing_installed_skill",
      "stale_plugin_install_recommendation_present",
    ],
  );
});
