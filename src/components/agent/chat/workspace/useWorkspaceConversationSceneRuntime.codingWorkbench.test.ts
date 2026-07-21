import { describe, expect, it, vi } from "vitest";
import {
  createBaseParams,
  getRenderedSceneProps,
} from "./useWorkspaceConversationSceneRuntime.testFixtures";

describe("useWorkspaceConversationSceneRuntime coding workbench projection", () => {
  it("应向画布壳透传 workspaceView 头部语义", () => {
    const params = createBaseParams({
      settledWorkbenchArtifacts: [{ id: "artifact-1" }, { id: "artifact-2" }],
      taskFiles: [{ id: "task-1", name: "draft.md" }],
      projectRootPath: "/tmp/demo-project",
      workspacePathMissing: false,
      workspaceHealthError: false,
      threadRead: {
        thread_id: "thread-1",
        active_turn_id: "turn-1",
        pending_requests: [
          {
            id: "approval-command-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "tool_confirmation",
            status: "pending",
            title: "确认执行命令",
            payload: {
              command: "npm test",
            },
          },
        ],
      },
      submittedActionsInFlight: [
        {
          requestId: "approval-other",
          actionType: "tool_confirmation",
          status: "submitted",
        },
      ],
    });

    const sceneProps = getRenderedSceneProps(params);
    const workspaceView = sceneProps.canvasWorkbenchLayoutProps.workspaceView;

    expect(workspaceView?.title).toBe("项目工作区文件");
    expect(workspaceView?.tabLabel).toBe("文件");
    expect(workspaceView?.tabBadge).toBe("demo-project");
    expect(workspaceView?.tabBadgeTone).toBe("sky");
    expect(workspaceView?.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "workspace-root",
          label: "demo-project",
        }),
      ]),
    );
    expect(workspaceView?.summaryStats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "workspace-root",
          label: "工作区",
          value: "demo-project",
        }),
        expect.objectContaining({
          key: "workspace-binding",
          label: "目录状态",
          value: "已连接",
        }),
      ]),
    );
    expect(workspaceView?.panelCopy).toEqual(
      expect.objectContaining({
        unavailableText: "当前工作区路径不可用，暂时无法浏览项目文件。",
        emptyText: "当前会话没有绑定可浏览的工作区目录。",
        sectionEyebrow: "项目目录",
      }),
    );
  });

  it("右侧工作台应优先打开项目根，避免审查落到会话临时目录", () => {
    const params = createBaseParams({
      projectRootPath: "/tmp/project-record-root",
      canvasWorkbenchRootPath: "/tmp/session-working-dir",
    });

    const sceneProps = getRenderedSceneProps(params);

    expect(sceneProps.projectRootPath).toBe("/tmp/project-record-root");
    expect(sceneProps.canvasWorkbenchLayoutProps.workspaceRoot).toBe(
      "/tmp/project-record-root",
    );
    expect(sceneProps.canvasWorkbenchLayoutProps.workspaceView.tabBadge).toBe(
      "project-record-root",
    );
  });

  it("运行时输出和文件信号应启用工作台模式并透出输出/日志入口", async () => {
    const openChangedFile = vi.fn(async () => undefined);
    const handleSendFromEmptyState = vi.fn();
    const handlePermissionResponse = vi.fn();
    const params = createBaseParams({
      executionStrategy: "react",
      handleSendFromEmptyState,
      handlePermissionResponse,
      canvasScene: {
        ...createBaseParams().canvasScene,
        handleOpenCanvasWorkbenchPath: openChangedFile,
      },
      threadRead: {
        thread_id: "thread-1",
        active_turn_id: "turn-1",
        active_command_id: "command-npm-test",
        active_test_run_id: "test-unit",
        file_checkpoint_summary: {
          count: 2,
          latest_checkpoint: {
            checkpoint_id: "checkpoint-index",
            turn_id: "turn-1",
            path: "index.html",
            source: "runtime",
            updated_at: "2026-05-27T10:00:04.000Z",
            version_no: 2,
            title: "index.html",
            kind: "code",
            status: "completed",
            preview_text: "更新后的页面",
            snapshot_path: ".lime/artifacts/thread-1/index.v2.html",
            validation_issue_count: 0,
          },
        },
        commands: [
          {
            command_id: "command-npm-test",
            turn_id: "turn-1",
            status: "failed",
            command: "npm test",
            cwd: "demo-project",
            exit_code: 1,
            output_preview: "FAIL src/App.test.tsx\nExpected title",
          },
        ],
        tests: [
          {
            test_run_id: "test-unit",
            turn_id: "turn-1",
            status: "failed",
            command_id: "command-npm-test",
            suite: "unit",
            result: "failed",
            passed: 8,
            failed: 1,
          },
        ],
        artifacts: [
          {
            artifactRef: "artifact-index",
            eventId: "evt-file-index",
            sequence: 3,
            turnId: "turn-1",
            path: "index.html",
            title: "index.html",
            kind: "code_file",
            status: "completed",
            metadata: {
              previewText: "更新后的页面",
              checkpointRef: "index.html",
              artifactVersion: {
                versionNo: 2,
                snapshotPath: ".lime/artifacts/thread-1/index.v2.html",
              },
            },
          },
          {
            artifactRef: "artifact-app",
            eventId: "evt-file-app",
            sequence: 4,
            turnId: "turn-1",
            path: "src/App.tsx",
            title: "App.tsx",
            kind: "code_file",
            status: "running",
            metadata: {
              previewText: "export function App() {}",
            },
          },
        ],
        pending_requests: [
          {
            id: "approval-command-1",
            thread_id: "thread-1",
            turn_id: "turn-1",
            request_type: "tool_confirmation",
            status: "pending",
            title: "确认执行命令",
            payload: {
              command: "npm test",
            },
          },
        ],
      },
      submittedActionsInFlight: [
        {
          requestId: "approval-other",
          actionType: "tool_confirmation",
          status: "submitted",
        },
      ],
    });

    const sceneProps = getRenderedSceneProps(params);
    const canvasProps = sceneProps.canvasWorkbenchLayoutProps;

    expect(canvasProps.workbenchMode).toBe("coding");
    expect(canvasProps.outputView?.tabBadge).toBe("3");
    expect(canvasProps.outputView?.tabBadgeTone).toBe("rose");
    expect(typeof canvasProps.outputView?.renderPanel).toBe("function");
    expect(canvasProps.outputView?.leadContent).toBeUndefined();
    const outputPanel = canvasProps.outputView?.renderPanel?.() as any;
    expect(outputPanel.props.onRespondToAction).toBe(handlePermissionResponse);
    expect(typeof outputPanel.props.onSubmitRecoveryPrompt).toBe("function");
    expect(outputPanel.props.submittedActionsInFlight).toEqual([
      expect.objectContaining({ requestId: "approval-other" }),
    ]);
    expect(handleSendFromEmptyState).not.toHaveBeenCalled();
    await outputPanel.props.onSubmitRecoveryPrompt("请继续修复失败测试");
    expect(handleSendFromEmptyState).toHaveBeenCalledWith({
      textOverride: "请继续修复失败测试",
    });
    await outputPanel.props.onSubmitRecoveryPrompt("请带上下文继续修复", {
      schemaVersion: "coding-workbench-recovery/v1",
      failureKind: "test",
      sourceIds: {
        commandId: "command-npm-test",
        testRunId: "test-unit",
      },
      refs: {
        outputRefs: ["output://command-npm-test"],
        sourceEventIds: ["event-command-npm-test"],
      },
      relatedFiles: ["src/App.tsx"],
      latestCheckpointPath: "index.html",
      signals: [
        {
          kind: "test",
          id: "test-unit",
          title: "unit",
          sourceIds: {
            commandId: "command-npm-test",
            testRunId: "test-unit",
          },
          refs: {
            outputRefs: ["output://command-npm-test"],
            sourceEventIds: ["event-command-npm-test"],
          },
        },
      ],
    });
    expect(handleSendFromEmptyState).toHaveBeenLastCalledWith({
      textOverride: "请带上下文继续修复",
      sendOptions: {
        requestMetadata: {
          harness: {
            coding_workbench_recovery: expect.objectContaining({
              schemaVersion: "coding-workbench-recovery/v1",
              failureKind: "test",
              sourceIds: {
                commandId: "command-npm-test",
                testRunId: "test-unit",
              },
              refs: {
                outputRefs: ["output://command-npm-test"],
                sourceEventIds: ["event-command-npm-test"],
              },
              relatedFiles: ["src/App.tsx"],
              latestCheckpointPath: "index.html",
            }),
          },
        },
      },
    });
    expect(canvasProps.logView).not.toBe(canvasProps.sessionView);
    expect(canvasProps.logView?.tabLabel).toBe("日志");
    expect(canvasProps.logView?.title).toBe("运行日志");
    expect(typeof canvasProps.logView?.renderPanel).toBe("function");
    expect(canvasProps.changeView?.checkpointCount).toBe(2);
    expect(canvasProps.changeView?.latestCheckpointPath).toBe(
      ".lime/artifacts/thread-1/index.v2.html",
    );
    expect(canvasProps.changeView?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "evt-file-index",
          path: "index.html",
          displayName: "index.html",
          status: "completed",
          changeKind: "modified",
          checkpointPath: "index.html",
          checkpointLabel: "snapshot",
        }),
        expect.objectContaining({
          id: "evt-file-app",
          path: "src/App.tsx",
          displayName: "App.tsx",
          status: "in_progress",
          changeKind: "modified",
        }),
      ]),
    );
    canvasProps.changeView?.onOpenFile?.("/tmp/demo/index.html");
    expect(openChangedFile).toHaveBeenCalledWith("/tmp/demo/index.html");

    expect(handleSendFromEmptyState).toHaveBeenCalledTimes(2);
  });

  it("无运行时输出和文件信号时应保持默认画布工作台模式", () => {
    const sceneProps = getRenderedSceneProps(
      createBaseParams({
        executionStrategy: "react",
      }),
    );
    const canvasProps = sceneProps.canvasWorkbenchLayoutProps;

    expect(canvasProps.workbenchMode).toBe("default");
    expect(canvasProps.sessionView).toBeNull();
    expect(canvasProps.outputView).toBeNull();
    expect(canvasProps.logView).toBeNull();
    expect(canvasProps.changeView).toBeNull();
  });

  it("任务中心无运行时输出时仍应使用 coding 工作台 chrome 暴露审查入口", () => {
    const sceneProps = getRenderedSceneProps(
      createBaseParams({
        executionStrategy: "react",
        navbarContextVariant: "task-center",
      }),
    );
    const canvasProps = sceneProps.canvasWorkbenchLayoutProps;

    expect(canvasProps.workbenchMode).toBe("coding");
    expect(canvasProps.outputView).toBeNull();
    expect(canvasProps.logView).toBeNull();
    expect(canvasProps.changeView).toBeNull();
  });
});
