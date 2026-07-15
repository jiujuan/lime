import { useCallback, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AgentRuntimeEvidenceTaskIndex } from "@/lib/api/agentRuntime/evidenceTypes";
import {
  buildModalityTaskIndexFacets,
  buildModalityTaskIndexRows,
  filterModalityTaskIndexRows,
  type ModalityTaskIndexQueryFilters,
  type ModalityTaskIndexRow,
} from "@/lib/agentRuntime/modalityTaskIndexPresentation";
import { Badge } from "@/components/ui/badge";

const TASK_INDEX_FILTER_ALL_VALUE = "__all__";
type AgentTranslate = TFunction<"agent", undefined>;

function TaskIndexStatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-3">
      <div className="break-words text-xs font-medium text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 text-base font-semibold text-foreground">
        {value}
      </div>
      <div className="mt-1 break-words text-xs text-muted-foreground">
        {hint}
      </div>
    </div>
  );
}

function TaskIndexItemCard({
  item,
  t,
}: {
  item: ModalityTaskIndexRow;
  t: AgentTranslate;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-teal-200/80 bg-background/85 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 break-words text-sm font-medium text-foreground">
          {item.title}
        </span>
        {item.modality ? (
          <Badge variant="outline">{item.modality}</Badge>
        ) : null}
        {item.executorKind ? (
          <Badge variant="secondary">{item.executorKind}</Badge>
        ) : null}
        {item.contractKey ? (
          <Badge variant="outline">{item.contractKey}</Badge>
        ) : null}
        {item.costState ? (
          <Badge variant="outline">{item.costState}</Badge>
        ) : null}
        {item.limitState ? (
          <Badge variant={item.quotaLow ? "destructive" : "outline"}>
            {item.limitState}
          </Badge>
        ) : null}
      </div>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {item.threadId ? (
            <span className="min-w-0 break-all">
              {t("agentChat.harness.taskIndex.field.thread")}
              <span className="ml-1 font-mono text-foreground">
                {item.threadId}
              </span>
            </span>
          ) : null}
          {item.turnId ? (
            <span className="min-w-0 break-all">
              {t("agentChat.harness.taskIndex.field.turn")}
              <span className="ml-1 font-mono text-foreground">
                {item.turnId}
              </span>
            </span>
          ) : null}
          {item.contentId ? (
            <span className="min-w-0 break-all">
              {t("agentChat.harness.taskIndex.field.content")}
              <span className="ml-1 font-mono text-foreground">
                {item.contentId}
              </span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {item.skillId ? (
            <span className="min-w-0 break-all">
              {t("agentChat.harness.taskIndex.field.skill")}
              <span className="ml-1 font-mono text-foreground">
                {item.skillId}
              </span>
            </span>
          ) : null}
          {item.modelId ? (
            <span className="min-w-0 break-all">
              {t("agentChat.harness.taskIndex.field.model")}
              <span className="ml-1 font-mono text-foreground">
                {item.modelId}
              </span>
            </span>
          ) : null}
          {item.executorBindingKey ? (
            <span className="min-w-0 break-all">
              {t("agentChat.harness.taskIndex.field.binding")}
              <span className="ml-1 font-mono text-foreground">
                {item.executorBindingKey}
              </span>
            </span>
          ) : null}
          {item.entryKey ? (
            <span className="min-w-0 break-all">
              {t("agentChat.harness.taskIndex.field.entry")}
              <span className="ml-1 font-mono text-foreground">
                {item.entryKey}
              </span>
            </span>
          ) : null}
        </div>
        {item.estimatedCostClass || item.limitEventKind ? (
          <div className="break-all">
            {t("agentChat.harness.taskIndex.field.costLimit")}
            <span className="ml-1 font-mono text-foreground">
              {[item.estimatedCostClass, item.limitEventKind]
                .filter(Boolean)
                .join(" / ")}
            </span>
          </div>
        ) : null}
        {item.artifactPath ? (
          <div className="break-all">
            {t("agentChat.harness.taskIndex.field.artifact")}
            <span className="ml-1 font-mono text-foreground">
              {item.artifactPath}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TaskIndexFilterSelect({
  label,
  value,
  options,
  allLabel,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  allLabel: string;
  onChange: (value?: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-medium text-teal-900">
      <span>{label}</span>
      <select
        className="h-8 min-w-0 rounded-lg border border-teal-200 bg-white px-2 text-xs font-normal text-teal-950 shadow-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
        value={value ?? TASK_INDEX_FILTER_ALL_VALUE}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          onChange(
            nextValue === TASK_INDEX_FILTER_ALL_VALUE ? undefined : nextValue,
          );
        }}
      >
        <option value={TASK_INDEX_FILTER_ALL_VALUE}>{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HarnessTaskIndexSection({
  index,
}: {
  index: AgentRuntimeEvidenceTaskIndex;
}) {
  const { t } = useTranslation("agent");
  const facets = buildModalityTaskIndexFacets(index);
  const rows = useMemo(() => buildModalityTaskIndexRows(index), [index]);
  const [filters, setFilters] = useState<ModalityTaskIndexQueryFilters>({});
  const filteredRows = useMemo(
    () => filterModalityTaskIndexRows(rows, filters),
    [filters, rows],
  );
  const visibleRows = filteredRows.slice(0, 8);
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const updateFilter = useCallback(
    <Key extends keyof ModalityTaskIndexQueryFilters>(
      key: Key,
      value?: ModalityTaskIndexQueryFilters[Key],
    ) => {
      setFilters((current) => {
        const next = { ...current };
        if (value) {
          next[key] = value;
        } else {
          delete next[key];
        }
        return next;
      });
    },
    [],
  );

  if (index.snapshot_count <= 0 && index.items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-teal-950">
        <ListChecks className="h-4 w-4 text-teal-700" />
        <span>{t("agentChat.harness.taskIndex.title")}</span>
      </div>
      <p className="mt-1 text-xs text-teal-800">
        {t("agentChat.harness.taskIndex.description")}
      </p>

      <div className="mt-3 grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
        <TaskIndexStatCard
          title={t("agentChat.harness.taskIndex.metric.snapshot.title")}
          value={`${index.snapshot_count}`}
          hint={t("agentChat.harness.taskIndex.metric.snapshot.items", {
            count: index.items.length,
          })}
        />
        <TaskIndexStatCard
          title={t("agentChat.harness.taskIndex.metric.identity.title")}
          value={`${facets.identityAnchors.length}`}
          hint={
            facets.identityAnchors.slice(0, 3).join(" / ") ||
            t("agentChat.harness.taskIndex.metric.identity.empty")
          }
        />
        <TaskIndexStatCard
          title={t("agentChat.harness.taskIndex.metric.executor.title")}
          value={`${facets.executorDimensions.length}`}
          hint={
            facets.executorDimensions.slice(0, 3).join(" / ") ||
            t("agentChat.harness.taskIndex.metric.executor.empty")
          }
        />
        <TaskIndexStatCard
          title={t("agentChat.harness.taskIndex.metric.costLimit.title")}
          value={`${facets.costLimitDimensions.length}`}
          hint={
            facets.costLimitDimensions.slice(0, 3).join(" / ") ||
            t("agentChat.harness.taskIndex.metric.costLimit.quotaLow", {
              count: facets.quotaLowCount,
            })
          }
        />
      </div>

      {rows.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="rounded-lg border border-teal-200/80 bg-white p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-teal-950">
                  {t("agentChat.harness.taskIndex.list.title")}
                </div>
                <p className="mt-0.5 text-xs text-teal-800">
                  {t("agentChat.harness.taskIndex.list.description")}
                </p>
              </div>
              <Badge variant="outline">
                {t("agentChat.harness.taskIndex.list.count", {
                  filtered: filteredRows.length,
                  total: rows.length,
                })}
              </Badge>
            </div>
            <div className="mt-3 grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
              <TaskIndexFilterSelect
                label={t("agentChat.harness.taskIndex.filter.entry")}
                value={filters.entryKey}
                options={facets.entryKeys}
                allLabel={t("agentChat.harness.taskIndex.filter.all")}
                onChange={(value) => updateFilter("entryKey", value)}
              />
              <TaskIndexFilterSelect
                label={t("agentChat.harness.taskIndex.filter.content")}
                value={filters.contentId}
                options={facets.contentIds}
                allLabel={t("agentChat.harness.taskIndex.filter.all")}
                onChange={(value) => updateFilter("contentId", value)}
              />
              <TaskIndexFilterSelect
                label={t("agentChat.harness.taskIndex.filter.executor")}
                value={filters.executorKind}
                options={facets.executorKinds}
                allLabel={t("agentChat.harness.taskIndex.filter.all")}
                onChange={(value) => updateFilter("executorKind", value)}
              />
              <TaskIndexFilterSelect
                label={t("agentChat.harness.taskIndex.filter.cost")}
                value={filters.costState}
                options={facets.costStates}
                allLabel={t("agentChat.harness.taskIndex.filter.all")}
                onChange={(value) => updateFilter("costState", value)}
              />
              <TaskIndexFilterSelect
                label={t("agentChat.harness.taskIndex.filter.limit")}
                value={filters.limitState}
                options={facets.limitStates}
                allLabel={t("agentChat.harness.taskIndex.filter.all")}
                onChange={(value) => updateFilter("limitState", value)}
              />
            </div>
            {hasActiveFilters ? (
              <button
                type="button"
                className="mt-2 text-xs font-medium text-teal-800 underline-offset-4 hover:text-teal-950 hover:underline"
                onClick={() => setFilters({})}
              >
                {t("agentChat.harness.taskIndex.filter.clear")}
              </button>
            ) : null}
          </div>

          {visibleRows.length > 0 ? (
            visibleRows.map((item, indexInList) => (
              <TaskIndexItemCard
                key={`${item.id}:${indexInList}`}
                item={item}
                t={t}
              />
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-teal-200 bg-white p-3 text-xs text-teal-800">
              {t("agentChat.harness.taskIndex.list.empty")}
            </div>
          )}
          {filteredRows.length > visibleRows.length ? (
            <p className="text-xs text-teal-800">
              {t("agentChat.harness.taskIndex.list.truncated", {
                count: visibleRows.length,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
