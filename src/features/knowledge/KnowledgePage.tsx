import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
import {
  buildKnowledgeOrganizePrompt,
  normalizeKnowledgeDraftName,
} from "./agent/knowledgePromptBuilder";
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
  const { t, i18n } = useTranslation("agent");
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
      t("knowledgePage.default.description"),
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
        setNotice(getErrorMessage(error, t("knowledgePage.notice.catalogReadFailed")));
      }
    },
    [t, workingDir],
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
      t("knowledgePage.default.conversationResult");
    setSourceText(nextSourceText);
    setPackDescription(nextDescription);
    setPackNameInput(
      pageParams?.selectedPackName?.trim() ||
        resolveDraftPackNameInput(nextDescription, draft.sourceName),
    );
    setPackType(draft.packType?.trim() || "custom");
    setSaveTargetPackName(pageParams?.selectedPackName?.trim() || "");
    setSaveCompletedPackName("");
  }, [pageParams?.saveDraft, pageParams?.selectedPackName, t]);

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
        if (
          !shouldPreserveSaveDraftForm &&
          activeViewRef.current !== "import"
        ) {
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
        setNotice(getErrorMessage(error, t("knowledgePage.notice.detailReadFailed")));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPackName, t, workingDir]);

  const handleProjectChange = useCallback(
    async (projectId: string) => {
      setNotice(null);

      try {
        const project = await getProject(projectId);
        const nextWorkingDir = project?.rootPath.trim() ?? "";

        if (!nextWorkingDir) {
          setNotice(t("knowledgePage.notice.projectDirectoryMissing"));
          return;
        }

        setSelectedProjectId(projectId);
        setWorkingDir(nextWorkingDir);
        persistWorkingDir(nextWorkingDir);
        setSelectedPackName("");
        setSelectedPack(null);
        await refreshCatalog(nextWorkingDir);
      } catch (error) {
        setNotice(getErrorMessage(error, t("knowledgePage.notice.projectSelectFailed")));
      }
    },
    [refreshCatalog, t],
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
        setNotice(t("knowledgePage.notice.selectProjectFirst"));
        return null;
      }
      if (!normalizedPackName) {
        setNotice(t("knowledgePage.notice.fillPackName"));
        return null;
      }
      if (!sourceText.trim()) {
        setNotice(t("knowledgePage.notice.pasteSourceFirst"));
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
        setNotice(t("knowledgePage.notice.sourceSaved"));
        await refreshCatalog(normalizedWorkingDir);
        return response.pack;
      } catch (error) {
        setNotice(getErrorMessage(error, t("knowledgePage.notice.importFailed")));
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
      t,
      workingDir,
    ],
  );

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
            ? t("knowledgePage.notice.readyForWriting")
            : response.clearedDefault
              ? t("knowledgePage.notice.archivedAndClearedDefault")
              : t("knowledgePage.notice.archived"),
        );
        await refreshCatalog(workingDir);
        if (status === "archived") {
          setActiveView("overview");
        }
      } catch (error) {
        setNotice(getErrorMessage(error, t("knowledgePage.notice.statusUpdateFailed")));
      } finally {
        setActionStatus(null);
      }
    },
    [refreshCatalog, selectedPackName, t, workingDir],
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

  const handleContinueKnowledgeOrganizeInAgent = useCallback(() => {
    const normalizedWorkingDir = workingDir.trim();
    if (!normalizedWorkingDir) {
      setNotice(t("knowledgePage.notice.selectProjectFirst"));
      return;
    }

    const normalizedPackName = normalizeKnowledgeDraftName(
      packNameInput || packDescription || DEFAULT_PACK_NAME,
    );
    const prompt = buildKnowledgeOrganizePrompt(sourceText);
    onNavigate?.("agent", {
      agentEntry: "claw",
      projectId: selectedProjectId ?? undefined,
      initialUserPrompt: prompt,
      initialRequestMetadata: {
        knowledge_builder: {
          working_dir: normalizedWorkingDir,
          pack_name: normalizedPackName,
          source: "knowledge-page",
          pack_type: packType.trim() || undefined,
        },
      },
      autoRunInitialPromptOnMount: false,
    });
  }, [
    onNavigate,
    packDescription,
    packNameInput,
    packType,
    selectedProjectId,
    sourceText,
    t,
    workingDir,
  ]);

  const handleOpenKnowledgeComposer = useCallback(
    (packNameOverride?: string) => {
      const packName =
        packNameOverride?.trim() ||
        selectedPackName ||
        selectedSummary?.metadata.name ||
        "";
      if (!workingDir || !packName) {
        setNotice(t("knowledgePage.notice.selectMaterialFirst"));
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
          : (defaultPersonaPack?.metadata.name ?? null),
      );
      setComposerDataPackNames(seedRuntimeMode === "data" ? [packName] : []);
      setKnowledgeComposerOpen(true);
    },
    [packs, readyPersonaPacks, selectedPackName, selectedSummary, t, workingDir],
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
      setNotice(t("knowledgePage.notice.selectProjectFirst"));
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
      setNotice(t("knowledgePage.notice.selectReadyMaterial"));
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
      initialUserPrompt: t("knowledgePage.composer.initialPrompt"),
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
    t,
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
          .join(" + ") || t("knowledgePage.summary.manualSelection")
      : t("knowledgePage.summary.noReadyMaterials");
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
      return t("knowledgePage.status.ready");
    }
    if (isFailedStatus(pack.metadata.status)) {
      return t("knowledgePage.status.failed");
    }
    if (isProblemStatus(pack.metadata.status)) {
      return t("knowledgePage.status.needsSupplement");
    }
    return t("knowledgePage.status.pendingReview");
  };

  const renderPackActionLabel = (pack: KnowledgePackSummary) => {
    if (pack.metadata.status === "ready") {
      return t("knowledgePage.action.useForWriting");
    }
    if (isProblemStatus(pack.metadata.status)) {
      return t("knowledgePage.action.supplementMaterial");
    }
    if (isFailedStatus(pack.metadata.status)) {
      return t("knowledgePage.action.reorganize");
    }
    return t("knowledgePage.action.review");
  };

  const getPackPurposeLabel = (
    pack: KnowledgePackSummary | KnowledgePackDetail,
  ) =>
    resolveKnowledgePackRuntimeMode(pack) === "persona"
      ? t("knowledgePage.purpose.persona")
      : t("knowledgePage.purpose.reference");

  const getPackUsageDescription = (
    pack: KnowledgePackSummary | KnowledgePackDetail,
  ) =>
    resolveKnowledgePackRuntimeMode(pack) === "persona"
      ? t("knowledgePage.purpose.personaDescription")
      : t("knowledgePage.purpose.referenceDescription");

  const getPackTypeLabel = (pack: KnowledgePackSummary | KnowledgePackDetail) =>
    PACK_TYPES.find((type) => type.value === pack.metadata.type)?.label ??
    t("knowledgePage.packType.custom");

  const getConfirmationChecklist = (pack: KnowledgePackDetail) => [
    {
      label: t("knowledgePage.checklist.source.label"),
      state: pack.sourceCount > 0 ? t("knowledgePage.checklist.source.saved") : t("knowledgePage.status.needsSupplement"),
      tone: pack.sourceCount > 0 ? "emerald" : "amber",
    },
    {
      label: t("knowledgePage.checklist.document.label"),
      state: pack.guide.trim() || pack.preview ? t("knowledgePage.checklist.document.generated") : t("knowledgePage.checklist.document.pending"),
      tone: pack.guide.trim() || pack.preview ? "emerald" : "amber",
    },
    {
      label: getPackPurposeLabel(pack),
      state: getPackTypeLabel(pack),
      tone: "slate",
    },
    {
      label: t("knowledgePage.checklist.confirmation.label"),
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
      title: t("knowledgePage.stateCard.empty.title"),
      description: t("knowledgePage.stateCard.empty.description"),
      action: t("knowledgePage.action.organizeNew"),
      tone: "slate",
      icon: FolderOpen,
      onClick: () => setActiveView("import"),
    },
    {
      title: t("knowledgePage.status.ready"),
      description: t("knowledgePage.stateCard.ready.description"),
      action: t("knowledgePage.action.useForWriting"),
      tone: "emerald",
      icon: Check,
      onClick: () => handleOpenKnowledgeComposer(),
    },
    {
      title: t("knowledgePage.status.pendingReview"),
      description: t("knowledgePage.stateCard.pending.description"),
      action: t("knowledgePage.action.review"),
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
      title: t("knowledgePage.status.needsSupplement"),
      description: t("knowledgePage.stateCard.needsSupplement.description"),
      action: t("knowledgePage.action.supplementMaterial"),
      tone: "rose",
      icon: AlertTriangle,
      onClick: () => setActiveView("import"),
    },
    {
      title: t("knowledgePage.status.failed"),
      description: t("knowledgePage.stateCard.failed.description"),
      action: t("knowledgePage.action.reorganize"),
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
                  {t("knowledgePage.hero.title")}
                </h1>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t("knowledgePage.hero.description")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAgentKnowledgeHub}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                >
                  <MessageSquareText className="h-4 w-4" />
                  {t("knowledgePage.action.backToWriting")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("import")}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-4 text-sm font-medium text-white transition hover:border-emerald-800 hover:bg-emerald-800"
                >
                  <Upload className="h-4 w-4" />
                  {t("knowledgePage.action.organizeNew")}
                </button>
              </div>
            </div>

            <div className="mt-5 grid overflow-hidden rounded-3xl border border-slate-200 bg-slate-50/70 md:grid-cols-4">
              {[
                {
                  title: t("knowledgePage.summary.readyTitle"),
                  value: readyPackCount,
                  unit: t("knowledgePage.unit.pack"),
                  className: "text-emerald-700",
                  iconClassName:
                    "border-emerald-200 bg-emerald-50 text-emerald-700",
                  icon: Check,
                },
                {
                  title: t("knowledgePage.status.pendingReview"),
                  value: reviewPackCount,
                  unit: t("knowledgePage.unit.pack"),
                  className: "text-emerald-700",
                  iconClassName:
                    "border-emerald-200 bg-emerald-50 text-emerald-700",
                  icon: ClipboardCheck,
                },
                {
                  title: t("knowledgePage.status.needsSupplement"),
                  value: missingPackCount,
                  unit: t("knowledgePage.unit.pack"),
                  className: "text-amber-700",
                  iconClassName: "border-amber-200 bg-amber-50 text-amber-700",
                  icon: AlertTriangle,
                },
                {
                  title: t("knowledgePage.summary.recommendedTitle"),
                  value: currentUseText,
                  unit: "",
                  className: "text-emerald-700",
                  iconClassName:
                    "border-emerald-200 bg-emerald-50 text-emerald-700",
                  icon: FileText,
                },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <section
                    key={item.title}
                    className={cn(
                      "flex min-w-0 items-center gap-3 px-5 py-4",
                      index > 0 &&
                        "border-t border-slate-200 md:border-l md:border-t-0",
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
                    {t("knowledgePage.catalog.title")}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {t("knowledgePage.catalog.description")}
                  </p>
                </div>
                {catalogStatus === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : null}
              </div>

              <div className="mt-5 overflow-hidden rounded-[20px] border border-slate-200">
                <div className="grid grid-cols-[minmax(0,1.4fr)_160px_220px] bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
                  <span>{t("knowledgePage.label.materialName")}</span>
                  <span>{t("knowledgePage.label.status")}</span>
                  <span>{t("knowledgePage.label.actions")}</span>
                </div>
                {packs.length === 0 && catalogStatus !== "loading" ? (
                  <div className="p-5">
                    <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 p-5">
                      <h3 className="text-base font-semibold text-slate-950">
                        {t("knowledgePage.empty.title")}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-slate-500">
                        {t("knowledgePage.empty.description")}
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveView("import")}
                        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800"
                      >
                        <Upload className="h-4 w-4" />
                        {t("knowledgePage.action.organizeNew")}
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
                              t("knowledgePage.catalog.previewFallback")}
                          </p>
                        </div>
                      </div>
                      <StatusPill status={pack.metadata.status} />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            openPack(pack.metadata.name, "overview")
                          }
                          className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          {t("knowledgePage.action.open")}
                        </button>
                        <button
                          type="button"
                          disabled={
                            actionBusy ||
                            (pack.metadata.status !== "ready" &&
                              renderPackActionLabel(pack) === t("knowledgePage.action.useForWriting"))
                          }
                          onClick={() => {
                            if (pack.metadata.status === "ready") {
                              handleOpenKnowledgeComposer(pack.metadata.name);
                            } else if (isFailedStatus(pack.metadata.status)) {
                              setPackNameInput(pack.metadata.name);
                              setActiveView("import");
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
                  {t("knowledgePage.nextSteps.title")}
                </h2>
                <div className="mt-5 space-y-0">
                  {[
                    {
                      index: "1",
                      title: t("knowledgePage.action.organizeNew"),
                      description: t("knowledgePage.nextSteps.organize.description"),
                      icon: FileText,
                    },
                    {
                      index: "2",
                      title: t("knowledgePage.nextSteps.review.title"),
                      description: t("knowledgePage.nextSteps.review.description"),
                      icon: ClipboardCheck,
                    },
                    {
                      index: "3",
                      title: t("knowledgePage.nextSteps.select.title"),
                      description: t("knowledgePage.nextSteps.select.description"),
                      icon: Check,
                    },
                  ].map((item, stepIndex, items) => {
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.index}
                        className="relative flex gap-4 pb-6 last:pb-0"
                      >
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
                    {t("knowledgePage.notice.confirmationGate")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView("states")}
                  className="shrink-0 text-sm font-semibold text-emerald-800 underline-offset-4 hover:underline"
                >
                  {t("knowledgePage.action.viewStateGuide")}
                </button>
              </div>
            </section>
          </section>
        ) : null}

        {activeView === "import" ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">{t("knowledgePage.import.breadcrumb")}</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {t("knowledgePage.action.organizeNew")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {t("knowledgePage.import.description")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveView("overview")}
                className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {t("knowledgePage.action.backToMaterials")}
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
                        {t("knowledgePage.import.purpose.title")}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {t("knowledgePage.import.purpose.description")}
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
                        {t("knowledgePage.import.source.title")}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {t("knowledgePage.import.source.description")}
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        {[
                          t("knowledgePage.import.source.type.interview"),
                          t("knowledgePage.import.source.type.productIntro"),
                          t("knowledgePage.import.source.type.operationDoc"),
                          t("knowledgePage.import.source.type.reviewRecord"),
                        ].map((label) => (
                          <div
                            key={label}
                            className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500"
                          >
                            <FileText className="mx-auto mb-2 h-5 w-5 text-slate-500" />
                            {label}
                          </div>
                        ))}
                      </div>
                      <label className="mt-4 grid gap-1.5 text-xs font-medium text-slate-600">
                        {t("knowledgePage.import.source.bodyLabel")}
                        <textarea
                          value={sourceText}
                          onChange={(event) =>
                            setSourceText(event.target.value)
                          }
                          placeholder={t("knowledgePage.import.source.placeholder")}
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
                        {t("knowledgePage.import.agent.title")}
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {t("knowledgePage.import.agent.description")}
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-4">
                        {[
                          [t("knowledgePage.import.agent.step.read"), sourceText.trim() ? t("knowledgePage.import.agent.state.done") : t("knowledgePage.import.agent.state.waiting")],
                          [t("knowledgePage.import.agent.step.extract"), t("knowledgePage.import.agent.state.inChat")],
                          [
                            t("knowledgePage.import.agent.step.generateDraft"),
                            t("knowledgePage.import.agent.state.inChat"),
                          ],
                          [t("knowledgePage.import.agent.step.checkGap"), t("knowledgePage.import.agent.state.inChat")],
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
                        onClick={handleContinueKnowledgeOrganizeInAgent}
                        disabled={actionBusy}
                        className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:opacity-60"
                      >
                        <Sparkles className="h-4 w-4" />
                        {t("knowledgePage.action.organizeInChat")}
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <section className="rounded-[22px] border border-slate-200 bg-slate-50 p-5">
                  <h3 className="text-base font-semibold text-slate-950">
                    {t("knowledgePage.import.settings.title")}
                  </h3>
                  <label className="mt-4 grid gap-1.5 text-xs font-medium text-slate-600">
                    {t("knowledgePage.label.materialName")}
                    <input
                      value={packDescription}
                      onChange={(event) => {
                        const nextName = event.target.value;
                        setPackDescription(nextName);
                        setPackNameInput(normalizePackNameInput(nextName));
                      }}
                      placeholder={t("knowledgePage.import.settings.namePlaceholder")}
                      className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                  <label className="mt-4 grid gap-1.5 text-xs font-medium text-slate-600">
                    {t("knowledgePage.label.purpose")}
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
                    {t("knowledgePage.import.settings.defaultUsageHint")}
                  </div>
                </section>
              </aside>
              <section className="rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 xl:col-span-2">
                {t("knowledgePage.notice.unconfirmedNotAutoUsed")}
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
                    {t("knowledgePage.detail.empty.title")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    {t("knowledgePage.detail.empty.description")}
                  </p>
                </div>
              </div>
            ) : detailStatus === "loading" ? (
              <div className="flex min-h-[420px] items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("knowledgePage.detail.loading")}
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
                    {t("knowledgePage.action.backToMaterials")}
                  </button>
                </div>

                <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
                  <div className="space-y-5">
                    <section className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
                      <h3 className="text-xl font-semibold text-slate-950">
                        {t("knowledgePage.detail.document.title")}
                      </h3>
                      <div className="mt-5 flex flex-wrap items-center gap-5 rounded-[22px] bg-slate-50 p-5">
                        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-700">
                          <FileText className="h-10 w-10" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-lg font-semibold text-slate-950">
                            {`${getPackTitle(selectedPack)}.md`}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-500">
                            {t("knowledgePage.detail.document.description")}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => setDetailTab("content")}
                            className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-700 bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800"
                          >
                            {t("knowledgePage.action.viewDocumentContent")}
                          </button>
                        </div>
                      </div>
                      {detailTab === "content" ? (
                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-sm font-semibold text-slate-950">
                            {t("knowledgePage.detail.document.contentTitle")}
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                            {sanitizeKnowledgePreview(selectedPack.guide) ||
                              sanitizeKnowledgePreview(selectedPack.preview) ||
                              t("knowledgePage.detail.document.empty")}
                          </p>
                        </div>
                      ) : null}
                    </section>

                    <section className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
                      <h3 className="text-xl font-semibold text-slate-950">
                        {t("knowledgePage.detail.confirmation.title")}
                      </h3>
                      <div className="mt-5 divide-y divide-slate-100">
                        {getConfirmationChecklist(selectedPack).map(
                          ({ label, state, tone }) => (
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
                          ),
                        )}
                      </div>
                    </section>
                  </div>

                  <aside className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
                    <h3 className="text-xl font-semibold text-slate-950">
                      {t("knowledgePage.detail.afterConfirm.title")}
                    </h3>
                    <div className="mt-7 space-y-9">
                      {[
                        [t("knowledgePage.detail.afterConfirm.ready.title"), t("knowledgePage.detail.afterConfirm.ready.description")],
                        [
                          t("knowledgePage.detail.afterConfirm.explicit.title"),
                          t("knowledgePage.detail.afterConfirm.explicit.description"),
                        ],
                        [
                          t("knowledgePage.detail.afterConfirm.preserve.title"),
                          t("knowledgePage.detail.afterConfirm.preserve.description"),
                        ],
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
                        {t("knowledgePage.detail.advanced.title")}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        {t("knowledgePage.detail.advanced.description")}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-expanded={advancedInfoOpen}
                      onClick={() => setAdvancedInfoOpen((current) => !current)}
                      className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {advancedInfoOpen
                        ? t("knowledgePage.detail.advanced.collapse")
                        : t("knowledgePage.detail.advanced.expand")}
                    </button>
                  </div>

                  {advancedInfoOpen ? (
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      {[
                        {
                          title: t("knowledgePage.detail.advanced.source.title"),
                          value: t("knowledgePage.detail.advanced.source.value", { count: selectedPack.sourceCount }),
                          description:
                            sanitizeKnowledgePreview(
                              selectedPack.sources[0]?.preview,
                            ) || t("knowledgePage.detail.advanced.source.description"),
                        },
                        {
                          title: t("knowledgePage.detail.advanced.runs.title"),
                          value: t("knowledgePage.detail.advanced.runs.value", { count: selectedPack.runCount }),
                          description:
                            selectedPack.runCount > 0
                              ? t("knowledgePage.detail.advanced.runs.description")
                              : t("knowledgePage.detail.advanced.runs.empty"),
                        },
                        {
                          title: t("knowledgePage.detail.advanced.compiled.title"),
                          value: t("knowledgePage.detail.advanced.compiled.value", { count: selectedPack.compiledCount }),
                          description:
                            sanitizeKnowledgePreview(
                              selectedPack.compiled[0]?.preview,
                            ) || t("knowledgePage.detail.advanced.compiled.description"),
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
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <p className="text-sm leading-6 text-slate-500">
                      {t("knowledgePage.detail.supplementHint")}
                    </p>
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
                        {t("knowledgePage.action.confirmReady")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenKnowledgeComposer(
                            selectedPack.metadata.name,
                          )
                        }
                        className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-700 px-6 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800"
                      >
                        <MessageSquareText className="h-4 w-4" />
                        {t("knowledgePage.action.useForWriting")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveView("import")}
                      className="inline-flex h-12 min-w-40 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {t("knowledgePage.action.supplementMaterial")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveView("overview")}
                      className="inline-flex h-12 min-w-40 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {t("knowledgePage.action.later")}
                    </button>
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="rounded-[20px] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {t("knowledgePage.detail.error")}
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
                  {t("knowledgePage.save.title")}
                </h2>
              </div>
              <label className="mt-5 grid gap-1.5 text-xs font-medium text-slate-600">
                {t("knowledgePage.save.contentLabel")}
                <textarea
                  value={sourceText}
                  onChange={(event) => {
                    setSourceText(event.target.value);
                    setSaveCompletedPackName("");
                  }}
                  placeholder={t("knowledgePage.save.contentPlaceholder")}
                  className="min-h-[260px] resize-y rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveDraftToMaterials}
                disabled={actionBusy || !sourceText.trim()}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-emerald-700 bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:opacity-60"
              >
                {t("knowledgePage.action.saveToMaterials")}
              </button>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              <h2 className="text-lg font-semibold text-slate-950">
                {t("knowledgePage.save.target.title")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {t("knowledgePage.save.target.description")}
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
                  {t("knowledgePage.save.target.existing")}
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
                  {t("knowledgePage.save.target.new")}
                </button>
              </div>
              <label className="mt-4 grid gap-1.5 text-xs font-medium text-slate-600">
                {t("knowledgePage.save.newName")}
                <input
                  value={packDescription}
                  onChange={(event) => {
                    const nextName = event.target.value;
                    setPackDescription(nextName);
                    setPackNameInput(normalizePackNameInput(nextName));
                  }}
                  placeholder={t("knowledgePage.save.namePlaceholder")}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <div className="mt-4 space-y-3">
                <div className="text-sm font-semibold text-slate-700">
                  {t("knowledgePage.save.existingMaterials")}
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
                            {t("knowledgePage.save.lastUpdated")}
                            {new Date(pack.updatedAt).toLocaleDateString(
                              i18n.language,
                            )}
                          </span>
                        </span>
                        {active ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    {t("knowledgePage.save.noExisting")}
                  </div>
                )}
              </div>
              <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-500">
                {t("knowledgePage.save.existingHint")}
              </p>
            </section>

            <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/5">
              <div className="mx-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <Check className="h-12 w-12" />
              </div>
              <h2 className="mt-6 text-center text-xl font-semibold text-slate-950">
                {saveCompletedPackName
                  ? t("knowledgePage.save.completed.title", {
                      name: packs.find(
                        (pack) => pack.metadata.name === saveCompletedPackName,
                      )
                        ? getPackTitle(
                            packs.find(
                              (pack) =>
                                pack.metadata.name === saveCompletedPackName,
                            )!,
                          )
                        : saveCompletedPackName,
                    })
                  : t("knowledgePage.save.pending.title")}
              </h2>
              <div className="mt-6 space-y-4 text-sm text-slate-700">
                {saveCompletedPackName ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        ✓
                      </span>
                      {t("knowledgePage.save.completed.enteredMaterials")}
                    </div>
                    <div className="flex items-center gap-3 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                      {t("knowledgePage.save.completed.needConfirm")}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        1
                      </span>
                      {t("knowledgePage.save.pending.stepSave")}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                        2
                      </span>
                      {t("knowledgePage.save.pending.stepConfirm")}
                    </div>
                    <div className="flex items-center gap-3 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                      {t("knowledgePage.save.pending.noAutoChange")}
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
                  {t("knowledgePage.action.review")}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView("overview")}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {t("knowledgePage.action.handleLater")}
                </button>
              </div>
            </section>
            <div className="xl:col-span-3 rounded-[20px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
              {t("knowledgePage.save.footer")}
            </div>
          </section>
        ) : null}

        {activeView === "states" ? (
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-3xl font-semibold text-slate-950">
                {t("knowledgePage.states.title")}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveView("overview")}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                >
                  <ListChecks className="h-4 w-4" />
                  {t("knowledgePage.action.backToMaterials")}
                </button>
                <ProjectSelector
                  value={selectedProjectId}
                  onChange={handleProjectChange}
                  placeholder={t("knowledgePage.project.placeholder")}
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
                      {t("knowledgePage.states.nextAction", { action: card.action })}
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="mt-8 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800">
              {t("knowledgePage.states.footer")}
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
              {t("knowledgePage.composer.title")}
            </h2>
            <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
              <section className="space-y-5 rounded-[22px] border border-slate-200 bg-white p-5">
                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {t("knowledgePage.composer.persona.title")}
                  </h3>
                  <div className="mt-4 grid gap-3">
                    {readyPersonaPacks.length > 0 ? (
                      readyPersonaPacks.map((pack) => {
                        const checked =
                          composerPersonaPackName === pack.metadata.name;
                        return (
                          <button
                            key={pack.metadata.name}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            data-testid={`knowledge-composer-persona-${pack.metadata.name}`}
                            onClick={() =>
                              setComposerPersonaPackName(pack.metadata.name)
                            }
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
                                {t("knowledgePage.status.ready")}
                              </span>
                            </span>
                            {checked ? <Check className="h-4 w-4" /> : null}
                          </button>
                        );
                      })
                    ) : (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                        {t("knowledgePage.composer.persona.empty")}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-slate-950">
                    {t("knowledgePage.composer.reference.title")}
                  </h3>
                  <div className="mt-4 grid gap-3">
                    {readyDataPacks.map((pack) => {
                      const checked = composerDataPackNames.includes(
                        pack.metadata.name,
                      );
                      return (
                        <button
                          key={pack.metadata.name}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          data-testid={`knowledge-composer-data-${pack.metadata.name}`}
                          onClick={() =>
                            handleToggleComposerDataPack(pack.metadata.name)
                          }
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
                              {t("knowledgePage.status.ready")}
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
                            {t("knowledgePage.composer.unavailableMaterial", {
                              status: renderMaterialStatus(pack),
                            })}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-[22px] border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold text-slate-950">
                  {t("knowledgePage.composer.usage.title")}
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
                    {t("knowledgePage.composer.usage.personaFrom")}
                    {composerPersonaPackName
                      ? t("knowledgePage.composer.usage.selectedPersona")
                      : t("knowledgePage.composer.usage.defaultVoice")}
                  </div>
                  <div className="py-3 text-sm text-slate-700">
                    {t("knowledgePage.composer.usage.factsFrom")}
                  </div>
                  <div className="py-3 text-sm text-slate-700">
                    {t("knowledgePage.composer.usage.rulesFrom")}
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <p className="text-sm text-slate-500">
                  {t("knowledgePage.composer.selectedCount", {
                    count: composerSelectedCount,
                  })}
                </p>
                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  {t("knowledgePage.composer.pendingBlocked")}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setKnowledgeComposerOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {t("knowledgePage.action.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmKnowledgeComposer}
                  disabled={composerSelectedCount === 0}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-emerald-700 bg-emerald-700 px-6 text-sm font-semibold text-white transition hover:border-emerald-800 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("knowledgePage.action.confirmUse")}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
