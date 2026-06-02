import {
  Clock3,
  FileArchive,
  FileCode2,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  FileDisplayMode,
  FileEventGroup,
  FileFilterValue,
  FilePreviewRequest,
} from "./HarnessActivityTypes";
import { InteractiveText, PathTextLink } from "./HarnessStatusPanelPrimitives";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";
import {
  describeAction,
  describeKind,
  formatHarnessTime,
  joinDisplayParts,
  resolveFriendlyToolLabel,
} from "./harnessStatusPanelViewModel";
import type {
  HarnessFileKind,
  HarnessSessionState,
} from "../utils/harnessState";

interface HarnessFileActivitySectionProps {
  recentFileEvents: HarnessSessionState["recentFileEvents"];
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  handleOpenPathValue: (path: string) => void | Promise<void>;
  fileFilterOptions: ReadonlyArray<{ value: FileFilterValue; label: string }>;
  fileFilter: FileFilterValue;
  setFileFilter: (value: FileFilterValue) => void;
  fileDisplayMode: FileDisplayMode;
  setFileDisplayMode: (value: FileDisplayMode) => void;
  filteredFileEvents: HarnessSessionState["recentFileEvents"];
  groupedFileEvents: FileEventGroup[];
  openPreview: (request: FilePreviewRequest) => void | Promise<void>;
}

function resolveKindIcon(kind: HarnessFileKind): LucideIcon {
  switch (kind) {
    case "code":
      return FileCode2;
    case "artifact":
    case "offload":
      return FileArchive;
    default:
      return FileText;
  }
}

