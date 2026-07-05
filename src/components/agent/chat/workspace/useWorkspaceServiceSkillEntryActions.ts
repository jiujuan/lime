import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { siteGetAdapterLaunchReadiness } from "@/lib/webview-api";
import { createAutomationJob } from "@/lib/api/automation";
import { recordAutomationJobAgentUiProjection } from "../projection/automationJobAgentUiProjection";
import { createContent, listProjects, type Project } from "@/lib/api/project";
import {
  type AutomationJobDialogInitialValues,
  type AutomationJobDialogSubmit,
} from "@/components/settings-v2/system/automation/AutomationJobDialog";
import { normalizeAutomationThreadLineage } from "@/components/settings-v2/system/automation/automationThreadLineage";
import type {
  A2UIFormData,
  A2UIResponse,
} from "@/components/workspace/a2ui/types";
import type { BrowserRuntimePageParams, Page, PageParams } from "@/types/page";
import type { ChatToolPreferences } from "../utils/chatToolPreferences";
import type { CreationMode } from "../components/types";
import type { PendingA2UISource } from "../types";
import { normalizeProjectId } from "../utils/topicProjectResolution";
import {
  resolveWorkspaceEntry,
  type WorkspaceEntryPayload,
} from "../workspaceEntry";
import {
  composeServiceSkillPrompt,
  validateServiceSkillSlotValues,
} from "../service-skills/promptComposer";
import { supportsServiceSkillLocalAutomation } from "../service-skills/automationDraft";
import { recordServiceSkillAutomationLink } from "../service-skills/automationLinkStorage";
import {
  buildServiceSkillLaunchA2UIResponse,
  readServiceSkillLaunchSlotValuesFromFormData,
} from "../service-skills/serviceSkillLaunchA2UI";
import { buildServiceSkillWorkspaceSeed } from "../service-skills/workspaceLaunch";
import {
  buildSiteLaunchBlockedMessage,
  buildServiceSkillClawLaunchContext,
  buildServiceSkillClawLaunchRequestMetadata,
  buildServiceSkillSiteCapabilitySaveTitle,
  composeServiceSkillClawLaunchPrompt,
  isServiceSkillExecutableAsSiteAdapter,
  isSiteLaunchReadinessReady,
  resolveServiceSkillSiteCapabilityExecution,
  type ResolvedServiceSkillSiteCapabilityExecution,
} from "../service-skills/siteCapabilityBinding";
import type { AutoMatchedSiteSkill } from "../service-skills/autoMatchSiteSkill";
import type { CreationReplayMetadata } from "../utils/creationReplayMetadata";
import type {
  RecordServiceSkillUsageInput,
  ServiceSkillHomeItem,
  ServiceSkillSlotValues,
} from "../service-skills/types";
import type { TeamDefinition } from "../utils/teamDefinitions";
import { attachSelectedTeamToRequestMetadata } from "../utils/teamRequestMetadata";
import {
  buildFallbackAutomationWorkspace,
  buildServiceSkillAutomationSetupState,
  buildServiceSkillAutomationSubmitRequest,
  buildServiceSkillSelectionPlan,
  getWorkspaceServiceSkillErrorMessage,
  normalizeWorkspaceServiceSkillOptionalText,
  type PendingServiceSkillAutomationLaunch,
  type PendingServiceSkillLaunchInputState,
  prioritizeAutomationWorkspaces,
  resolveServiceSkillLaunchUserInput,
  type ServiceSkillSelectionOptions,
  shouldCreateServiceSkillAutomationContent,
  siteSkillRequiresProject,
} from "./workspaceServiceSkillEntryActionsViewModel";

interface ServiceSkillLaunchOptions {
  launchUserInput?: string | null;
}

interface UseWorkspaceServiceSkillEntryActionsParams {
  activeTheme: string;
  creationMode: CreationMode;
  projectId?: string | null;
  contentId?: string | null;
  sessionId?: string | null;
  threadId?: string | null;
  ensureSessionForThreadLineage?: (options?: {
    skipSessionRestore?: boolean;
    skipSessionStartHooks?: boolean;
  }) => Promise<string | null>;
  input: string;
  chatToolPreferences: ChatToolPreferences;
  creationReplay?: CreationReplayMetadata;
  preferredTeamPresetId?: string | null;
  selectedTeam?: TeamDefinition | null;
  selectedTeamLabel?: string | null;
  selectedTeamSummary?: string | null;
  onNavigate?: (page: Page, params?: PageParams) => void;
  recordServiceSkillUsage: (input: RecordServiceSkillUsageInput) => void;
}

