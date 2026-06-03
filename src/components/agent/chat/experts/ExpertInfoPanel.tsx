import { memo, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Search,
  Sparkles,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import styled from "styled-components";
import {
  getSeededExpertCatalog,
  readCachedExpertCatalog,
  type ExpertAvatar,
  type ExpertCatalog,
  type ExpertProfile,
} from "@/features/experts";
import {
  getCurrentSkillCatalogSnapshot,
  listSkillCatalogSkillEntries,
  type SkillCatalogSkillEntry,
} from "@/lib/api/skillCatalog";
import type { ServiceSkillItem } from "@/lib/api/serviceSkills";
import type { Skill } from "@/lib/api/skills";

type ExpertPanelSectionKey =
  | "overview"
  | "memory"
  | "diary"
  | "skills"
  | "workflow";

interface ExpertInfoPanelProps {
  requestMetadata?: Record<string, unknown> | null;
  localSkills?: Skill[];
  serviceSkills?: ServiceSkillItem[];
  skillsLoading?: boolean;
  onSkillRefsChange?: (skillRefs: string[]) => void;
}

interface ResolvedExpertInfo {
  id: string;
  title: string;
  summary: string;
  avatar: ExpertAvatar;
  category: string;
  tags: string[];
  promptStarters: string[];
  showcase: Array<{ title: string; body: string }>;
  memoryTemplateRef?: string;
  skillRefs: string[];
  workflowRefs: string[];
  memoryEnabled: boolean;
  workflowEnabled: boolean;
  usageCount?: number;
  likeCount?: number;
}

type ExpertSkillCandidateSource = "local" | "service" | "catalog";

interface ExpertSkillCandidate {
  ref: string;
  title: string;
  summary: string;
  source: ExpertSkillCandidateSource;
  sourceLabel: string;
}

const Panel = styled.aside`
  display: flex;
  width: 328px;
  max-width: 34vw;
  min-width: 300px;
  flex: 0 0 328px;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  border: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.92));
  border-radius: 24px;
  background: var(--lime-surface, #ffffff);
  box-shadow: 0 24px 56px -42px var(--lime-shadow-color, rgba(15, 23, 42, 0.18));
  color: var(--lime-text, #1a3b2b);
  padding: 16px;

  @media (max-width: 1120px) {
    display: none;
  }
`;

const PanelTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--lime-text-strong, #123d2e);
  font-size: 14px;
  font-weight: 760;
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
`;

const Avatar = styled.div`
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: var(--lime-brand-soft, #ecfdf5);
  color: var(--lime-brand-strong, #166534);
  font-size: 24px;
  box-shadow: inset 0 0 0 1px
    var(--lime-surface-border, rgba(226, 240, 226, 0.9));
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const HeaderText = styled.div`
  min-width: 0;
`;

const ExpertTitle = styled.h2`
  margin: 0;
  overflow: hidden;
  color: var(--lime-text-strong, #123d2e);
  font-size: 16px;
  font-weight: 780;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ExpertSummary = styled.p`
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--lime-text-muted, #6b826b);
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionHeaderRow = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const SectionToggleButton = styled.button`
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  border: 0;
  background: transparent;
  color: var(--lime-text-strong, #123d2e);
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  font-weight: 740;
  text-align: left;
`;

const SectionTitle = styled.span`
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
`;

const IconActionButton = styled.button`
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--lime-brand, #10b981);
  border-radius: 10px;
  background: var(--lime-brand-soft, #ecfdf5);
  color: var(--lime-brand-strong, #166534);
  cursor: pointer;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;

  &:hover {
    border-color: var(--lime-brand-strong, #166534);
    background: var(--lime-surface, #ffffff);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid var(--lime-focus-ring, rgba(16, 185, 129, 0.28));
    outline-offset: 2px;
  }
`;

const Card = styled.div`
  border: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.88));
  border-radius: 16px;
  background: var(--lime-surface-soft, #f8fcf9);
  padding: 12px;
`;

const BlockTitle = styled.h3`
  margin: 0 0 7px;
  color: var(--lime-text-strong, #123d2e);
  font-size: 12px;
  font-weight: 760;

  &:not(:first-child) {
    margin-top: 12px;
  }
`;

const BodyText = styled.p`
  margin: 0;
  color: var(--lime-text, #1a3b2b);
  font-size: 12px;
  line-height: 1.65;
`;

const BulletList = styled.ul`
  margin: 0;
  padding-left: 17px;
  color: var(--lime-text, #1a3b2b);
  font-size: 12px;
  line-height: 1.65;
`;

const ChipList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

const Chip = styled.span`
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 6px;
  border-radius: 10px;
  background: var(--lime-surface-muted, #f2f7f3);
  color: var(--lime-text, #1a3b2b);
  font-size: 12px;
  line-height: 1;
  padding: 7px 9px;
`;

const ChipRemoveButton = styled.button`
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: var(--lime-surface, #ffffff);
  color: var(--lime-text-muted, #6b826b);
  cursor: pointer;
  padding: 0;

  &:hover {
    background: var(--lime-brand-soft, #ecfdf5);
    color: var(--lime-brand-strong, #166534);
  }
`;

const EmptyCard = styled(Card)`
  color: var(--lime-text-muted, #6b826b);
  font-size: 12px;
`;

const WorkflowList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 2px 0 0;
`;

const WorkflowStep = styled.li`
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  column-gap: 9px;
  color: var(--lime-text, #1a3b2b);
  font-size: 12px;
  line-height: 1.5;

  &::before {
    content: "";
    width: 8px;
    height: 8px;
    margin-top: 5px;
    border: 1px solid var(--lime-brand, #10b981);
    border-radius: 999px;
    background: var(--lime-surface, #ffffff);
    box-shadow: 0 0 0 3px var(--lime-brand-soft, #ecfdf5);
  }

  &:not(:last-child)::after {
    content: "";
    grid-column: 1;
    width: 1px;
    height: 22px;
    margin: 2px auto;
    background: var(--lime-surface-border-strong, #c7e7d1);
  }
`;

const SkillDialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 52, 38, 0.28);
  padding: 24px;
`;

const SkillDialog = styled.div`
  display: flex;
  width: min(560px, calc(100vw - 48px));
  max-height: min(720px, calc(100vh - 48px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.95));
  border-radius: 24px;
  background: var(--lime-surface, #ffffff);
  box-shadow: 0 32px 90px -46px var(--lime-shadow-color, rgba(15, 23, 42, 0.32));
`;

const SkillDialogHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 12px;
  align-items: start;
  border-bottom: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.88));
  padding: 18px 18px 14px;
`;

const SkillDialogTitle = styled.h2`
  margin: 0;
  color: var(--lime-text-strong, #123d2e);
  font-size: 17px;
  font-weight: 780;
  line-height: 1.35;
`;

const SkillDialogSubtitle = styled.p`
  margin: 5px 0 0;
  color: var(--lime-text-muted, #6b826b);
  font-size: 12px;
  line-height: 1.55;
`;

const DialogCloseButton = styled(IconActionButton)`
  border-color: var(--lime-surface-border, rgba(226, 240, 226, 0.92));
  background: var(--lime-surface-soft, #f8fcf9);
  color: var(--lime-text-muted, #6b826b);
`;

const SkillDialogBody = styled.div`
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 14px 18px 18px;
`;

const SkillSearchBox = styled.label`
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  border: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.92));
  border-radius: 14px;
  background: var(--lime-surface-soft, #f8fcf9);
  color: var(--lime-text-muted, #6b826b);
  padding: 10px 12px;

  input {
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--lime-text, #1a3b2b);
    font-size: 13px;
  }
`;

const SkillCandidateList = styled.div`
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 2px;
`;

const SkillCandidateCard = styled.div`
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.9));
  border-radius: 16px;
  background: var(--lime-surface-soft, #f8fcf9);
  padding: 10px;
`;

const SkillCandidateAvatar = styled.div`
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  background: var(--lime-brand-soft, #ecfdf5);
  color: var(--lime-brand-strong, #166534);
  font-size: 13px;
  font-weight: 780;
`;

const SkillCandidateContent = styled.div`
  min-width: 0;
`;

const SkillCandidateTitle = styled.div`
  overflow: hidden;
  color: var(--lime-text-strong, #123d2e);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SkillCandidateSummary = styled.div`
  display: -webkit-box;
  margin-top: 3px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--lime-text-muted, #6b826b);
  font-size: 12px;
  line-height: 1.45;
`;

const SkillCandidateMeta = styled.div`
  margin-top: 6px;
  color: var(--lime-brand-strong, #166534);
  font-size: 11px;
  font-weight: 700;
`;

const CandidateAddButton = styled.button<{ $added?: boolean }>`
  display: inline-flex;
  min-width: 68px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid
    ${({ $added }) =>
      $added
        ? "var(--lime-surface-border, rgba(226, 240, 226, 0.92))"
        : "var(--lime-brand, #10b981)"};
  border-radius: 999px;
  background: ${({ $added }) =>
    $added
      ? "var(--lime-surface-muted, #f2f7f3)"
      : "var(--lime-brand-soft, #ecfdf5)"};
  color: ${({ $added }) =>
    $added
      ? "var(--lime-text-muted, #6b826b)"
      : "var(--lime-brand-strong, #166534)"};
  cursor: ${({ $added }) => ($added ? "default" : "pointer")};
  font-size: 12px;
  font-weight: 740;
  padding: 7px 10px;

  &:not(:disabled):hover {
    border-color: var(--lime-brand-strong, #166534);
    background: var(--lime-surface, #ffffff);
  }
`;

const SkillEmptyState = styled(EmptyCard)`
  display: flex;
  min-height: 96px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
`;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function pickStringArray(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function pickBoolean(
  record: Record<string, unknown> | null,
  key: string,
  fallback: boolean,
) {
  const value = record?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function normalizeRefKey(ref: string): string {
  return ref.trim().toLowerCase();
}

function sanitizeTestId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupeSkillRefs(refs: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const ref of refs) {
    const normalized = ref.trim();
    if (!normalized) {
      continue;
    }
    const key = normalizeRefKey(normalized);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function extractExpertMetadata(metadata?: Record<string, unknown> | null) {
  const root = asRecord(metadata);
  const expert = asRecord(root?.expert);
  const harness = asRecord(asRecord(root?.harness)?.expert);
  const expertId =
    pickString(expert, "expertId") || pickString(harness, "expert_id");
  if (!expertId) {
    return null;
  }

  return {
    id: expertId,
    title: pickString(expert, "title") || pickString(harness, "title"),
    category: pickString(expert, "category") || pickString(harness, "category"),
    source: pickString(expert, "source") || pickString(harness, "source"),
    memoryTemplateRef:
      pickString(expert, "memoryTemplateRef") ||
      pickString(harness, "memory_template_ref"),
    skillRefs:
      pickStringArray(expert, "skillRefs").length > 0
        ? pickStringArray(expert, "skillRefs")
        : pickStringArray(harness, "skill_refs"),
    workflowRefs:
      pickStringArray(expert, "workflowRefs").length > 0
        ? pickStringArray(expert, "workflowRefs")
        : pickStringArray(harness, "workflow_refs"),
    memoryEnabled:
      pickBoolean(expert, "memoryEnabled", true) &&
      pickBoolean(harness, "memory_enabled", true),
    workflowEnabled:
      pickBoolean(expert, "workflowEnabled", true) &&
      pickBoolean(harness, "workflow_enabled", true),
  };
}

function getCatalogs(): ExpertCatalog[] {
  const cached = readCachedExpertCatalog();
  const seeded = getSeededExpertCatalog();
  return cached ? [cached, seeded] : [seeded];
}

function findCatalogExpert(expertId: string): ExpertProfile | null {
  for (const catalog of getCatalogs()) {
    const matched = catalog.items.find((item) => item.id === expertId);
    if (matched) {
      return matched;
    }
  }
  return null;
}

function renderAvatar(avatar: ExpertAvatar, title: string) {
  if (avatar.kind === "url" || avatar.kind === "asset") {
    return <img src={avatar.value} alt={title} />;
  }
  return avatar.value;
}

function formatRefLabel(ref: string) {
  const withoutPrefix = ref.includes(":") ? ref.split(":").pop() || ref : ref;
  const withoutVersion = withoutPrefix.split("@")[0] || withoutPrefix;
  return withoutVersion
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function localSkillRef(skill: Skill): string {
  const key = skill.key?.trim() || skill.directory?.trim() || skill.name.trim();
  return key.startsWith("skill:") ? key : `skill:${key}`;
}

function serviceSkillRef(skill: Pick<ServiceSkillItem, "id">): string {
  return `service-skill:${skill.id}`;
}

function catalogSkillRef(entry: SkillCatalogSkillEntry): string {
  return entry.skillId?.trim()
    ? `skill:${entry.skillId.trim()}`
    : entry.id.trim();
}

function candidateInitial(title: string): string {
  const normalized = title.trim();
  return normalized ? normalized.slice(0, 1).toUpperCase() : "S";
}

function upsertSkillCandidate(
  map: Map<string, ExpertSkillCandidate>,
  candidate: ExpertSkillCandidate,
) {
  const key = normalizeRefKey(candidate.ref);
  if (!key || map.has(key)) {
    return;
  }
  map.set(key, candidate);
}

function buildSkillCandidates(input: {
  localSkills?: Skill[];
  serviceSkills?: ServiceSkillItem[];
}): ExpertSkillCandidate[] {
  const candidates = new Map<string, ExpertSkillCandidate>();

  for (const skill of input.localSkills || []) {
    const ref = localSkillRef(skill);
    upsertSkillCandidate(candidates, {
      ref,
      title: skill.name || skill.key || skill.directory,
      summary: skill.description || skill.directory || ref,
      source: "local",
      sourceLabel: skill.catalogSource === "remote" ? "remote" : "local",
    });
  }

  for (const skill of input.serviceSkills || []) {
    upsertSkillCandidate(candidates, {
      ref: serviceSkillRef(skill),
      title: skill.title,
      summary: skill.summary,
      source: "service",
      sourceLabel: skill.category || "",
    });
  }

  try {
    const catalog = getCurrentSkillCatalogSnapshot();
    for (const item of catalog.items) {
      upsertSkillCandidate(candidates, {
        ref: serviceSkillRef(item),
        title: item.title,
        summary: item.summary,
        source: "service",
        sourceLabel: item.category || "",
      });
    }
    for (const entry of listSkillCatalogSkillEntries(catalog)) {
      upsertSkillCandidate(candidates, {
        ref: catalogSkillRef(entry),
        title: entry.title,
        summary: entry.summary,
        source: "catalog",
        sourceLabel: entry.groupKey || "",
      });
    }
  } catch {
    // 目录读取失败不应阻断专家信息面板；已绑定技能仍按 ref 展示。
  }

  const sourceOrder: Record<ExpertSkillCandidateSource, number> = {
    local: 0,
    service: 1,
    catalog: 2,
  };

  return [...candidates.values()].sort((left, right) => {
    const sourceDiff = sourceOrder[left.source] - sourceOrder[right.source];
    if (sourceDiff !== 0) {
      return sourceDiff;
    }
    return left.title.localeCompare(right.title, "zh-CN");
  });
}

function filterSkillCandidates(
  candidates: ExpertSkillCandidate[],
  query: string,
): ExpertSkillCandidate[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return candidates;
  }

  return candidates.filter((candidate) =>
    [
      candidate.ref,
      candidate.title,
      candidate.summary,
      candidate.sourceLabel,
    ].some((value) => value.toLowerCase().includes(normalized)),
  );
}

function resolveSkillLabel(
  ref: string,
  candidates: ExpertSkillCandidate[],
): string {
  const matched = candidates.find(
    (candidate) => normalizeRefKey(candidate.ref) === normalizeRefKey(ref),
  );
  return matched?.title || formatRefLabel(ref);
}

function resolveExpertInfo(
  metadata?: Record<string, unknown> | null,
): ResolvedExpertInfo | null {
  const extracted = extractExpertMetadata(metadata);
  if (!extracted) {
    return null;
  }

  const catalogExpert = findCatalogExpert(extracted.id);
  return {
    id: extracted.id,
    title: extracted.title || catalogExpert?.title || extracted.id,
    summary: catalogExpert?.summary || "",
    avatar: catalogExpert?.avatar || { kind: "emoji", value: "🧑‍💼" },
    category: extracted.category || catalogExpert?.category || "expert",
    tags: catalogExpert?.tags || [],
    promptStarters: catalogExpert?.promptStarters || [],
    showcase: catalogExpert?.showcase || [],
    memoryTemplateRef:
      extracted.memoryEnabled === false
        ? undefined
        : extracted.memoryTemplateRef ||
          catalogExpert?.release.memoryTemplateRef,
    skillRefs:
      extracted.skillRefs.length > 0
        ? extracted.skillRefs
        : catalogExpert?.release.skillRefs || [],
    workflowRefs:
      extracted.workflowEnabled === false
        ? []
        : extracted.workflowRefs.length > 0
          ? extracted.workflowRefs
          : catalogExpert?.release.workflowRefs || [],
    memoryEnabled: extracted.memoryEnabled,
    workflowEnabled: extracted.workflowEnabled,
    usageCount: catalogExpert?.stats.usageCount,
    likeCount: catalogExpert?.stats.likeCount,
  };
}

function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState<Set<ExpertPanelSectionKey>>(
    () => new Set(),
  );

  const toggle = (key: ExpertPanelSectionKey) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return { collapsed, toggle };
}

export const ExpertInfoPanel = memo(function ExpertInfoPanel({
  requestMetadata,
  localSkills,
  serviceSkills,
  skillsLoading = false,
  onSkillRefsChange,
}: ExpertInfoPanelProps) {
  const { t } = useTranslation("agent");
  const expert = useMemo(
    () => resolveExpertInfo(requestMetadata),
    [requestMetadata],
  );
  const { collapsed, toggle } = useCollapsedSections();
  const [addedSkillRefs, setAddedSkillRefs] = useState<string[]>([]);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const candidates = useMemo(
    () => buildSkillCandidates({ localSkills, serviceSkills }),
    [localSkills, serviceSkills],
  );
  const filteredCandidates = useMemo(
    () => filterSkillCandidates(candidates, skillQuery),
    [candidates, skillQuery],
  );

  const baseSkillRefs = useMemo(
    () => (expert ? expert.skillRefs : []),
    [expert],
  );
  const effectiveSkillRefs = useMemo(
    () => dedupeSkillRefs([...baseSkillRefs, ...addedSkillRefs]),
    [addedSkillRefs, baseSkillRefs],
  );
  const baseSkillRefKeys = useMemo(
    () => new Set(baseSkillRefs.map(normalizeRefKey)),
    [baseSkillRefs],
  );
  const effectiveSkillRefKeys = useMemo(
    () => new Set(effectiveSkillRefs.map(normalizeRefKey)),
    [effectiveSkillRefs],
  );

  useEffect(() => {
    if (!expert) {
      return;
    }
    onSkillRefsChange?.(effectiveSkillRefs);
  }, [effectiveSkillRefs, expert, onSkillRefsChange]);

  useEffect(() => {
    setAddedSkillRefs([]);
    setSkillQuery("");
    setSkillPickerOpen(false);
  }, [expert?.id]);

  if (!expert) {
    return null;
  }

  const renderSection = (
    key: ExpertPanelSectionKey,
    title: string,
    icon: ReactNode,
    content: ReactNode,
    action?: ReactNode,
  ) => {
    const isCollapsed = collapsed.has(key);
    return (
      <Section data-testid={`expert-info-section-${key}`}>
        <SectionHeaderRow>
          <SectionToggleButton
            type="button"
            aria-expanded={!isCollapsed}
            onClick={() => toggle(key)}
          >
            <SectionTitle>
              {icon}
              {title}
            </SectionTitle>
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </SectionToggleButton>
          {action}
        </SectionHeaderRow>
        {isCollapsed ? null : content}
      </Section>
    );
  };

  const focusItems = [
    ...expert.tags.slice(0, 4).map((tag) => `#${tag}`),
    ...expert.promptStarters.slice(0, 2),
  ];
  const workflowRefs = expert.workflowRefs;
  const handleAddSkill = (ref: string) => {
    setAddedSkillRefs((current) =>
      dedupeSkillRefs([...current, ref]).filter(
        (item) => !baseSkillRefKeys.has(normalizeRefKey(item)),
      ),
    );
  };
  const handleRemoveAddedSkill = (ref: string) => {
    const key = normalizeRefKey(ref);
    setAddedSkillRefs((current) =>
      current.filter((item) => normalizeRefKey(item) !== key),
    );
  };
  const resolveCandidateSourceLabel = (candidate: ExpertSkillCandidate) => {
    if (candidate.source === "local") {
      return candidate.sourceLabel === "remote"
        ? t("agentExperts.info.skills.source.remote", "技能市场")
        : t("agentExperts.info.skills.source.local", "本地技能");
    }
    if (candidate.source === "service") {
      return (
        candidate.sourceLabel ||
        t("agentExperts.info.skills.source.service", "服务技能")
      );
    }
    return (
      candidate.sourceLabel ||
      t("agentExperts.info.skills.source.catalog", "技能目录")
    );
  };

  return (
    <Panel
      data-testid="expert-info-panel"
      aria-label={t("agentExperts.info.title", "专家信息")}
    >
      <PanelTitle>
        <UserRound size={16} />
        {t("agentExperts.info.title", "专家信息")}
      </PanelTitle>

      <Header>
        <Avatar aria-hidden="true">
          {renderAvatar(expert.avatar, expert.title)}
        </Avatar>
        <HeaderText>
          <ExpertTitle>{expert.title}</ExpertTitle>
          <ExpertSummary>{expert.summary}</ExpertSummary>
        </HeaderText>
      </Header>

      {renderSection(
        "overview",
        t("agentExperts.info.sections.overview", "简介"),
        <Sparkles size={14} />,
        <Card>
          <BlockTitle>
            {t("agentExperts.info.overview.who", "专家定位")}
          </BlockTitle>
          <BodyText>
            {expert.summary ||
              t(
                "agentExperts.info.overview.empty",
                "这个专家会把人设、技能、记忆和工作流绑定到当前 Agent 对话中。",
              )}
          </BodyText>
          <BlockTitle>
            {t("agentExperts.info.overview.how", "工作方式")}
          </BlockTitle>
          <BulletList>
            <li>
              {t(
                "agentExperts.info.overview.workWithContext",
                "先理解当前项目目标，再给出可执行建议。",
              )}
            </li>
            <li>
              {t(
                "agentExperts.info.overview.workWithRefs",
                "必要时引用已绑定的技能、记忆模板和工作流。",
              )}
            </li>
            {expert.showcase.slice(0, 2).map((item) => (
              <li key={item.title}>
                {item.title}：{item.body}
              </li>
            ))}
          </BulletList>
          <BlockTitle>
            {t("agentExperts.info.overview.boundaries", "边界")}
          </BlockTitle>
          <BulletList>
            <li>
              {t(
                "agentExperts.info.boundary.truth",
                "基于真实上下文和用户提供的信息工作，不编造未给出的事实。",
              )}
            </li>
            <li>
              {t(
                "agentExperts.info.boundary.private",
                "不会把项目文件、私有记忆或对话内容写回公共专家目录。",
              )}
            </li>
            <li>
              {t(
                "agentExperts.info.boundary.soul",
                "全局 Soul 只影响沟通节奏；专家人格不会写回全局 Soul，也不会默认进入正式产物。",
              )}
            </li>
          </BulletList>
        </Card>,
      )}

      {renderSection(
        "memory",
        t("agentExperts.info.sections.memory", "记忆"),
        <Brain size={14} />,
        expert.memoryTemplateRef ? (
          <Card data-testid="expert-info-memory">
            <BlockTitle>
              {t("agentExperts.info.memory.title", {
                title: expert.title,
                defaultValue: "MEMORY.md — {{title}} Memory",
              })}
            </BlockTitle>
            <BlockTitle>
              {t("agentExperts.info.memory.focus", "当前项目与关注")}
            </BlockTitle>
            <BulletList>
              {focusItems.length > 0 ? (
                focusItems.map((item) => <li key={item}>{item}</li>)
              ) : (
                <li>
                  {t(
                    "agentExperts.info.memory.defaultFocus",
                    "围绕本轮任务持续沉淀偏好、约束和复盘线索。",
                  )}
                </li>
              )}
            </BulletList>
            <BlockTitle>
              {t("agentExperts.info.memory.accumulated", "经验积累")}
            </BlockTitle>
            <BulletList>
              <li>
                {t(
                  "agentExperts.info.memory.templateEnabled",
                  "专家记忆模板已启用，会作为本轮对话的长期上下文线索。",
                )}
              </li>
              {typeof expert.usageCount === "number" ? (
                <li>
                  {t("agentExperts.info.memory.usage", {
                    count: expert.usageCount,
                    defaultValue: "历史使用 {{count}} 次",
                  })}
                </li>
              ) : null}
            </BulletList>
          </Card>
        ) : (
          <EmptyCard>
            {t(
              "agentExperts.info.memory.disabled",
              "这个专家当前没有启用记忆模板。",
            )}
          </EmptyCard>
        ),
      )}

      {renderSection(
        "diary",
        t("agentExperts.info.sections.diary", "日记"),
        <BookOpen size={14} />,
        <EmptyCard>{t("agentExperts.info.diary.empty", "暂无日记")}</EmptyCard>,
      )}

      {renderSection(
        "skills",
        t("agentExperts.info.sections.skills", "技能"),
        <Sparkles size={14} />,
        effectiveSkillRefs.length > 0 ? (
          <ChipList data-testid="expert-info-skills">
            {effectiveSkillRefs.map((ref) => (
              <Chip
                key={ref}
                title={ref}
                data-testid={`expert-info-skill-chip-${sanitizeTestId(ref)}`}
              >
                {resolveSkillLabel(ref, candidates)}
                {baseSkillRefKeys.has(normalizeRefKey(ref)) ? null : (
                  <ChipRemoveButton
                    type="button"
                    aria-label={t("agentExperts.info.skills.remove", {
                      title: resolveSkillLabel(ref, candidates),
                      defaultValue: "移除 {{title}}",
                    })}
                    onClick={() => handleRemoveAddedSkill(ref)}
                  >
                    <X size={11} />
                  </ChipRemoveButton>
                )}
              </Chip>
            ))}
          </ChipList>
        ) : (
          <EmptyCard>
            {t("agentExperts.info.skills.empty", "暂无绑定技能")}
          </EmptyCard>
        ),
        <IconActionButton
          type="button"
          aria-label={t(
            "agentExperts.info.skills.addAria",
            "为当前 Agent 添加技能",
          )}
          title={t("agentExperts.info.skills.add", "添加技能")}
          data-testid="expert-info-skills-add"
          onClick={() => setSkillPickerOpen(true)}
        >
          <Plus size={15} />
        </IconActionButton>,
      )}

      {renderSection(
        "workflow",
        t("agentExperts.info.sections.workflow", "工作流程"),
        <Workflow size={14} />,
        workflowRefs.length > 0 ? (
          <WorkflowList data-testid="expert-info-workflow">
            {workflowRefs.map((ref) => (
              <WorkflowStep key={ref}>{formatRefLabel(ref)}</WorkflowStep>
            ))}
          </WorkflowList>
        ) : (
          <EmptyCard>
            {t("agentExperts.info.workflow.empty", "暂无绑定工作流程")}
          </EmptyCard>
        ),
      )}

      {skillPickerOpen ? (
        <SkillDialogBackdrop
          role="presentation"
          data-testid="expert-skill-picker-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSkillPickerOpen(false);
            }
          }}
        >
          <SkillDialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="expert-skill-picker-title"
            data-testid="expert-skill-picker-dialog"
          >
            <SkillDialogHeader>
              <div>
                <SkillDialogTitle id="expert-skill-picker-title">
                  {t(
                    "agentExperts.info.skills.dialogTitle",
                    "为当前 Agent 添加技能",
                  )}
                </SkillDialogTitle>
                <SkillDialogSubtitle>
                  {t(
                    "agentExperts.info.skills.dialogSubtitle",
                    "选择后会加入当前专家对话的 skillRefs，并随下一轮 Agent 请求进入运行时上下文。",
                  )}
                </SkillDialogSubtitle>
              </div>
              <DialogCloseButton
                type="button"
                aria-label={t("agentExperts.info.skills.close", "关闭")}
                onClick={() => setSkillPickerOpen(false)}
              >
                <X size={15} />
              </DialogCloseButton>
            </SkillDialogHeader>
            <SkillDialogBody>
              <SkillSearchBox>
                <Search size={14} />
                <input
                  value={skillQuery}
                  placeholder={t(
                    "agentExperts.info.skills.searchPlaceholder",
                    "搜索技能名称、描述或引用",
                  )}
                  onChange={(event) => setSkillQuery(event.target.value)}
                />
              </SkillSearchBox>

              {skillsLoading && candidates.length === 0 ? (
                <SkillEmptyState>
                  <Loader2 size={14} />
                  {t("agentExperts.info.skills.loading", "正在加载技能目录...")}
                </SkillEmptyState>
              ) : filteredCandidates.length > 0 ? (
                <SkillCandidateList>
                  {filteredCandidates.map((candidate) => {
                    const added = effectiveSkillRefKeys.has(
                      normalizeRefKey(candidate.ref),
                    );
                    return (
                      <SkillCandidateCard
                        key={candidate.ref}
                        data-testid={`expert-skill-candidate-${sanitizeTestId(
                          candidate.ref,
                        )}`}
                      >
                        <SkillCandidateAvatar aria-hidden="true">
                          {candidateInitial(candidate.title)}
                        </SkillCandidateAvatar>
                        <SkillCandidateContent>
                          <SkillCandidateTitle>
                            {candidate.title}
                          </SkillCandidateTitle>
                          <SkillCandidateSummary>
                            {candidate.summary}
                          </SkillCandidateSummary>
                          <SkillCandidateMeta>
                            {resolveCandidateSourceLabel(candidate)} ·{" "}
                            {candidate.ref}
                          </SkillCandidateMeta>
                        </SkillCandidateContent>
                        <CandidateAddButton
                          type="button"
                          $added={added}
                          disabled={added}
                          data-testid={`expert-skill-add-${sanitizeTestId(
                            candidate.ref,
                          )}`}
                          onClick={() => handleAddSkill(candidate.ref)}
                        >
                          {added ? <Check size={13} /> : <Plus size={13} />}
                          {added
                            ? t("agentExperts.info.skills.added", "已添加")
                            : t("agentExperts.info.skills.add", "添加")}
                        </CandidateAddButton>
                      </SkillCandidateCard>
                    );
                  })}
                </SkillCandidateList>
              ) : (
                <SkillEmptyState>
                  {t(
                    "agentExperts.info.skills.noCandidates",
                    "没有找到可添加的技能。",
                  )}
                </SkillEmptyState>
              )}
            </SkillDialogBody>
          </SkillDialog>
        </SkillDialogBackdrop>
      ) : null}
    </Panel>
  );
});
