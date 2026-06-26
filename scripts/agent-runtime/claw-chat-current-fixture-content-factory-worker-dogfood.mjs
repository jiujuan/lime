import fs from "node:fs";
import path from "node:path";
import {
  APP_SERVER_METHOD_AGENT_APP_INSTALLED_SAVE,
  APP_SERVER_METHOD_SESSION_TURN_START,
  CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_ACTION_KEY,
  CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_TASK_ID,
  CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_TURN_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { invokeAppServerFromPage } from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson } from "./claw-chat-current-fixture-utils.mjs";

const CONTENT_FACTORY_APP_ID = "content-factory-app";
const IMAGE_SET_OBJECT_ID = "image-set-1";

export async function saveContentFactoryWorkerInstalledState(
  page,
  requestLog,
) {
  const state = buildContentFactoryInstalledState();
  const response = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_AGENT_APP_INSTALLED_SAVE,
    { state },
    requestLog,
  );

  return sanitizeJson({
    appId: response.result?.appId ?? response.result?.app_id ?? null,
    sourceKind:
      response.result?.identity?.sourceKind ??
      response.result?.identity?.source_kind ??
      null,
    sourceUri:
      response.result?.identity?.sourceUri ??
      response.result?.identity?.source_uri ??
      null,
    packageHash:
      response.result?.identity?.packageHash ??
      response.result?.identity?.package_hash ??
      null,
    disabled: response.result?.disabled ?? null,
  });
}

export async function runContentFactoryWorkerDogfoodTurn({
  page,
  workspace,
  requestLog,
}) {
  const response = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_TURN_START,
    {
      sessionId: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      turnId: CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_TURN_ID,
      input: {
        text: "通过已安装内容工厂 worker 重新生成配图组。",
      },
      runtimeOptions: {
        metadata: buildProductProfileWorkerMetadata(workspace),
      },
      queueIfBusy: false,
      skipPreSubmitResume: true,
    },
    requestLog,
  );

  const eventTypes = response.messages
    .filter((message) => message?.method === "agentSession/event")
    .map((message) => message?.params?.event?.type)
    .filter(Boolean);
  const turn =
    response.result?.turn && typeof response.result.turn === "object"
      ? response.result.turn
      : {};

  return sanitizeJson({
    method: APP_SERVER_METHOD_SESSION_TURN_START,
    turnId: turn.turnId ?? turn.turn_id ?? null,
    turnStatus: turn.status ?? null,
    taskId: CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_TASK_ID,
    eventTypes,
    completed: eventTypes.includes("turn.completed"),
    artifactSnapshotEmitted: eventTypes.includes("artifact.snapshot"),
    runtimeErrorEmitted: eventTypes.includes("runtime.error"),
  });
}

function buildContentFactoryInstalledState() {
  const fixtureRoot = contentFactoryFixtureRoot();
  const manifest = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, "content-factory-app.json"), "utf8"),
  );
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: "agent-app.installed-state.v1",
    appId: CONTENT_FACTORY_APP_ID,
    installMode: "runtime_backed",
    disabled: false,
    identity: {
      appId: CONTENT_FACTORY_APP_ID,
      appVersion: manifest.version,
      sourceKind: "local_folder",
      sourceUri: fixtureRoot,
      packageHash: "sha256:content-factory-local-fixture",
      manifestHash: "sha256:content-factory-local-manifest-fixture",
      loadedAt: timestamp,
    },
    manifest,
    setup: {},
    installedAt: timestamp,
    updatedAt: timestamp,
  };
}

function buildProductProfileWorkerMetadata(workspace) {
  return {
    agent_app: {
      source: "right_surface_product_profile",
      app_id: CONTENT_FACTORY_APP_ID,
      session_id: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
      workspace_id: workspace.workspaceId,
      product_profile_action: {
        key: CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_ACTION_KEY,
        intent: "regenerate",
        risk: "write",
        task_kind: "content.image.generate",
        prompt: "Regenerate the image set with two worker-generated candidates.",
        object: {
          app_id: CONTENT_FACTORY_APP_ID,
          kind: "imageGenerationSet",
          id: IMAGE_SET_OBJECT_ID,
          session_id: CONTENT_FACTORY_PRODUCT_PROFILE_SESSION_ID,
          artifact_ids: [CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID],
          preview_artifact_id: CONTENT_FACTORY_PRODUCT_PROFILE_IMAGE_ARTIFACT_ID,
        },
      },
    },
    right_surface: {
      surface_kind: "productProfile",
      source: "product_workspace",
      action_key: CONTENT_FACTORY_PRODUCT_PROFILE_WORKER_ACTION_KEY,
    },
  };
}

function contentFactoryFixtureRoot() {
  return path.resolve(process.cwd(), "src/features/agent-app/fixtures");
}
