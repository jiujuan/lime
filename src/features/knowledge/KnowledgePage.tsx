import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ClipboardCheck,
  FileText,
  FolderOpen,
  ListChecks,
  Loader2,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { ProjectSelector } from "@/components/projects/ProjectSelector";
import {
  compileKnowledgePack,
  getKnowledgePack,
  importKnowledgeSource,
  listKnowledgePacks,
  updateKnowledgePackStatus,
  type KnowledgePackDetail,
  type KnowledgePackStatus,
  type KnowledgePackSummary,
} from "@/lib/api/knowledge";
import {
  getDefaultProject,
  getProject,
  getProjectByRootPath,
} from "@/lib/api/project";
import type { KnowledgePageParams, Page, PageParams } from "@/types/page";
import { cn } from "@/lib/utils";
import {
  PACK_TYPES,
  type DetailTab,
  type KnowledgeView,
} from "./domain/knowledgeLabels";
import {
  getErrorMessage,
  getPackTitle,
  normalizePackNameInput,
  sanitizeKnowledgePreview,
} from "./domain/knowledgeVisibility";
import {
  buildKnowledgeRequestMetadata,
  resolveKnowledgePackRuntimeMode,
  type KnowledgeRequestCompanionPack,
} from "./agent/knowledgeMetadata";
import { StatusPill } from "./components/StatusPill";

interface KnowledgePageProps {
  onNavigate?: (page: Page, pageParams?: PageParams) => void;
  pageParams?: KnowledgePageParams;
}

type AsyncStatus = "idle" | "loading" | "ready" | "error";

const WORKING_DIR_STORAGE_KEY = "lime.knowledge.working-dir";
const LAST_PROJECT_ID_STORAGE_KEY = "agent_last_project_id";
const DEFAULT_PACK_NAME = "project-material";
const DEFAULT_SOURCE_FILE_NAME = "source.md";

function readStoredWorkingDir(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(WORKING_DIR_STORAGE_KEY)?.trim() ?? "";
}

function persistWorkingDir(value: string): void {
  if (typeof window === "undefined") {
    return;
  }

  if (value.trim()) {
    window.localStorage.setItem(WORKING_DIR_STORAGE_KEY, value.trim());
  } else {
    window.localStorage.removeItem(WORKING_DIR_STORAGE_KEY);
  }
}

function isLikelyTransientWorkingDir(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, "/").toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.includes("/tmp/") ||
    normalized.includes("/var/folders/") ||
    normalized.includes("lime-knowledge-smoke") ||
    normalized.includes("lime-knowledge-")
  );
}

function readReusableStoredWorkingDir(): string {
  const storedWorkingDir = readStoredWorkingDir();
  return isLikelyTransientWorkingDir(storedWorkingDir) ? "" : storedWorkingDir;
}

function readLastProjectId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  const rawValue = window.localStorage
    .getItem(LAST_PROJECT_ID_STORAGE_KEY)
    ?.trim();
  if (!rawValue) {
    return "";
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return typeof parsed === "string" ? parsed.trim() : "";
  } catch {
    return rawValue;
  }
}

function resolveDraftPackNameInput(
  description?: string | null,
  sourceName?: string | null,
): string {
  return (
    normalizePackNameInput(description?.trim() ?? "") ||
    normalizePackNameInput(sourceName?.replace(/\.[^.]+$/, "").trim() ?? "") ||
    DEFAULT_PACK_NAME
  );
}

