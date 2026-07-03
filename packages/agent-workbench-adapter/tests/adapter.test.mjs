import assert from "node:assert/strict";
import test from "node:test";

import {
  agentWorkbenchSessionStatusLabel,
  buildAgentWorkbenchSessionStartRequest,
  buildAgentTurnStartPayload,
  hasAgentWorkbenchRuntimeFacts,
  projectAgentWorkbenchTaskView,
  resolveAgentWorkbenchIntentDescriptor,
  resolveAgentWorkbenchPermissionMode,
  resolveAgentWorkbenchSkills,
  resolveWorkbenchIntentCapabilityPolicy,
  resolveWorkbenchSubmitMode,
  summarizeAgentRuntimeFacts,
} from "../dist/index.js";

test("resolves default workbench intent policy", () => {
  const policy = resolveWorkbenchIntentCapabilityPolicy({
    intentId: "imageGenerate",
    selectedSkillSlugs: ["image-prompt"],
  });

  assert.equal(policy.taskKind, "content.image-generate");
  assert.deepEqual(policy.requiredCapabilities, ["lime.capability.image.generate"]);
  assert.deepEqual(policy.capabilityHints, ["lime.capability.cover.generate"]);
  assert.deepEqual(policy.selectedSkillSlugs, ["image-prompt"]);
});

test("resolves workbench intent descriptors with product-facing routing metadata", () => {
  const descriptor = resolveAgentWorkbenchIntentDescriptor({
    intentId: "articleScript",
    selectedSkillSlugs: ["copywriting-master"],
  });

  assert.equal(descriptor.title, "脚本生成协作");
  assert.equal(descriptor.purpose, "article");
  assert.equal(descriptor.outputPurpose, "脚本草稿");
  assert.equal(descriptor.taskKind, "content.script-generate");
  assert.deepEqual(descriptor.recommendedSkillSlugs, [
    "copywriting-master",
    "moments-copywriter",
    "ip-knowledge-base-builder",
  ]);
  assert.equal(descriptor.policy.metadata.intentId, "articleScript");
  assert.equal(descriptor.policy.metadata.taskKind, "content.script-generate");
});

test("resolves submit mode without owning React state", () => {
  assert.equal(resolveWorkbenchSubmitMode({ view: "entry", workspaceReady: false, prompt: "hi" }), "disabled");
  assert.equal(resolveWorkbenchSubmitMode({ view: "entry", workspaceReady: true, prompt: "hi" }), "start");
  assert.equal(resolveWorkbenchSubmitMode({ view: "thread", workspaceReady: true, hasActiveSession: true, prompt: "hi" }), "send");
  assert.equal(resolveWorkbenchSubmitMode({ view: "thread", workspaceReady: true, hasActiveSession: true, busy: true, prompt: "hi" }), "queue");
});

test("maps workbench access presets to runtime permission mode", () => {
  assert.equal(resolveAgentWorkbenchPermissionMode("ask"), "ask");
  assert.equal(resolveAgentWorkbenchPermissionMode("custom"), "ask");
  assert.equal(resolveAgentWorkbenchPermissionMode("auto"), "safe");
  assert.equal(resolveAgentWorkbenchPermissionMode("full"), "allow-all");
  assert.equal(resolveAgentWorkbenchPermissionMode("allow-all"), "allow-all");
});