export function useWorkspaceServiceSkillEntryActions({
  activeTheme,
  creationMode,
  projectId,
  contentId,
  sessionId,
  threadId,
  ensureSessionForThreadLineage,
  input,
  chatToolPreferences,
  creationReplay,
  preferredTeamPresetId,
  selectedTeam,
  selectedTeamLabel,
  selectedTeamSummary,
  onNavigate,
  recordServiceSkillUsage,
}: UseWorkspaceServiceSkillEntryActionsParams) {
  const { t } = useTranslation("settings");
  const [automationDialogOpen, setAutomationDialogOpen] = useState(false);
  const [automationDialogInitialValues, setAutomationDialogInitialValues] =
    useState<AutomationJobDialogInitialValues | null>(null);
  const [automationWorkspaces, setAutomationWorkspaces] = useState<Project[]>(
    [],
  );
  const [automationJobSaving, setAutomationJobSaving] = useState(false);
  const [pendingServiceSkillAutomation, setPendingServiceSkillAutomation] =
    useState<PendingServiceSkillAutomationLaunch | null>(null);
  const [pendingServiceSkillLaunchInput, setPendingServiceSkillLaunchInput] =
    useState<PendingServiceSkillLaunchInputState | null>(null);
  const serviceSkillLaunchRequestCountRef = useRef(0);

  const currentProjectId = normalizeProjectId(projectId);
  const currentContentId = contentId?.trim() || null;
  const resolveAutomationThreadLineage = useCallback(async () => {
    const currentLineage = normalizeAutomationThreadLineage({
      sessionId,
      threadId: threadId ?? sessionId,
    });
    if (currentLineage) {
      return currentLineage;
    }

    const ensuredSessionId =
      (await ensureSessionForThreadLineage?.())?.trim() || null;
    if (!ensuredSessionId) {
      return null;
    }

    return normalizeAutomationThreadLineage({
      sessionId: ensuredSessionId,
      threadId: ensuredSessionId,
    });
  }, [ensureSessionForThreadLineage, sessionId, threadId]);

  const navigateToServiceSkillWorkspace = useCallback(
    (payload: WorkspaceEntryPayload): boolean => {
      const payloadWithSelectedTeamMetadata: WorkspaceEntryPayload = {
        ...payload,
        initialRequestMetadata: attachSelectedTeamToRequestMetadata(
          payload.initialRequestMetadata,
          {
            preferredTeamPresetId,
            selectedTeam,
            selectedTeamLabel,
            selectedTeamSummary,
          },
        ),
        initialAutoSendRequestMetadata: attachSelectedTeamToRequestMetadata(
          payload.initialAutoSendRequestMetadata,
          {
            preferredTeamPresetId,
            selectedTeam,
            selectedTeamLabel,
            selectedTeamSummary,
          },
        ),
      };
      const resolved = resolveWorkspaceEntry({
        projectId: payload.projectId ?? currentProjectId,
        activeTheme,
        creationMode,
        defaultToolPreferences: chatToolPreferences,
        payload: payloadWithSelectedTeamMetadata,
      });

      if (!resolved.ok) {
        if (resolved.reason === "missing_project") {
          toast.error("缺少项目工作区，请先选择项目后再启动技能。");
          return false;
        }
        toast.error("技能缺少可执行内容，请先补齐参数后重试。");
        return false;
      }

      if (!onNavigate) {
        toast.error("当前入口暂不支持切换技能工作区，请从桌面主界面重试。");
        return false;
      }

      onNavigate("agent", resolved.navigationParams);
      return true;
    },
    [
      activeTheme,
      chatToolPreferences,
      creationMode,
      currentProjectId,
      preferredTeamPresetId,
      selectedTeam,
      selectedTeamLabel,
      selectedTeamSummary,
      onNavigate,
    ],
  );

  const createServiceSkillSeededContent = useCallback(
    async (
      skill: ServiceSkillHomeItem,
      targetProjectId?: string | null,
      options?: {
        body?: string;
        metadata?: Record<string, unknown>;
      },
    ) => {
      const normalizedProjectId = normalizeProjectId(
        targetProjectId ?? currentProjectId,
      );
      const seed = buildServiceSkillWorkspaceSeed(
        skill,
        skill.themeTarget ?? activeTheme,
      );

      if (!normalizedProjectId || !seed) {
        return null;
      }

      const mergedMetadata = {
        ...(seed.metadata ?? {}),
        ...(options?.metadata ?? {}),
      };

      return createContent({
        project_id: normalizedProjectId,
        title: seed.title,
        content_type: seed.contentType,
        body: options?.body ?? "",
        metadata:
          Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined,
      });
    },
    [activeTheme, currentProjectId],
  );

  const resolveSiteSkillProjectId = useCallback(
    async (skill: ServiceSkillHomeItem): Promise<string | undefined> => {
      if (!siteSkillRequiresProject(skill)) {
        return undefined;
      }

      if (currentProjectId) {
        return currentProjectId;
      }

      throw new Error("当前技能需要项目工作区，请先进入项目工作。");
    },
    [currentProjectId],
  );

  const prepareServiceSkillWorkspacePayload = useCallback(
    async (
      skill: ServiceSkillHomeItem,
      prompt: string,
      options?: {
        contentId?: string | null;
        projectId?: string | null;
      },
    ): Promise<WorkspaceEntryPayload> => {
      const normalizedProjectId = normalizeProjectId(
        options?.projectId ?? currentProjectId,
      );
      const existingContentId =
        options?.contentId?.trim() || currentContentId || undefined;
      const seed = buildServiceSkillWorkspaceSeed(
        skill,
        skill.themeTarget ?? activeTheme,
      );

      if (existingContentId) {
        return {
          prompt,
          contentId: existingContentId,
          themeOverride: skill.themeTarget,
          initialRequestMetadata: seed?.requestMetadata,
          autoRunInitialPromptOnMount: true,
        };
      }

      if (!normalizedProjectId || !seed) {
        return {
          prompt,
          themeOverride: skill.themeTarget,
          initialRequestMetadata: seed?.requestMetadata,
          autoRunInitialPromptOnMount: true,
        };
      }

      const created = await createServiceSkillSeededContent(
        skill,
        normalizedProjectId,
      );

      if (!created) {
        return {
          prompt,
          themeOverride: skill.themeTarget,
          initialRequestMetadata: seed.requestMetadata,
          autoRunInitialPromptOnMount: true,
        };
      }

      return {
        prompt,
        contentId: created.id,
        themeOverride: skill.themeTarget,
        initialRequestMetadata: seed.requestMetadata,
        autoRunInitialPromptOnMount: true,
      };
    },
    [
      activeTheme,
      createServiceSkillSeededContent,
      currentContentId,
      currentProjectId,
    ],
  );

  const prepareServiceSkillSiteWorkspacePayload = useCallback(
    async (
      skill: ServiceSkillHomeItem,
      slotValues: ServiceSkillSlotValues,
      resolvedCapability: ResolvedServiceSkillSiteCapabilityExecution,
      launchReadiness: Awaited<
        ReturnType<typeof siteGetAdapterLaunchReadiness>
      > | null,
      options?: ServiceSkillLaunchOptions,
    ): Promise<WorkspaceEntryPayload> => {
      if (!isServiceSkillExecutableAsSiteAdapter(skill)) {
        throw new Error("当前技能未绑定站点执行能力");
      }

      if (!isSiteLaunchReadinessReady(launchReadiness)) {
        throw new Error(buildSiteLaunchBlockedMessage(launchReadiness));
      }

      const resolvedProjectId = await resolveSiteSkillProjectId(skill);
      const binding = skill.siteCapabilityBinding;
      const saveMode = binding.saveMode ?? "project_resource";
      const initialSaveTitle = buildServiceSkillSiteCapabilitySaveTitle(
        skill,
        slotValues,
        {
          adapterName: resolvedCapability.adapterName,
        },
      );
      let nextContentId = currentContentId || undefined;

      if (
        saveMode === "current_content" &&
        !nextContentId &&
        resolvedProjectId
      ) {
        const created = await createServiceSkillSeededContent(
          skill,
          resolvedProjectId,
        );
        nextContentId = created?.id ?? undefined;
      }

      const clawLaunchContext = {
        ...buildServiceSkillClawLaunchContext(skill, slotValues, {
          adapterName: resolvedCapability.adapterName,
          contentId: nextContentId,
          projectId: resolvedProjectId,
          launchReadiness,
        }),
        saveTitle: nextContentId ? undefined : initialSaveTitle,
      };
      const prompt = composeServiceSkillClawLaunchPrompt({
        skill,
        slotValues,
        userInput: resolveServiceSkillLaunchUserInput(input, options),
        context: clawLaunchContext,
      });

      return {
        prompt,
        projectId: resolvedProjectId,
        contentId: nextContentId,
        themeOverride: "general",
        initialAutoSendRequestMetadata:
          buildServiceSkillClawLaunchRequestMetadata(clawLaunchContext),
        autoRunInitialPromptOnMount: true,
      };
    },
    [
      createServiceSkillSeededContent,
      currentContentId,
      input,
      resolveSiteSkillProjectId,
    ],
  );

  const handleServiceSkillBrowserRuntimeLaunch = useCallback(
    async (
      skill: ServiceSkillHomeItem,
      slotValues: ServiceSkillSlotValues,
    ): Promise<void> => {
      if (!isServiceSkillExecutableAsSiteAdapter(skill)) {
        return;
      }

      if (!onNavigate) {
        toast.error("当前入口暂不支持打开浏览器工作台，请从桌面主界面重试。");
        return;
      }

      let resolvedProjectId: string | undefined;
      try {
        resolvedProjectId = await resolveSiteSkillProjectId(skill);
      } catch (error) {
        toast.error(getWorkspaceServiceSkillErrorMessage(error));
        return;
      }

      const binding = skill.siteCapabilityBinding;
      let launchReadiness: Awaited<
        ReturnType<typeof siteGetAdapterLaunchReadiness>
      > | null = null;
      let resolvedCapability: ResolvedServiceSkillSiteCapabilityExecution;
      try {
        resolvedCapability = await resolveServiceSkillSiteCapabilityExecution(
          skill,
          slotValues,
        );
      } catch (error) {
        toast.error(
          `解析站点技能失败：${getWorkspaceServiceSkillErrorMessage(error)}`,
        );
        return;
      }

      try {
        launchReadiness = await siteGetAdapterLaunchReadiness({
          adapter_name: resolvedCapability.adapterName,
        });
      } catch {
        launchReadiness = null;
      }
      const saveMode = binding.saveMode ?? "project_resource";
      const initialArgs = resolvedCapability.args;
      const initialSaveTitle = buildServiceSkillSiteCapabilitySaveTitle(
        skill,
        slotValues,
        {
          adapterName: resolvedCapability.adapterName,
        },
      );
      let nextContentId = currentContentId || undefined;

      if (
        saveMode === "current_content" &&
        !nextContentId &&
        resolvedProjectId
      ) {
        try {
          const created = await createServiceSkillSeededContent(
            skill,
            resolvedProjectId,
          );
          nextContentId = created?.id ?? undefined;
        } catch (error) {
          toast.error(
            `准备浏览器采集主稿失败：${getWorkspaceServiceSkillErrorMessage(
              error,
            )}`,
          );
          return;
        }
      }

      const navigationParams: BrowserRuntimePageParams = {
        projectId: resolvedProjectId,
        contentId: nextContentId,
        initialProfileKey:
          launchReadiness?.status === "ready"
            ? launchReadiness.profile_key
            : undefined,
        initialTargetId:
          launchReadiness?.status === "ready"
            ? launchReadiness.target_id
            : undefined,
        initialAdapterName: resolvedCapability.adapterName,
        initialArgs,
        initialAutoRun: binding.autoRun ?? false,
        initialRequireAttachedSession: binding.requireAttachedSession ?? false,
        initialSaveTitle: nextContentId ? undefined : initialSaveTitle,
      };

      onNavigate("browser-runtime", navigationParams);
      recordServiceSkillUsage({
        skillId: skill.id,
        runnerType: skill.runnerType,
        slotValues,
      });
      setPendingServiceSkillLaunchInput(null);
    },
    [
      createServiceSkillSeededContent,
      currentContentId,
      onNavigate,
      recordServiceSkillUsage,
      resolveSiteSkillProjectId,
    ],
  );

  const handleServiceSkillLaunch = useCallback(
    async (
      skill: ServiceSkillHomeItem,
      slotValues: ServiceSkillSlotValues,
      options?: ServiceSkillLaunchOptions,
    ): Promise<boolean> => {
      const persistedLaunchUserInput =
        options && "launchUserInput" in options
          ? normalizeWorkspaceServiceSkillOptionalText(options.launchUserInput)
          : undefined;

      if (isServiceSkillExecutableAsSiteAdapter(skill)) {
        let resolvedCapability: ResolvedServiceSkillSiteCapabilityExecution;
        try {
          resolvedCapability = await resolveServiceSkillSiteCapabilityExecution(
            skill,
            slotValues,
          );
        } catch (error) {
          toast.error(
            `解析站点技能失败：${getWorkspaceServiceSkillErrorMessage(error)}`,
          );
          return false;
        }

        let launchReadiness: Awaited<
          ReturnType<typeof siteGetAdapterLaunchReadiness>
        > | null = null;
        try {
          launchReadiness = await siteGetAdapterLaunchReadiness({
            adapter_name: resolvedCapability.adapterName,
          });
        } catch {
          // 门禁检查失败时保持当前入口态，由后续阻断提示兜底。
        }

        if (!isSiteLaunchReadinessReady(launchReadiness)) {
          toast.info(buildSiteLaunchBlockedMessage(launchReadiness));
          return false;
        }

        let workspacePayload: WorkspaceEntryPayload;
        try {
          workspacePayload = await prepareServiceSkillSiteWorkspacePayload(
            skill,
            slotValues,
            resolvedCapability,
            launchReadiness,
            options,
          );
        } catch (error) {
          toast.error(
            `准备站点技能失败：${getWorkspaceServiceSkillErrorMessage(error)}`,
          );
          return false;
        }

        const entered = navigateToServiceSkillWorkspace(workspacePayload);
        if (!entered) {
          return false;
        }

        recordServiceSkillUsage({
          skillId: skill.id,
          runnerType: skill.runnerType,
          slotValues,
          ...(persistedLaunchUserInput
            ? {
                launchUserInput: persistedLaunchUserInput,
              }
            : {}),
        });
        setPendingServiceSkillLaunchInput(null);
        return true;
      }

      const launchUserInput = resolveServiceSkillLaunchUserInput(
        input,
        options,
      );
      const prompt = composeServiceSkillPrompt({
        skill,
        slotValues,
        userInput: launchUserInput,
      });

      if (skill.runnerType !== "instant") {
        toast.info("这轮会先回到生成起第一版，后面再按设定继续带回来。");
      }

      let workspacePayload: WorkspaceEntryPayload;
      try {
        workspacePayload = await prepareServiceSkillWorkspacePayload(
          skill,
          prompt,
        );
      } catch (error) {
        toast.error(
          `准备技能工作区失败：${getWorkspaceServiceSkillErrorMessage(error)}`,
        );
        return false;
      }

      const entered = navigateToServiceSkillWorkspace(workspacePayload);
      if (!entered) {
        return false;
      }

      recordServiceSkillUsage({
        skillId: skill.id,
        runnerType: skill.runnerType,
        slotValues,
        ...(persistedLaunchUserInput
          ? {
              launchUserInput: persistedLaunchUserInput,
            }
          : {}),
      });
      setPendingServiceSkillLaunchInput(null);
      return true;
    },
    [
      input,
      navigateToServiceSkillWorkspace,
      setPendingServiceSkillLaunchInput,
      prepareServiceSkillSiteWorkspacePayload,
      prepareServiceSkillWorkspacePayload,
      recordServiceSkillUsage,
    ],
  );

  const pendingServiceSkillLaunchForm = useMemo<A2UIResponse | null>(() => {
    if (!pendingServiceSkillLaunchInput) {
      return null;
    }

    return buildServiceSkillLaunchA2UIResponse(
      pendingServiceSkillLaunchInput.skill,
      {
        initialSlotValues: pendingServiceSkillLaunchInput.initialSlotValues,
        prefillHint: pendingServiceSkillLaunchInput.prefillHint,
        submitLabel: "继续当前结果",
        responseKey: pendingServiceSkillLaunchInput.requestKey,
      },
    );
  }, [pendingServiceSkillLaunchInput]);

  const pendingServiceSkillLaunchSource =
    useMemo<PendingA2UISource | null>(() => {
      if (!pendingServiceSkillLaunchInput) {
        return null;
      }

      return {
        kind: "service_skill",
        skillId: pendingServiceSkillLaunchInput.skill.id,
        requestKey: pendingServiceSkillLaunchInput.requestKey,
        messageId: undefined,
      };
    }, [pendingServiceSkillLaunchInput]);

  const handlePendingServiceSkillLaunchSubmit = useCallback(
    async (formData: A2UIFormData): Promise<boolean> => {
      if (!pendingServiceSkillLaunchInput) {
        return false;
      }

      const slotValues = readServiceSkillLaunchSlotValuesFromFormData(
        pendingServiceSkillLaunchInput.skill,
        formData,
      );
      const validation = validateServiceSkillSlotValues(
        pendingServiceSkillLaunchInput.skill,
        slotValues,
      );
      if (!validation.valid) {
        toast.info(
          `还差${validation.missing.map((slot) => slot.label).join("、")}，补齐后再继续。`,
        );
        return false;
      }

      const launched = await handleServiceSkillLaunch(
        pendingServiceSkillLaunchInput.skill,
        slotValues,
        {
          launchUserInput: pendingServiceSkillLaunchInput.launchUserInput,
        },
      );
      if (launched) {
        setPendingServiceSkillLaunchInput(null);
      }
      return launched;
    },
    [handleServiceSkillLaunch, pendingServiceSkillLaunchInput],
  );

  const clearPendingServiceSkillLaunch = useCallback(() => {
    setPendingServiceSkillLaunchInput(null);
  }, []);

  const handleServiceSkillSelect = useCallback(
    (skill: ServiceSkillHomeItem, options?: ServiceSkillSelectionOptions) => {
      const selectionPlan = buildServiceSkillSelectionPlan({
        skill,
        options,
        creationReplay,
        nextRequestCount: serviceSkillLaunchRequestCountRef.current + 1,
      });

      if (selectionPlan.kind === "launch") {
        void handleServiceSkillLaunch(skill, selectionPlan.slotValues, {
          launchUserInput: selectionPlan.launchUserInput,
        });
        return;
      }

      serviceSkillLaunchRequestCountRef.current += 1;
      setPendingServiceSkillLaunchInput(selectionPlan.pendingInput);
    },
    [creationReplay, handleServiceSkillLaunch],
  );

  const handleAutoLaunchMatchedSiteSkill = useCallback(
    async (match: AutoMatchedSiteSkill<ServiceSkillHomeItem>) => {
      await handleServiceSkillLaunch(match.skill, match.slotValues, {
        launchUserInput: match.launchUserInput,
      });
    },
    [handleServiceSkillLaunch],
  );

  const handleServiceSkillAutomationSetup = useCallback(
    async (skill: ServiceSkillHomeItem, slotValues: ServiceSkillSlotValues) => {
      if (!supportsServiceSkillLocalAutomation(skill)) {
        await handleServiceSkillLaunch(skill, slotValues);
        return;
      }

      if (!currentProjectId) {
        toast.error("缺少项目工作区，请先选择项目后再创建本地自动化任务。");
        return;
      }

      try {
        const automationThreadLineage = await resolveAutomationThreadLineage();
        if (!automationThreadLineage) {
          toast.error(
            t("settings.automation.jobDialog.validation.threadLineageRequired"),
          );
          return;
        }

        let workspaces: Project[];
        try {
          workspaces = prioritizeAutomationWorkspaces(
            await listProjects(),
            currentProjectId,
            skill.themeTarget ?? activeTheme,
          );
        } catch {
          workspaces = [
            buildFallbackAutomationWorkspace(
              currentProjectId,
              skill.themeTarget ?? activeTheme,
            ),
          ];
        }

        const setupState = buildServiceSkillAutomationSetupState({
          skill,
          slotValues,
          input,
          workspaceId: currentProjectId,
          threadLineage: automationThreadLineage,
        });

        setAutomationWorkspaces(workspaces);
        setAutomationDialogInitialValues(setupState.dialogInitialValues);
        setPendingServiceSkillAutomation(setupState.pendingAutomation);
        setPendingServiceSkillLaunchInput(null);
        setAutomationDialogOpen(true);
      } catch (error) {
        toast.error(
          `准备本地自动化任务失败：${getWorkspaceServiceSkillErrorMessage(
            error,
          )}`,
        );
      }
    },
    [
      activeTheme,
      currentProjectId,
      handleServiceSkillLaunch,
      input,
      resolveAutomationThreadLineage,
      setPendingServiceSkillLaunchInput,
      t,
    ],
  );

  const handleAutomationDialogOpenChange = useCallback((open: boolean) => {
    setAutomationDialogOpen(open);
    if (!open) {
      setAutomationDialogInitialValues(null);
      setPendingServiceSkillAutomation(null);
    }
  }, []);

  const handleAutomationDialogSubmit = useCallback(
    async (payload: AutomationJobDialogSubmit) => {
      if (payload.mode !== "create") {
        throw new Error("当前技能入口只支持创建新的本地自动化任务");
      }

      setAutomationJobSaving(true);
      try {
        const pendingLaunch = pendingServiceSkillAutomation;
        let request = payload.request;
        let automationContentId = currentContentId;

        if (
          shouldCreateServiceSkillAutomationContent({
            pendingAutomation: pendingLaunch,
            request,
            contentId: automationContentId,
          }) &&
          pendingLaunch
        ) {
          const createdContent = await createServiceSkillSeededContent(
            pendingLaunch.skill,
            request.workspace_id,
          );
          automationContentId = createdContent?.id ?? null;
        }
        const submitRequestPlan = buildServiceSkillAutomationSubmitRequest({
          pendingAutomation: pendingLaunch,
          request,
          contentId: automationContentId,
        });
        request = submitRequestPlan.request;
        automationContentId = submitRequestPlan.automationContentId;

        const createdJob = await createAutomationJob(request);
        recordAutomationJobAgentUiProjection(createdJob, "created");
        toast.success(`本地自动化任务已创建：${createdJob.name}`);

        setAutomationDialogOpen(false);
        setAutomationDialogInitialValues(null);
        setPendingServiceSkillAutomation(null);

        if (!pendingLaunch) {
          return;
        }

        recordServiceSkillAutomationLink({
          skillId: pendingLaunch.usage.skillId,
          jobId: createdJob.id,
          jobName: createdJob.name,
        });
        recordServiceSkillUsage(pendingLaunch.usage);

        let workspacePayload: WorkspaceEntryPayload;
        try {
          workspacePayload = await prepareServiceSkillWorkspacePayload(
            pendingLaunch.skill,
            pendingLaunch.prompt,
            {
              contentId: automationContentId,
              projectId: request.workspace_id,
            },
          );
        } catch (error) {
          toast.error(
            `自动化任务已创建，但准备工作区失败：${getWorkspaceServiceSkillErrorMessage(
              error,
            )}`,
          );
          return;
        }

        const entered = navigateToServiceSkillWorkspace(workspacePayload);
        if (!entered) {
          toast.error("自动化已创建，但没能回到生成，请稍后手动打开。");
        }
      } catch (error) {
        toast.error(
          `创建本地自动化任务失败：${getWorkspaceServiceSkillErrorMessage(
            error,
          )}`,
        );
        throw error;
      } finally {
        setAutomationJobSaving(false);
      }
    },
    [
      createServiceSkillSeededContent,
      currentContentId,
      navigateToServiceSkillWorkspace,
      pendingServiceSkillAutomation,
      prepareServiceSkillWorkspacePayload,
      recordServiceSkillUsage,
    ],
  );

  return {
    pendingServiceSkillLaunchForm,
    pendingServiceSkillLaunchSource,
    automationDialogOpen,
    automationDialogInitialValues,
    automationThreadLineage:
      pendingServiceSkillAutomation?.threadLineage ?? null,
    automationWorkspaces,
    automationJobSaving,
    handleServiceSkillSelect,
    handlePendingServiceSkillLaunchSubmit,
    clearPendingServiceSkillLaunch,
    handleServiceSkillLaunch,
    handleAutoLaunchMatchedSiteSkill,
    handleServiceSkillBrowserRuntimeLaunch,
    handleServiceSkillAutomationSetup,
    handleAutomationDialogOpenChange,
    handleAutomationDialogSubmit,
  };
}