export function HarnessFileActivitySection({
  recentFileEvents,
  registerSectionRef,
  handleOpenExternalLink,
  handleOpenPathValue,
  fileFilterOptions,
  fileFilter,
  setFileFilter,
  fileDisplayMode,
  setFileDisplayMode,
  filteredFileEvents,
  groupedFileEvents,
  openPreview,
}: HarnessFileActivitySectionProps) {
  if (recentFileEvents.length === 0) {
    return null;
  }

  return (
    <Section
      sectionKey="files"
      title={agentText(
        "agentChat.harness.generated.45a433f860",
        "最近文件活动",
      )}
      badge={
        fileDisplayMode === "grouped"
          ? `${groupedFileEvents.length} 个文件 / ${filteredFileEvents.length} 条`
          : filteredFileEvents.length === recentFileEvents.length
            ? `${recentFileEvents.length} 条`
            : `${filteredFileEvents.length} / ${recentFileEvents.length} 条`
      }
      registerRef={registerSectionRef}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FileFilterButtons
            options={fileFilterOptions}
            activeValue={fileFilter}
            recentFileEvents={recentFileEvents}
            onChange={setFileFilter}
          />
          <FileDisplayModeButtons
            activeValue={fileDisplayMode}
            onChange={setFileDisplayMode}
          />
        </div>
        {filteredFileEvents.length > 0 ? (
          fileDisplayMode === "grouped" ? (
            <GroupedFileActivityList
              groupedFileEvents={groupedFileEvents}
              openPreview={openPreview}
              handleOpenExternalLink={handleOpenExternalLink}
              handleOpenPathValue={handleOpenPathValue}
            />
          ) : (
            <TimelineFileActivityList
              filteredFileEvents={filteredFileEvents}
              openPreview={openPreview}
              handleOpenExternalLink={handleOpenExternalLink}
              handleOpenPathValue={handleOpenPathValue}
            />
          )
        ) : (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            {agentText(
              "agentChat.harness.generated.1146635328",
              "当前筛选条件下暂无记录。",
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

function FileFilterButtons({
  options,
  activeValue,
  recentFileEvents,
  onChange,
}: {
  options: ReadonlyArray<{ value: FileFilterValue; label: string }>;
  activeValue: FileFilterValue;
  recentFileEvents: HarnessSessionState["recentFileEvents"];
  onChange: (value: FileFilterValue) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const count =
          option.value === "all"
            ? recentFileEvents.length
            : recentFileEvents.filter((event) => event.kind === option.value)
                .length;
        const active = option.value === activeValue;

        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            aria-label={`文件活动筛选：${option.label}`}
          >
            {option.label} {count}
          </button>
        );
      })}
    </div>
  );
}

function FileDisplayModeButtons({
  activeValue,
  onChange,
}: {
  activeValue: FileDisplayMode;
  onChange: (value: FileDisplayMode) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {[
        { value: "timeline" as const, label: "时间流" },
        { value: "grouped" as const, label: "按文件" },
      ].map((option) => {
        const active = option.value === activeValue;
        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            aria-label={`文件视图：${option.label}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function GroupedFileActivityList({
  groupedFileEvents,
  openPreview,
  handleOpenExternalLink,
  handleOpenPathValue,
}: {
  groupedFileEvents: FileEventGroup[];
  openPreview: (request: FilePreviewRequest) => void | Promise<void>;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  handleOpenPathValue: (path: string) => void | Promise<void>;
}) {
  return (
    <>
      {groupedFileEvents.map((group) => {
        const latestEvent = group.latestEvent;
        const Icon = resolveKindIcon(group.kind);
        return (
          <button
            key={group.key}
            type="button"
            className="w-full rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/60"
            onClick={() =>
              void openPreview({
                title: latestEvent.displayName,
                description: joinDisplayParts([
                  describeAction(latestEvent.action),
                  describeKind(group.kind),
                  resolveFriendlyToolLabel(latestEvent.sourceToolName) ||
                    latestEvent.sourceToolName,
                ]),
                path: latestEvent.path,
                content: latestEvent.content,
                preview: latestEvent.preview,
              })
            }
            aria-label={`查看聚合文件活动：${group.displayName}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate text-sm font-medium text-foreground">
                    {group.displayName}
                  </span>
                </div>
                <PathTextLink
                  path={group.path}
                  className="mt-1 text-xs"
                  stopPropagation={true}
                  onOpenPath={handleOpenPathValue}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">
                  {group.count}{" "}
                  {agentText(
                    "agentChat.harness.generated.38c39c83cd",
                    "次活动",
                  )}
                </Badge>
                <Badge variant="secondary">{describeKind(group.kind)}</Badge>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              <span>{formatHarnessTime(latestEvent.timestamp)}</span>
              <span>·</span>
              <span>
                {agentText("agentChat.harness.generated.8c73d90eca", "最近")}
                {describeAction(latestEvent.action)}
              </span>
              <span>·</span>
              <span>{group.actionSummary}</span>
            </div>
            {latestEvent.preview ? (
              <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                <InteractiveText
                  text={latestEvent.preview}
                  mono={true}
                  stopPropagation={true}
                  onOpenUrl={handleOpenExternalLink}
                />
              </div>
            ) : null}
          </button>
        );
      })}
    </>
  );
}

function TimelineFileActivityList({
  filteredFileEvents,
  openPreview,
  handleOpenExternalLink,
  handleOpenPathValue,
}: {
  filteredFileEvents: HarnessSessionState["recentFileEvents"];
  openPreview: (request: FilePreviewRequest) => void | Promise<void>;
  handleOpenExternalLink: (url: string) => void | Promise<void>;
  handleOpenPathValue: (path: string) => void | Promise<void>;
}) {
  return (
    <>
      {filteredFileEvents.map((event) => {
        const Icon = resolveKindIcon(event.kind);
        return (
          <button
            key={event.id}
            type="button"
            className="w-full rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/60"
            onClick={() =>
              void openPreview({
                title: event.displayName,
                description: joinDisplayParts([
                  describeAction(event.action),
                  describeKind(event.kind),
                  resolveFriendlyToolLabel(event.sourceToolName) ||
                    event.sourceToolName,
                ]),
                path: event.path,
                content: event.content,
                preview: event.preview,
              })
            }
            aria-label={`查看文件活动：${event.displayName}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate text-sm font-medium text-foreground">
                    {event.displayName}
                  </span>
                </div>
                <PathTextLink
                  path={event.path}
                  className="mt-1 text-xs"
                  stopPropagation={true}
                  onOpenPath={handleOpenPathValue}
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{describeAction(event.action)}</Badge>
                <Badge variant="secondary">{describeKind(event.kind)}</Badge>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              <span>{formatHarnessTime(event.timestamp)}</span>
              <span>·</span>
              <span>
                {resolveFriendlyToolLabel(event.sourceToolName) ||
                  event.sourceToolName}
              </span>
            </div>
            {event.preview ? (
              <div className="mt-2 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                <InteractiveText
                  text={event.preview}
                  mono={true}
                  stopPropagation={true}
                  onOpenUrl={handleOpenExternalLink}
                />
              </div>
            ) : null}
          </button>
        );
      })}
    </>
  );
}