test("selects visible, recommended, and run skills without React state", () => {
  const selection = resolveAgentWorkbenchSkills({
    intent: resolveAgentWorkbenchIntentDescriptor({ intentId: "article" }),
    enabledSkillKeys: new Set([
      "builtin:copywriting-master",
      "builtin:article-typesetting-master",
      "builtin:asset-research",
    ]),
    selectedSkillKeys: ["builtin:asset-research"],
    skills: [
      { slug: "asset-research", source: "builtin", valid: true, metadata: { name: "asset-research" } },
      { slug: "copywriting-master", source: "builtin", valid: true, metadata: { name: "copywriting-master" } },
      { slug: "article-typesetting-master", source: "builtin", valid: true, metadata: { name: "article-typesetting-master" } },
      { slug: "invalid", source: "builtin", valid: false, metadata: { name: "invalid" } },
    ],
  });

  assert.deepEqual(selection.visibleSkills.map((skill) => skill.slug), [
    "article-typesetting-master",
    "copywriting-master",
    "asset-research",
  ]);
  assert.deepEqual(selection.selectedSkillKeys, ["builtin:asset-research"]);
  assert.deepEqual(selection.recommendedSkills.map((skill) => skill.slug), [
    "article-typesetting-master",
    "copywriting-master",
  ]);
  assert.deepEqual(selection.runSkillRefs, [
    { slug: "article-typesetting-master", source: "builtin" },
    { slug: "copywriting-master", source: "builtin" },
    { slug: "asset-research", source: "builtin" },
  ]);
});

test("summarizes runtime facts from projection-like read model", () => {
  const summary = summarizeAgentRuntimeFacts({
    sourceCount: 2,
    events: [
      { surface: "tool", source: { eventClass: "tool.started" } },
      { eventClass: "model.delta" },
    ],
    pendingActions: [{}],
    artifactRefs: ["artifact-1"],
    evidenceRefs: ["evidence-1"],
    taskRefs: ["task-1"],
  }, { artifactCount: 1 });

  assert.deepEqual(summary, {
    sourceCount: 2,
    toolCount: 1,
    pendingActionCount: 1,
    artifactCount: 2,
    evidenceCount: 1,
    taskCount: 1,
    hasRuntimeFacts: true,
  });
});

test("detects visible workbench runtime facts without React state", () => {
  assert.equal(hasAgentWorkbenchRuntimeFacts({ events: [] }), false);
  assert.equal(hasAgentWorkbenchRuntimeFacts({ sourceCount: 2 }), false);
  assert.equal(hasAgentWorkbenchRuntimeFacts({
    visibleEvents: [
      { surface: "tool", status: "completed", source: { eventClass: "tool.result" } },
    ],
  }), true);
  assert.equal(hasAgentWorkbenchRuntimeFacts({
    visibleEvents: [
      { status: "blocked", eventClass: "model.blocked" },
    ],
  }), true);
  assert.equal(hasAgentWorkbenchRuntimeFacts({
    visibleEvents: [
      { surface: "human-action", source: { eventClass: "action.required" } },
    ],
  }), true);
  assert.equal(hasAgentWorkbenchRuntimeFacts({
    events: [
      { surface: "artifact", source: { eventClass: "artifact.changed" } },
    ],
  }), true);
  assert.equal(hasAgentWorkbenchRuntimeFacts({
    taskRefs: ["task-1"],
  }), false);
  assert.equal(hasAgentWorkbenchRuntimeFacts({
    events: [
      { source: { eventClass: "subagent.started" } },
    ],
  }), true);
});

test("maps workbench session status labels", () => {
  assert.equal(agentWorkbenchSessionStatusLabel("waiting-user"), "待补充");
  assert.equal(agentWorkbenchSessionStatusLabel("draft-created"), "已出草稿");
  assert.equal(agentWorkbenchSessionStatusLabel("active"), "协作中");
  assert.equal(agentWorkbenchSessionStatusLabel(undefined), "待启动");
});