export function KnowledgePage({ onNavigate, pageParams }: KnowledgePageProps) {
  const initialWorkingDir = pageParams?.workingDir?.trim() ?? "";
  const initialStoredWorkingDir =
    initialWorkingDir || readReusableStoredWorkingDir();
  const initialSaveDraft = pageParams?.saveDraft;
  const [workingDir, setWorkingDir] = useState(() => initialStoredWorkingDir);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [activeView, setActiveView] = useState<KnowledgeView>(
    () => pageParams?.initialView ?? "overview",
  );
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const [advancedInfoOpen, setAdvancedInfoOpen] = useState(false);
  const [catalogStatus, setCatalogStatus] = useState<AsyncStatus>(
    workingDir ? "loading" : "idle",
  );
  const [packs, setPacks] = useState<KnowledgePackSummary[]>([]);
  const [selectedPackName, setSelectedPackName] = useState(
    () => pageParams?.selectedPackName?.trim() ?? "",
  );
  const [selectedPack, setSelectedPack] = useState<KnowledgePackDetail | null>(
    null,
  );
  const [detailStatus, setDetailStatus] = useState<AsyncStatus>("idle");
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [packNameInput, setPackNameInput] = useState(
    pageParams?.selectedPackName?.trim() ||
      resolveDraftPackNameInput(
        initialSaveDraft?.description,
        initialSaveDraft?.sourceName,
      ),
  );
  const [packDescription, setPackDescription] = useState(
    () =>
      initialSaveDraft?.description?.trim() ||
      initialSaveDraft?.sourceName?.replace(/\.[^.]+$/, "").trim() ||
      "项目资料",
  );
  const [packType, setPackType] = useState(
    () => initialSaveDraft?.packType?.trim() || "brand-product",
  );
  const sourceFileName =
    pageParams?.saveDraft?.sourceName?.trim() || DEFAULT_SOURCE_FILE_NAME;
  const [sourceText, setSourceText] = useState(
    () => initialSaveDraft?.sourceText.trim() ?? "",
  );
  const [saveTargetPackName, setSaveTargetPackName] = useState(
    () => pageParams?.selectedPackName?.trim() ?? "",
  );
  const [saveCompletedPackName, setSaveCompletedPackName] = useState("");
  const activeViewRef = useRef(activeView);
  const hasSaveDraftRef = useRef(Boolean(pageParams?.saveDraft));
  const saveTargetPackNameRef = useRef(saveTargetPackName);
  const [knowledgeComposerOpen, setKnowledgeComposerOpen] = useState(false);
  const [composerPersonaPackName, setComposerPersonaPackName] = useState<
    string | null
  >(null);
  const [composerDataPackNames, setComposerDataPackNames] = useState<string[]>(
    [],
  );

  const selectedSummary = useMemo(
    () =>
      packs.find((pack) => pack.metadata.name === selectedPackName) ??
      selectedPack ??
      null,
    [packs, selectedPack, selectedPackName],
  );

  const readyPacks = useMemo(
    () => packs.filter((pack) => pack.metadata.status === "ready"),
    [packs],
  );
  const readyPersonaPacks = useMemo(
    () =>
      readyPacks.filter(
        (pack) => resolveKnowledgePackRuntimeMode(pack) === "persona",
      ),
    [readyPacks],
  );
  const readyDataPacks = useMemo(
    () =>
      readyPacks.filter(
        (pack) => resolveKnowledgePackRuntimeMode(pack) === "data",
      ),
    [readyPacks],
  );
  const refreshCatalog = useCallback(
    async (nextWorkingDir = workingDir) => {
      const normalizedWorkingDir = nextWorkingDir.trim();
      if (!normalizedWorkingDir) {
        setCatalogStatus("idle");
        setPacks([]);
        setSelectedPack(null);
        return;
      }

      setCatalogStatus("loading");
      try {
        const response = await listKnowledgePacks({
          workingDir: normalizedWorkingDir,
        });
        setPacks(response.packs);
        setCatalogStatus("ready");
        setSelectedPackName((current) => {
          if (
            current &&
            response.packs.some((pack) => pack.metadata.name === current)
          ) {
            return current;
          }

          return (
            response.packs.find((pack) => pack.defaultForWorkspace)?.metadata
              .name ??
            response.packs[0]?.metadata.name ??
            ""
          );
        });
      } catch (error) {
        setCatalogStatus("error");
        setNotice(getErrorMessage(error, "读取资料列表失败"));
      }
    },
    [workingDir],
  );

  useEffect(() => {
    const normalizedFromParams = pageParams?.workingDir?.trim();
    if (!normalizedFromParams || normalizedFromParams === workingDir) {
      return;
    }

    setWorkingDir(normalizedFromParams);
    persistWorkingDir(normalizedFromParams);
  }, [pageParams?.workingDir, workingDir]);

  useEffect(() => {
    const nextView = pageParams?.initialView;
    if (!nextView) {
      return;
    }

    setActiveView(nextView);
  }, [pageParams?.initialView]);

  useEffect(() => {
    const nextSelectedPackName = pageParams?.selectedPackName?.trim();
    if (!nextSelectedPackName) {
      return;
    }

    setSelectedPackName(nextSelectedPackName);
    setSaveTargetPackName(nextSelectedPackName);
  }, [pageParams?.selectedPackName]);

  useEffect(() => {
    const draft = pageParams?.saveDraft;
    if (!draft) {
      return;
    }

    const nextSourceText = draft.sourceText.trim();
    const nextDescription =
      draft.description?.trim() ||
      draft.sourceName?.replace(/\.[^.]+$/, "").trim() ||
      "对话结果资料";
    setSourceText(nextSourceText);
    setPackDescription(nextDescription);
    setPackNameInput(
      pageParams?.selectedPackName?.trim() ||
        resolveDraftPackNameInput(nextDescription, draft.sourceName),
    );
    setPackType(draft.packType?.trim() || "custom");
    setSaveTargetPackName(pageParams?.selectedPackName?.trim() || "");
    setSaveCompletedPackName("");
  }, [pageParams?.saveDraft, pageParams?.selectedPackName]);

  useEffect(() => {
    if (workingDir || pageParams?.workingDir?.trim()) {
      return;
    }

    let cancelled = false;
    const lastProjectId = readLastProjectId();
    const projectPromise = lastProjectId
      ? getProject(lastProjectId)
          .catch(() => null)
          .then((project) => project ?? getDefaultProject())
      : getDefaultProject();

    void projectPromise
      .then((project) => {
        const nextWorkingDir = project?.rootPath.trim() ?? "";
        if (cancelled || !project || !nextWorkingDir) {
          return;
        }

        setSelectedProjectId(project.id);
        setWorkingDir(nextWorkingDir);
        persistWorkingDir(nextWorkingDir);
      })
      .catch(() => {
        // 没有默认项目时保持空态，让用户通过项目选择器进入。
      });

    return () => {
      cancelled = true;
    };
  }, [pageParams?.workingDir, workingDir]);

  useEffect(() => {
    if (!workingDir) {
      return;
    }

    void refreshCatalog(workingDir);
  }, [refreshCatalog, workingDir]);

  useEffect(() => {
    const normalizedWorkingDir = workingDir.trim();
    if (!normalizedWorkingDir) {
      return;
    }

    let cancelled = false;
    void getProjectByRootPath(normalizedWorkingDir)
      .then((project) => {
        if (cancelled || !project) {
          return;
        }

        setSelectedProjectId(project.id);
      })
      .catch(() => {
        // 路径可能来自排障设置；解析不到项目时继续允许手动管理资料。
      });

    return () => {
      cancelled = true;
    };
  }, [workingDir]);

  useEffect(() => {
    if (!workingDir || !selectedPackName) {
      setSelectedPack(null);
      setDetailStatus("idle");
      return;
    }

    let cancelled = false;
    setDetailStatus("loading");
    void getKnowledgePack(workingDir, selectedPackName)
      .then((pack) => {
        if (cancelled) {
          return;
        }
        setSelectedPack(pack);
        setDetailStatus("ready");
        const shouldPreserveSaveDraftForm =
          activeViewRef.current === "save" &&
          hasSaveDraftRef.current &&
          !saveTargetPackNameRef.current;
        if (!shouldPreserveSaveDraftForm && activeViewRef.current !== "import") {
          setPackNameInput(pack.metadata.name);
          setPackDescription(pack.metadata.description);
          setPackType(pack.metadata.type || "personal-ip");
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setDetailStatus("error");
        setNotice(getErrorMessage(error, "读取资料详情失败"));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPackName, workingDir]);

  const handleProjectChange = useCallback(
    async (projectId: string) => {
      setNotice(null);

      try {
        const project = await getProject(projectId);
        const nextWorkingDir = project?.rootPath.trim() ?? "";

        if (!nextWorkingDir) {
          setNotice("这个项目还没有可用目录，请先在项目管理中修复目录。");
          return;
        }

        setSelectedProjectId(projectId);
        setWorkingDir(nextWorkingDir);
        persistWorkingDir(nextWorkingDir);
        setSelectedPackName("");
        setSelectedPack(null);
        await refreshCatalog(nextWorkingDir);
      } catch (error) {
        setNotice(getErrorMessage(error, "选择项目失败"));
      }
    },
    [refreshCatalog],
  );

  const openPack = useCallback(
    (packName: string, nextTab: DetailTab = "overview") => {
      setSelectedPackName(packName);
      setDetailTab(nextTab);
      setActiveView("detail");
    },
    [],
  );

  const runImportSource = useCallback(
    async (
      statusKey: string,
      packNameOverride?: string,
    ): Promise<KnowledgePackDetail | null> => {
      const normalizedWorkingDir = workingDir.trim();
      const normalizedPackName = normalizePackNameInput(
        packNameOverride || packNameInput,
      );
      if (!normalizedWorkingDir) {
        setNotice("请先选择项目");
        return null;
      }
      if (!normalizedPackName) {
        setNotice("请填写资料名称");
        return null;
      }
      if (!sourceText.trim()) {
        setNotice("请先粘贴来源资料");
        return null;
      }

      setActionStatus(statusKey);
      setNotice(null);
      try {
        const response = await importKnowledgeSource({
          workingDir: normalizedWorkingDir,
          packName: normalizedPackName,
          description: packDescription.trim() || undefined,
          packType: packType.trim() || undefined,
          sourceFileName: sourceFileName.trim() || undefined,
          sourceText,
        });
        setSelectedPack(response.pack);
        setSelectedPackName(response.pack.metadata.name);
        setPackNameInput(response.pack.metadata.name);
        setSourceText("");
        setNotice("资料已保存，确认后才会用于创作");
        await refreshCatalog(normalizedWorkingDir);
        return response.pack;
      } catch (error) {
        setNotice(getErrorMessage(error, "导入来源资料失败"));
        return null;
      } finally {
        setActionStatus(null);
      }
    },
    [
      packDescription,
      packNameInput,
      packType,
      refreshCatalog,
      sourceFileName,
      sourceText,
      workingDir,
    ],
  );

  const compileByName = useCallback(
    async (packName: string) => {
      if (!workingDir || !packName) {
        return null;
      }

      setActionStatus("compile");
      setNotice(null);
      try {
        const response = await compileKnowledgePack(workingDir, packName);
        setSelectedPack(response.pack);
        setSelectedPackName(response.pack.metadata.name);
        setNotice(
          response.warnings.length > 0
            ? "已整理，下一步请检查完整资料文档、缺口和风险边界"
            : "资料已整理，等待你确认",
        );
        await refreshCatalog(workingDir);
        return response.pack;
      } catch (error) {
        setNotice(getErrorMessage(error, "整理资料失败"));
        return null;
      } finally {
        setActionStatus(null);
      }
    },
    [refreshCatalog, workingDir],
  );

  const handleStartWizardCompile = useCallback(async () => {
    let packName = selectedPackName || normalizePackNameInput(packNameInput);
    if (sourceText.trim()) {
      const imported = await runImportSource("compile-import");
      if (!imported) {
        return;
      }
      packName = imported.metadata.name;
    }
    if (!packName) {
      setNotice("请先导入资料或选择已有资料");
      return;
    }
    const compiled = await compileByName(packName);
    if (compiled) {
      setActiveView("detail");
      setDetailTab("overview");
    }
  }, [
    compileByName,
    packNameInput,
    runImportSource,
    selectedPackName,
    sourceText,
  ]);

  const handleUpdateStatus = useCallback(
    async (status: KnowledgePackStatus) => {
      if (!workingDir || !selectedPackName) {
        return;
      }

      setActionStatus(status === "ready" ? "confirm" : "archive");
      setNotice(null);
      try {
        const response = await updateKnowledgePackStatus({
          workingDir,
          name: selectedPackName,
          status,
        });
        setSelectedPack(response.pack);
        setSelectedPackName(response.pack.metadata.name);
        setNotice(
          status === "ready"
            ? "资料已确认可用，可以用于创作"
            : response.clearedDefault
              ? "资料已归档，并已清理默认使用标记"
              : "资料已归档",
        );
        await refreshCatalog(workingDir);
        if (status === "archived") {
          setActiveView("overview");
        }
      } catch (error) {
        setNotice(getErrorMessage(error, "更新资料状态失败"));
      } finally {
        setActionStatus(null);
      }
    },
    [refreshCatalog, selectedPackName, workingDir],
  );

  const handleOpenAgentKnowledgeHub = useCallback(() => {
    onNavigate?.("agent", {
      agentEntry: "claw",
      projectId: selectedProjectId ?? undefined,
      initialInputCapability: {
        capabilityRoute: {
          kind: "builtin_command",
          commandKey: "knowledge_pack",
          commandPrefix: "@资料",
        },
        requestKey: Date.now(),
      },
    });
  }, [onNavigate, selectedProjectId]);

  const handleOpenKnowledgeComposer = useCallback(
    (packNameOverride?: string) => {
      const packName =
        packNameOverride?.trim() ||
        selectedPackName ||
        selectedSummary?.metadata.name ||
        "";
      if (!workingDir || !packName) {
        setNotice("请先选择资料");
        return;
      }
      const seedPack =
        packs.find((pack) => pack.metadata.name === packName) ??
        (selectedSummary?.metadata.name === packName ? selectedSummary : null);
      const defaultPersonaPack =
        readyPersonaPacks.find((pack) => pack.defaultForWorkspace) ??
        readyPersonaPacks[0] ??
        null;
      const seedRuntimeMode = seedPack
        ? resolveKnowledgePackRuntimeMode(seedPack)
        : "data";

      setComposerPersonaPackName(
        seedRuntimeMode === "persona"
          ? packName
          : defaultPersonaPack?.metadata.name ?? null,
      );
      setComposerDataPackNames(seedRuntimeMode === "data" ? [packName] : []);
      setKnowledgeComposerOpen(true);
    },
    [
      packs,
      readyPersonaPacks,
      selectedPackName,
      selectedSummary,
      workingDir,
    ],
  );

  const handleToggleComposerDataPack = useCallback((packName: string) => {
    setComposerDataPackNames((current) =>
      current.includes(packName)
        ? current.filter((item) => item !== packName)
        : [...current, packName],
    );
  }, []);

  const handleConfirmKnowledgeComposer = useCallback(() => {
    if (!workingDir) {
      setNotice("请先选择项目");
      return;
    }

    const selectedDataNames = composerDataPackNames.filter((packName) =>
      readyDataPacks.some((pack) => pack.metadata.name === packName),
    );
    const selectedPersonaName =
      composerPersonaPackName &&
      readyPersonaPacks.some(
        (pack) => pack.metadata.name === composerPersonaPackName,
      )
        ? composerPersonaPackName
        : null;
    const packName = selectedDataNames[0] ?? selectedPersonaName;

    if (!packName) {
      setNotice("请至少选择一份已确认资料");
      return;
    }

    const companionPacks: KnowledgeRequestCompanionPack[] = [];
    if (selectedPersonaName && selectedPersonaName !== packName) {
      companionPacks.push({
        name: selectedPersonaName,
        activation: "explicit",
      });
    }
    for (const dataPackName of selectedDataNames) {
      if (dataPackName === packName) {
        continue;
      }
      companionPacks.push({
        name: dataPackName,
        activation: "explicit",
      });
    }

    const packForRequest =
      packs.find((pack) => pack.metadata.name === packName) ?? null;

    const requestMetadata = buildKnowledgeRequestMetadata({
      workingDir,
      packName,
      pack: packForRequest,
      packs: companionPacks,
    });

    setKnowledgeComposerOpen(false);
    onNavigate?.("agent", {
      agentEntry: "claw",
      projectId: selectedProjectId ?? undefined,
      initialUserPrompt: "请基于当前项目资料创作内容",
      initialRequestMetadata: requestMetadata,
      initialKnowledgePackSelection: {
        enabled: true,
        packName,
        workingDir,
        label: packForRequest ? getPackTitle(packForRequest) : packName,
        status: packForRequest?.metadata.status,
        ...(companionPacks.length ? { companionPacks } : {}),
      },
      autoRunInitialPromptOnMount: false,
    });
  }, [
    composerDataPackNames,
    composerPersonaPackName,
    onNavigate,
    packs,
    readyDataPacks,
    readyPersonaPacks,
    selectedProjectId,
    workingDir,
  ]);

  const actionBusy = Boolean(actionStatus);

  const isProblemStatus = (status?: string | null) =>
    status === "missing" ||
    status === "partial" ||
    status === "disputed" ||
    status === "stale";
  const isFailedStatus = (status?: string | null) =>
    status === "failed" || status === "error";
  const readyPackCount = packs.filter(
    (pack) => pack.metadata.status === "ready",
  ).length;
  const reviewPackCount = packs.filter(
    (pack) =>
      pack.metadata.status !== "ready" &&
      pack.metadata.status !== "archived" &&
      !isProblemStatus(pack.metadata.status) &&
      !isFailedStatus(pack.metadata.status),
  ).length;
  const missingPackCount = packs.filter((pack) =>
    isProblemStatus(pack.metadata.status),
  ).length;
  const pendingPacksForAction = packs.filter(
    (pack) =>
      pack.metadata.status !== "ready" && pack.metadata.status !== "archived",
  );
  const defaultPersonaPack =
    readyPersonaPacks.find((pack) => pack.defaultForWorkspace) ??
    readyPersonaPacks[0] ??
    null;
  const defaultDataPacks = readyDataPacks.slice(0, 3);
  const currentUseText =
    readyPackCount > 0
      ? [
          defaultPersonaPack ? getPackTitle(defaultPersonaPack) : null,
          ...defaultDataPacks.map(getPackTitle),
        ]
          .filter(Boolean)
          .join(" + ") || "可手动选择项目资料"
      : "还没有确认可用的资料";
  const composerSelectedCount =
    (composerPersonaPackName ? 1 : 0) + composerDataPackNames.length;

  useEffect(() => {
    activeViewRef.current = activeView;
    hasSaveDraftRef.current = Boolean(pageParams?.saveDraft);
    saveTargetPackNameRef.current = saveTargetPackName;
  }, [activeView, pageParams?.saveDraft, saveTargetPackName]);
  const handleSaveDraftToMaterials = async () => {
    const targetPackName = saveTargetPackName || packNameInput;
    const saved = await runImportSource("save", targetPackName);
    if (saved) {
      setSaveTargetPackName(saved.metadata.name);
      setSaveCompletedPackName(saved.metadata.name);
      setActiveView("save");
    }
  };

  const renderMaterialStatus = (pack: KnowledgePackSummary) => {
    if (pack.metadata.status === "ready") {
      return "已可用";
    }
    if (isFailedStatus(pack.metadata.status)) {
      return "整理失败";
    }
    if (isProblemStatus(pack.metadata.status)) {
      return "需要补充";
    }
    return "待确认";
  };

  const renderPackActionLabel = (pack: KnowledgePackSummary) => {
    if (pack.metadata.status === "ready") {
      return "用于创作";
    }
    if (isProblemStatus(pack.metadata.status)) {
      return "补充资料";
    }
    if (isFailedStatus(pack.metadata.status)) {
      return "重新整理";
    }
    return "去确认";
  };

  const getPackPurposeLabel = (
    pack: KnowledgePackSummary | KnowledgePackDetail,
  ) =>
    resolveKnowledgePackRuntimeMode(pack) === "persona"
      ? "写作口吻"
      : "参考资料";

  const getPackUsageDescription = (
    pack: KnowledgePackSummary | KnowledgePackDetail,
  ) =>
    resolveKnowledgePackRuntimeMode(pack) === "persona"
      ? "这份资料会帮助 Lime 保持一致的表达方式，确认后可作为写作口吻使用。"
      : "这份资料会帮助 Lime 引用已确认的事实、规则和边界，确认后可作为参考资料使用。";

  const getPackTypeLabel = (
    pack: KnowledgePackSummary | KnowledgePackDetail,
  ) =>
    PACK_TYPES.find((type) => type.value === pack.metadata.type)?.label ??
    "自定义资料";

  const getConfirmationChecklist = (pack: KnowledgePackDetail) => [
    {
      label: "原始资料",
      state: pack.sourceCount > 0 ? "已保存" : "需要补充",
      tone: pack.sourceCount > 0 ? "emerald" : "amber",
    },
    {
      label: "完整资料文档",
      state: pack.guide.trim() || pack.preview ? "已生成" : "待补充",
      tone: pack.guide.trim() || pack.preview ? "emerald" : "amber",
    },
    {
      label: getPackPurposeLabel(pack),
      state: getPackTypeLabel(pack),
      tone: "slate",
    },
    {
      label: "使用前确认",
      state: renderMaterialStatus(pack),
      tone:
        pack.metadata.status === "ready"
          ? "emerald"
          : isProblemStatus(pack.metadata.status)
            ? "amber"
            : "rose",
    },
  ];

  const statusCards = [
    {
      title: "没有资料",
      description: "这个项目还没有资料。",
      action: "整理新资料",
      tone: "slate",
      icon: FolderOpen,
      onClick: () => setActiveView("import"),
    },
    {
      title: "已可用",
      description: "可以用于创作。",
      action: "用于创作",
      tone: "emerald",
      icon: Check,
      onClick: () => handleOpenKnowledgeComposer(),
    },
    {
      title: "待确认",
      description: "需要你看一下。",
      action: "去确认",
      tone: "amber",
      icon: ClipboardCheck,
      onClick: () => {
        const firstPending = pendingPacksForAction[0];
        if (firstPending) {
          openPack(firstPending.metadata.name, "overview");
        } else {
          setActiveView("overview");
        }
      },
    },
    {
      title: "需要补充",
      description: "缺少关键信息。",
      action: "补充资料",
      tone: "rose",
      icon: AlertTriangle,
      onClick: () => setActiveView("import"),
    },
    {
      title: "整理失败",
      description: "这次没整理成功。",
      action: "重新整理",
      tone: "red",
      icon: RefreshCw,
      onClick: () => setActiveView("import"),
    },
  ];

  return (
    <main className="lime-workbench-theme-scope flex h-full min-h-0 flex-1 overflow-auto bg-[image:var(--lime-stage-surface)]">
      <div className="mx-auto flex min-h-full w-full max-w-[1480px] flex-col gap-5 px-6 py-6">
        {activeView === "overview" ? (
          <header className="rounded-3xl border border-slate-200/90 bg-white p-5 shadow-sm shadow-slate-950/5">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 max-w-3xl">
              <h1 className="text-2xl font-semibold text-slate-900">
                让 Lime 记住这个项目
              </h1>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                把访谈、产品介绍、运营规则整理成可确认资料，创作前再选择要使用的口吻和参考。
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenAgentKnowledgeHub}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
              >
                <MessageSquareText className="h-4 w-4" />
                回到创作
              </button>
              <button
                type="button"
                onClick={() => setActiveView("import")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-4 text-sm font-medium text-white transition hover:border-emerald-800 hover:bg-emerald-800"
              >
                <Upload className="h-4 w-4" />
                整理新资料
              </button>
            </div>
          </div>

          <div className="mt-5 grid overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70 md:grid-cols-4">
            {[
              {
                title: "可用于创作",
                value: readyPackCount,
                unit: "份",
                className: "text-emerald-700",
                iconClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
                icon: Check,
              },
              {
                title: "待确认",
                value: reviewPackCount,
                unit: "份",
                className: "text-emerald-700",
                iconClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
                icon: ClipboardCheck,
              },
              {
                title: "需要补充",
                value: missingPackCount,
                unit: "份",
                className: "text-amber-700",
                iconClassName: "border-amber-200 bg-amber-50 text-amber-700",
                icon: AlertTriangle,
              },
              {
                title: "建议本轮使用",
                value: currentUseText,
                unit: "",
                className: "text-emerald-700",
                iconClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
                icon: FileText,
              },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <section
                  key={item.title}
                  className={cn(
                    "flex min-w-0 items-center gap-3 px-5 py-4",
                    index > 0 && "border-t border-slate-200 md:border-l md:border-t-0",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                      item.iconClassName,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-slate-600">{item.title}</div>
                    <div
                      className={cn(
                        "mt-1 truncate text-lg font-semibold",
                        item.className,
                      )}
                    >
                      {typeof item.value === "number"
                        ? `${item.value} ${item.unit}`
                        : item.value}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </header>
        ) : null}

        {notice ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        {activeView === "overview" ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    项目资料清单
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    检查每份资料状态，查看整理结果，或选择本轮创作要参考的内容。
                  </p>
                </div>
                {catalogStatus === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : null}
              </div>

              <div className="mt-5 overflow-hidden rounded-[20px] border border-slate-200">
                <div className="grid grid-cols-[minmax(0,1.4fr)_160px_220px] bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                  <span>资料名称</span>
                  <span>状态</span>
                  <span>操作</span>
                </div>
                {packs.length === 0 && catalogStatus !== "loading" ? (
                  <div className="p-5">
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5">
                      <h3 className="text-base font-semibold text-slate-950">
                        这个项目还没有资料
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        先上传访谈、介绍、规则或复盘，Lime 会整理成可确认的项目资料。
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveView("import")}
                        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800"
                      >
                        <Upload className="h-4 w-4" />
                        整理新资料
                      </button>
                    </div>
                  </div>
                ) : (
                  packs.map((pack) => (
                    <article
                      key={pack.metadata.name}
                      className="grid grid-cols-[minmax(0,1.4fr)_160px_220px] items-center gap-3 border-t border-slate-100 px-4 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border",
                            pack.metadata.status === "ready"
                              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                              : isProblemStatus(pack.metadata.status)
                                ? "border-rose-100 bg-rose-50 text-rose-700"
                                : "border-amber-100 bg-amber-50 text-amber-700",
                          )}
                        >
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-base font-semibold text-slate-950">
                            {getPackTitle(pack)}
                          </div>
                          <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                            {sanitizeKnowledgePreview(pack.preview) ||
                              "等待整理口吻、事实、规则和边界。"}
                          </p>
                        </div>
                      </div>
                      <StatusPill status={pack.metadata.status} />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openPack(pack.metadata.name, "overview")}
                          className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          打开
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy || (pack.metadata.status !== "ready" && renderPackActionLabel(pack) === "用于创作")}
                          onClick={() => {
                            if (pack.metadata.status === "ready") {
                              handleOpenKnowledgeComposer(pack.metadata.name);
                            } else if (isFailedStatus(pack.metadata.status)) {
                              void compileByName(pack.metadata.name);
                            } else if (isProblemStatus(pack.metadata.status)) {
                              setPackNameInput(pack.metadata.name);
                              setActiveView("import");
                            } else {
                              openPack(pack.metadata.name, "overview");
                            }
                          }}
                          className={cn(
                            "inline-flex h-9 items-center justify-center rounded-2xl px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                            pack.metadata.status === "ready"
                              ? "border border-emerald-700 bg-emerald-700 text-white hover:border-emerald-800 hover:bg-emerald-800"
                              : isProblemStatus(pack.metadata.status)
                                ? "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
                                : "border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50",
                          )}
                        >
                          {renderPackActionLabel(pack)}
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
                <h2 className="text-lg font-semibold text-slate-950">
                  接下来你可以
                </h2>
                <div className="mt-5 space-y-0">
                  {[
                    {
                      index: "1",
                      title: "整理新资料",
                      description: "上传访谈、介绍、规则等资料，Lime 帮你提炼关键信息。",
                      icon: FileText,
                    },
                    {
                      index: "2",
                      title: "确认待审资料",
                      description: "查看整理结果，确认无误后标记为可用。",
                      icon: ClipboardCheck,
                    },
                    {
                      index: "3",
                      title: "选择创作时使用的资料",
                      description: "挑选本轮创作会用到的资料，Lime 只参考你这次明确选择的内容。",
                      icon: Check,
                    },
                  ].map((item, stepIndex, items) => {
                    const Icon = item.icon;
                    return (
                    <div key={item.index} className="relative flex gap-4 pb-6 last:pb-0">
                      {stepIndex < items.length - 1 ? (
                        <div className="absolute left-4 top-9 h-[calc(100%-2.25rem)] border-l border-dashed border-emerald-200" />
                      ) : null}
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700">
                        {item.index}
                      </div>
                      <div className="grid min-w-0 grid-cols-[48px_minmax(0,1fr)] gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="text-base font-semibold text-slate-950">
                            {item.title}
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-500">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </section>
            </aside>

            <section className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm leading-6 text-emerald-800 xl:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <ListChecks className="mt-0.5 h-5 w-5 shrink-0" />
                  <p>
                    资料只有确认后才会用于创作；没有确认的资料只留在项目资料里等待处理。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView("states")}
                  className="shrink-0 text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
                >
                  查看状态说明
                </button>
              </div>
            </section>
          </section>
        ) : null}

        {activeView === "import" ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">项目资料 / 整理新资料</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  整理新资料
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  选择资料用途，添加原始资料，Lime 会生成一份待确认的完整资料文档。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView("overview")}
                className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                回到项目资料
              </button>
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
                      1
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-slate-950">
                        选择资料用途
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        选择最贴近这次资料的用途，帮助 Lime 更好地理解内容重点。
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        {PACK_TYPES.map((type) => {
                          const active = packType === type.value;
                          return (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => setPackType(type.value)}
                              className={cn(
                                "rounded-2xl border px-3 py-3 text-center text-sm font-semibold transition",
                                active
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-950/5"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                              )}
                            >
                              {type.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
                      2
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-slate-950">
                        添加原始资料
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        当前先支持粘贴正文；下面这些只是可整理的资料类型，不是单独入口。
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        {["上传访谈稿", "粘贴产品介绍", "导入运营文档", "拖入复盘记录"].map(
                          (label) => (
                            <div
                              key={label}
                              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500"
                            >
                              <FileText className="mx-auto mb-2 h-5 w-5 text-slate-500" />
                              {label}
                            </div>
                          ),
                        )}
                      </div>
                      <label className="mt-4 grid gap-1.5 text-xs font-medium text-slate-600">
                        原始资料正文
                        <textarea
                          value={sourceText}
                          onChange={(event) => setSourceText(event.target.value)}
                          placeholder="粘贴访谈稿、产品资料、历史文案、SOP 或合规边界"
                          className="min-h-[180px] resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                        />
                      </label>
                    </div>
                  </div>
                </section>

                <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-sm font-semibold text-white">
                      3
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-slate-950">
                        Lime 开始整理
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        点击后会保存原始资料，并生成一份待确认的完整资料文档。
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        {[
                          ["读取资料", sourceText.trim() ? "已完成" : "等待中"],
                          ["提炼重点", actionBusy ? "进行中" : "等待中"],
                          ["生成完整文档", selectedSummary?.compiledCount ? "已生成" : "等待中"],
                          ["检查缺口", selectedSummary ? "待处理" : "等待中"],
                        ].map(([title, state], index) => (
                          <div
                            key={title}
                            className={cn(
                              "rounded-2xl border px-3 py-3 text-sm",
                              index <= 1 && sourceText.trim()
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-slate-200 bg-white text-slate-500",
                            )}
                          >
                            <div className="font-semibold">{title}</div>
                            <div className="mt-1 text-xs">{state}</div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleStartWizardCompile}
                        disabled={actionBusy}
                        className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:opacity-60"
                      >
                        {actionStatus === "compile" || actionStatus === "compile-import" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        Lime 开始整理
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-base font-semibold text-slate-950">
                    整理设置
                  </h3>
                  <label className="mt-4 grid gap-1.5 text-xs font-medium text-slate-600">
                    资料名称
                    <input
                      value={packDescription}
                      onChange={(event) => {
                        const nextName = event.target.value;
                        setPackDescription(nextName);
                        setPackNameInput(normalizePackNameInput(nextName));
                      }}
                      placeholder="例如：品牌官网访谈整理"
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                  <label className="mt-4 grid gap-1.5 text-xs font-medium text-slate-600">
                    用途
                    <select
                      value={packType}
                      onChange={(event) => setPackType(event.target.value)}
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    >
                      {PACK_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">
                    这里不再设置“默认使用”。资料确认后，创作前会在选择弹层里明确勾选。
                  </div>
                </section>
              </aside>
              <section className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 xl:col-span-2">
                没有确认的资料不会自动用于创作。
              </section>
            </div>
          </section>
        ) : null}

        {activeView === "detail" ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
            {!selectedPackName ? (
              <div className="grid min-h-[420px] place-items-center text-center">
                <div className="max-w-md">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-400">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-base font-semibold text-slate-900">
                    先从项目资料清单里选择一份资料
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    这里会展示完整资料文档、待确认内容和确认后的影响。
                  </p>
                </div>
              </div>
            ) : detailStatus === "loading" ? (
              <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                正在读取资料详情...
              </div>
            ) : selectedPack ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
                      {getPackTitle(selectedPack)}
                    </h2>
                    <p className="mt-3 text-base leading-7 text-slate-600">
                      {getPackUsageDescription(selectedPack)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveView("overview")}
                    className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    回到项目资料
                  </button>
                </div>

                <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
                  <div className="space-y-5">
                    <section className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
                      <h3 className="text-xl font-semibold text-slate-950">
                        完整资料文档
                      </h3>
                      <div className="mt-5 flex flex-wrap items-center gap-5 rounded-[22px] bg-slate-50 p-5">
                        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
                          <FileText className="h-10 w-10" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-lg font-semibold text-slate-950">
                            {getPackTitle(selectedPack)}.md
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            这是根据原始资料整理出的可读文档。先查看内容，确认无误后再用于创作。
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => setDetailTab("content")}
                            className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-700 bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800"
                          >
                            查看文档内容
                          </button>
                        </div>
                      </div>
                      {detailTab === "content" ? (
                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm font-semibold text-slate-950">
                            完整资料文档内容
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                            {sanitizeKnowledgePreview(selectedPack.guide) ||
                              sanitizeKnowledgePreview(selectedPack.preview) ||
                              "等待整理完整资料文档。"}
                          </p>
                        </div>
                      ) : null}
                    </section>

                    <section className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
                      <h3 className="text-xl font-semibold text-slate-950">
                        需要你确认的内容
                      </h3>
                      <div className="mt-5 divide-y divide-slate-100">
                        {getConfirmationChecklist(selectedPack).map(({ label, state, tone }) => (
                          <div
                            key={label}
                            className="flex items-center justify-between gap-4 py-4 text-sm"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "flex h-7 w-7 items-center justify-center rounded-full",
                                  tone === "emerald"
                                    ? "bg-emerald-700 text-white"
                                    : tone === "slate"
                                      ? "bg-slate-200 text-slate-700"
                                    : tone === "amber"
                                      ? "bg-amber-500 text-white"
                                      : "bg-rose-500 text-white",
                                )}
                              >
                                {tone === "emerald" ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4" />
                                )}
                              </span>
                              <span className="text-base font-medium text-slate-800">
                                {label}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "rounded-full border px-3 py-1 text-sm font-semibold",
                                tone === "emerald"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : tone === "slate"
                                    ? "border-slate-200 bg-slate-50 text-slate-700"
                                  : tone === "amber"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-rose-200 bg-rose-50 text-rose-700",
                              )}
                            >
                              {state}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <aside className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
                    <h3 className="text-xl font-semibold text-slate-950">
                      确认后会发生什么
                    </h3>
                    <div className="mt-7 space-y-9">
                      {[
                        ["可用于创作", "这份资料会出现在创作资料选择里。"],
                        ["需要明确选择", "确认可用不等于每次自动使用，创作前仍要勾选。"],
                        ["不会覆盖原始资料", "原始资料会保留，后续补充会生成新的待确认版本。"],
                      ].map(([title, description]) => (
                        <div key={title} className="flex gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                            <ShieldCheck className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="text-base font-semibold text-slate-950">
                              {title}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                              {description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>

                <section className="mt-6 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-950">
                        高级信息
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        默认收起整理细节，避免干扰确认资料主流程。
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-expanded={advancedInfoOpen}
                      onClick={() =>
                        setAdvancedInfoOpen((current) => !current)
                      }
                      className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {advancedInfoOpen ? "收起高级信息" : "查看高级信息"}
                    </button>
                  </div>

                  {advancedInfoOpen ? (
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      {[
                        {
                          title: "原始资料",
                          value: `${selectedPack.sourceCount} 份已保存`,
                          description:
                            sanitizeKnowledgePreview(
                              selectedPack.sources[0]?.preview,
                            ) || "已保存用户提供的原始内容。",
                        },
                        {
                          title: "整理记录",
                          value: `${selectedPack.runCount} 次处理`,
                          description:
                            selectedPack.runCount > 0
                              ? "最近一次整理已记录，可用于回看处理结果。"
                              : "还没有整理记录。",
                        },
                        {
                          title: "本轮使用记录",
                          value: `${selectedPack.compiledCount} 段摘要`,
                          description:
                            sanitizeKnowledgePreview(
                              selectedPack.compiled[0]?.preview,
                            ) || "确认后会按你选择的资料用于创作。",
                        },
                      ].map((item) => (
                        <article
                          key={item.title}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                        >
                          <div className="text-sm font-semibold text-slate-950">
                            {item.title}
                          </div>
                          <div className="mt-2 text-sm font-medium text-emerald-700">
                            {item.value}
                          </div>
                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-500">
                            {item.description}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="mt-6 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
                  <div className="flex flex-wrap items-center justify-end gap-4">
                    {selectedPack.metadata.status !== "ready" ? (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus("ready")}
                        disabled={actionBusy}
                        className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-6 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:opacity-60"
                      >
                        {actionStatus === "confirm" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ClipboardCheck className="h-4 w-4" />
                        )}
                        确认可用
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenKnowledgeComposer(selectedPack.metadata.name)}
                        className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-6 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800"
                      >
                        <MessageSquareText className="h-4 w-4" />
                        用于创作
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveView("import")}
                      className="inline-flex h-12 min-w-40 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      补充资料
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView("overview")}
                      className="inline-flex h-12 min-w-40 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      稍后再说
                    </button>
                  </div>
                </section>
              </div>
            ) : (
              <div className="rounded-[20px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                未能读取资料详情，请刷新后重试。
              </div>
            )}
          </section>
        ) : null}

        {activeView === "save" ? (
          <section className="grid gap-5 xl:grid-cols-3">
            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-slate-950">
                  保存这段内容
                </h2>
              </div>
              <label className="mt-5 grid gap-1.5 text-xs font-medium text-slate-600">
                要保存的内容
                <textarea
                  value={sourceText}
                  onChange={(event) => {
                    setSourceText(event.target.value);
                    setSaveCompletedPackName("");
                  }}
                  placeholder="把对话里有价值的内容粘贴到这里，例如一段口吻说明、事实补充或规则片段。"
                  className="min-h-[260px] resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveDraftToMaterials}
                disabled={actionBusy || !sourceText.trim()}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-emerald-700 bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:opacity-60"
              >
                保存到项目资料
              </button>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              <h2 className="text-lg font-semibold text-slate-950">
                存到哪里？
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                选已有资料就是补充到那份资料；不选已有资料则新建一份待确认资料。
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const fallbackPackName =
                      selectedPackName || packs[0]?.metadata.name || "";
                    setSaveTargetPackName(fallbackPackName);
                    setSaveCompletedPackName("");
                  }}
                  className={cn(
                    "h-11 rounded-2xl border px-3 text-sm font-semibold transition",
                    saveTargetPackName
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  补充已有资料
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaveTargetPackName("");
                    setSaveCompletedPackName("");
                  }}
                  className={cn(
                    "h-11 rounded-2xl border px-3 text-sm font-semibold transition",
                    !saveTargetPackName
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  新建一份资料
                </button>
              </div>
              <label className="mt-4 grid gap-1.5 text-xs font-medium text-slate-600">
                新资料名称
                <input
                  value={packDescription}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setPackDescription(nextName);
                    setPackNameInput(normalizePackNameInput(nextName));
                  }}
                  placeholder="例如：创始人口吻"
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <div className="mt-4 space-y-3">
                <div className="text-sm font-semibold text-slate-700">
                  已有资料
                </div>
                {packs.length > 0 ? (
                  packs.slice(0, 5).map((pack) => {
                    const active = saveTargetPackName === pack.metadata.name;
                    return (
                      <button
                        key={pack.metadata.name}
                        type="button"
                        onClick={() => {
                          setSaveTargetPackName(pack.metadata.name);
                          setSaveCompletedPackName("");
                          setPackNameInput(pack.metadata.name);
                          setPackDescription(getPackTitle(pack));
                        }}
                        className={cn(
                          "flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                          active
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        <span>
                          <span className="block text-sm font-semibold">
                            {getPackTitle(pack)}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            上次更新：{new Date(pack.updatedAt).toLocaleDateString("zh-CN")}
                          </span>
                        </span>
                        {active ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    还没有已有资料，可以新建一份。
                  </div>
                )}
              </div>
              <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                选择已有资料可在原有基础上补充更新。
              </p>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              <div className="mx-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <Check className="h-12 w-12" />
              </div>
              <h2 className="mt-6 text-center text-xl font-semibold text-slate-950">
                {saveCompletedPackName
                  ? `已保存到“${
                      packs.find((pack) => pack.metadata.name === saveCompletedPackName)
                        ? getPackTitle(
                            packs.find(
                              (pack) => pack.metadata.name === saveCompletedPackName,
                            )!,
                          )
                        : saveCompletedPackName
                    }”`
                  : "保存后需要确认"}
              </h2>
              <div className="mt-6 space-y-4 text-sm text-slate-700">
                {saveCompletedPackName ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        ✓
                      </span>
                      内容已进入项目资料
                    </div>
                    <div className="flex items-center gap-3 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                      下一步需要确认后才会用于创作。
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        1
                      </span>
                      保存内容到项目资料
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        2
                      </span>
                      回到项目资料页确认
                    </div>
                    <div className="flex items-center gap-3 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                      保存不会自动改变本轮创作资料。
                    </div>
                  </>
                )}
              </div>
              <div className="mt-8 grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (saveCompletedPackName) {
                      openPack(saveCompletedPackName, "overview");
                    } else {
                      setActiveView("overview");
                    }
                  }}
                  disabled={!saveCompletedPackName}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  去确认
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("overview")}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  稍后处理
                </button>
              </div>
            </section>
            <div className="xl:col-span-3 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              保存后不会立刻用于创作，确认后才会生效。
            </div>
          </section>
        ) : null}

        {activeView === "states" ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-3xl font-semibold text-slate-950">
                项目资料状态说明
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveView("overview")}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                >
                  <ListChecks className="h-4 w-4" />
                  回到项目资料
                </button>
                <ProjectSelector
                  value={selectedProjectId}
                  onChange={handleProjectChange}
                  placeholder="默认项目"
                  dropdownSide="bottom"
                  dropdownAlign="end"
                  enableManagement
                  density="compact"
                  skipDefaultWorkspaceReadyCheck
                  autoSelectFallback={false}
                />
              </div>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-5">
              {statusCards.map((card) => {
                const Icon = card.icon;
                return (
                  <article
                    key={card.title}
                    className="rounded-[22px] border border-slate-200 bg-white p-4 text-center shadow-sm shadow-slate-950/5"
                  >
                    <div
                      className={cn(
                        "mx-auto flex h-24 w-24 items-center justify-center rounded-full",
                        card.tone === "emerald"
                          ? "bg-emerald-50 text-emerald-700"
                          : card.tone === "amber"
                            ? "bg-amber-50 text-amber-700"
                            : card.tone === "rose"
                              ? "bg-rose-50 text-rose-700"
                              : card.tone === "red"
                                ? "bg-red-50 text-red-700"
                                : "bg-slate-100 text-slate-600",
                      )}
                    >
                      <Icon className="h-10 w-10" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-slate-950">
                      {card.title}
                    </h3>
                    <p className="mt-3 min-h-12 text-sm leading-6 text-slate-500">
                      {card.description}
                    </p>
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                      下一步：{card.action}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="mt-8 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800">
              项目资料不是文件夹，它会帮 Lime 在创作时记住口吻、事实和规则。
            </div>
          </section>
        ) : null}
      </div>

      {knowledgeComposerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 py-6">
          <section
            className="max-h-[88vh] w-full max-w-6xl overflow-auto rounded-[28px] border border-slate-200 bg-white p-7 shadow-2xl shadow-slate-950/20"
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-composer-title"
            data-testid="knowledge-composer-chooser"
          >
            <h2
              id="knowledge-composer-title"
              className="text-center text-2xl font-semibold text-slate-950"
            >
              选择这次创作用哪些资料
            </h2>
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
              <section className="space-y-5 rounded-[22px] border border-slate-200 bg-white p-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    写作口吻（只能选 1 个）
                  </h3>
                  <div className="mt-4 grid gap-3">
                    {readyPersonaPacks.length > 0 ? (
                      readyPersonaPacks.map((pack) => {
                        const checked = composerPersonaPackName === pack.metadata.name;
                        return (
                          <button
                            key={pack.metadata.name}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            data-testid={`knowledge-composer-persona-${pack.metadata.name}`}
                            onClick={() => setComposerPersonaPackName(pack.metadata.name)}
                            className={cn(
                              "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                              checked
                                ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                            )}
                          >
                            <span>
                              <span className="block text-sm font-semibold">
                                {getPackTitle(pack)}
                              </span>
                              <span className="mt-1 block text-xs text-slate-500">
                                已可用
                              </span>
                            </span>
                            {checked ? <Check className="h-4 w-4" /> : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                        还没有可用的写作口吻资料。
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    要参考的资料（可多选）
                  </h3>
                  <div className="mt-4 grid gap-3">
                    {readyDataPacks.map((pack) => {
                      const checked = composerDataPackNames.includes(pack.metadata.name);
                      return (
                        <button
                          key={pack.metadata.name}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          data-testid={`knowledge-composer-data-${pack.metadata.name}`}
                          onClick={() => handleToggleComposerDataPack(pack.metadata.name)}
                          className={cn(
                            "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                            checked
                              ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                          )}
                        >
                          <span>
                            <span className="block text-sm font-semibold">
                              {getPackTitle(pack)}
                            </span>
                            <span className="mt-1 block text-xs text-slate-500">
                              已可用
                            </span>
                          </span>
                          {checked ? <Check className="h-4 w-4" /> : null}
                        </button>
                      );
                    })}
                    {pendingPacksForAction.map((pack) => (
                      <button
                        key={pack.metadata.name}
                        type="button"
                        disabled
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-400"
                      >
                        <span>
                          <span className="block text-sm font-semibold">
                            {getPackTitle(pack)}
                          </span>
                          <span className="mt-1 block text-xs">
                            {renderMaterialStatus(pack)}，不能用于创作
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-950">
                  这次会怎么用
                </h3>
                <div className="mt-4 rounded-3xl border border-emerald-200 bg-emerald-50/70 p-8 text-center text-emerald-700">
                  <div className="mx-auto flex h-44 max-w-sm items-center justify-center rounded-[24px] bg-white/70">
                    <div className="relative h-28 w-36 rounded-2xl bg-white shadow-sm shadow-slate-950/10">
                      <div className="absolute left-6 top-7 h-2 w-24 rounded-full bg-slate-200" />
                      <div className="absolute left-6 top-12 h-2 w-28 rounded-full bg-slate-200" />
                      <div className="absolute left-6 top-[68px] h-2 w-20 rounded-full bg-slate-200" />
                      <div className="absolute -bottom-5 -left-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                        <Check className="h-7 w-7" />
                      </div>
                      <div className="absolute -right-7 bottom-3 h-20 w-8 rotate-12 rounded-full bg-emerald-700" />
                    </div>
                  </div>
                </div>
                <div className="mt-5 divide-y divide-slate-100">
                  <div className="py-3 text-sm text-slate-700">
                    口吻来自{composerPersonaPackName ? "你选择的写作口吻" : "本轮默认表达"}
                  </div>
                  <div className="py-3 text-sm text-slate-700">
                    事实来自已选择的参考资料
                  </div>
                  <div className="py-3 text-sm text-slate-700">
                    规则来自项目内容规则
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <p className="text-sm text-slate-500">
                  已选 {composerSelectedCount} 份资料。
                </p>
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  待确认资料不能用于创作。
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setKnowledgeComposerOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmKnowledgeComposer}
                  disabled={composerSelectedCount === 0}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-700 bg-emerald-700 px-6 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  确认使用
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