test("projects workbench task facts without React state", () => {
  const view = projectAgentWorkbenchTaskView({
    session: {
      title: "主图脚本协作",
      status: "waiting-user",
      inputSourceIds: ["source-1"],
    },
    readModel: {
      sourceCount: 1,
      events: [
        { surface: "tool", source: { eventClass: "tool.started" } },
      ],
      pendingActions: [{}],
      artifactRefs: ["artifact-1"],
      evidenceRefs: ["evidence-1"],
      taskRefs: ["task-1"],
    },
    inputAttachmentCount: 2,
  });

  assert.equal(view.taskTitle, "主图脚本协作");
  assert.equal(view.statusLabel, "待补充");
  assert.equal(view.sourceCount, 4);
  assert.equal(view.toolCount, 1);
  assert.equal(view.pendingActionCount, 1);
  assert.equal(view.artifactCount, 1);
  assert.equal(view.evidenceCount, 1);
  assert.equal(view.taskCount, 1);
  assert.equal(view.shouldShowRuntimePanel, true);
  assert.deepEqual(view.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.state, checkpoint.count]), [
    ["input", "done", 4],
    ["artifact", "done", 1],
    ["human-action", "active", 1],
    ["evidence", "done", 1],
  ]);
});

test("projects source-only workbench task without opening runtime panel", () => {
  const view = projectAgentWorkbenchTaskView({
    session: {
      title: "普通寒暄",
      status: "waiting-user",
      inputSourceIds: ["source-1"],
    },
    readModel: {
      sourceCount: 1,
      events: [
        { surface: "runtime-status", source: { eventClass: "model.delta" } },
        { surface: "runtime-status", source: { eventClass: "snapshot.updated" } },
      ],
    },
  });

  assert.equal(view.hasRuntimeFacts, true);
  assert.equal(view.sourceCount, 2);
  assert.equal(view.shouldShowRuntimePanel, false);
});

test("projects empty workbench task as idle task surface", () => {
  const view = projectAgentWorkbenchTaskView({
    fallbackTitle: "内容协作",
  });

  assert.equal(view.taskTitle, "内容协作");
  assert.equal(view.statusLabel, "待启动");
  assert.equal(view.hasRuntimeFacts, false);
  assert.equal(view.shouldShowRuntimePanel, false);
  assert.deepEqual(view.checkpoints.map((checkpoint) => checkpoint.state), ["idle", "idle", "idle", "idle"]);
});

test("builds a lime.agent turn payload with capability policy", () => {
  const payload = buildAgentTurnStartPayload({
    pluginId: "content-studio",
    workspacePath: "/tmp/workspace",
    prompt: "生成配图",
    capabilityId: "content.draft.generate",
    modelId: "gpt-4.1-mini",
    providerPreference: "openai",
    selectedSkillSlugs: ["copywriting"],
    requiredCapabilities: ["image_generation"],
    capabilityHints: ["cover"],
    metadata: { agentSurface: "agents" },
  });

  assert.equal(payload.runtimeOptions.capabilityId, "content.draft.generate");
  assert.equal(payload.runtimeOptions.modelPreference, "gpt-4.1-mini");
  assert.deepEqual(payload.runtimeOptions.requiredCapabilities, ["lime.capability.image.generate"]);
  assert.deepEqual(payload.metadata.capabilityHints, ["lime.capability.cover.generate"]);
  assert.equal(payload.toolPolicy.metadata.capabilityContracts.length, 2);
});

test("builds a product session start request from workbench intent", () => {
  const request = buildAgentWorkbenchSessionStartRequest({
    intentId: "imageGenerate",
    prompt: "生成一张主图",
    selectedSkillSlugs: ["image-prompt"],
    permissionPreset: "full",
  });

  assert.equal(request.title, "图片 Prompt 协作");
  assert.equal(request.purpose, "image");
  assert.equal(request.userIntent, "生成一张主图");
  assert.equal(request.agentTaskKind, "content.image-generate");
  assert.equal(request.agentIntentId, "imageGenerate");
  assert.equal(request.permissionMode, "allow-all");
  assert.deepEqual(request.requiredCapabilities, ["lime.capability.image.generate"]);
  assert.deepEqual(request.capabilityHints, ["lime.capability.cover.generate"]);
  assert.deepEqual(request.selectedSkillSlugs, ["image-prompt"]);
});
