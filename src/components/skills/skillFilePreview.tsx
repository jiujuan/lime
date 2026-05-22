import { FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderSkillMarkdown } from "./skillMarkdownPreview";
import {
  formatSkillFileSize,
  getSkillFileEntryDepth,
  getSkillFileEntryLabel,
  isSkillMarkdownFile,
  type SkillFilePreviewEntry,
} from "./skillFilePreviewModel";

interface SkillFileTreeProps {
  files: SkillFilePreviewEntry[];
  selectedPath: string;
  onSelect: (path: string) => void;
  emptyLabel: string;
}

export function SkillFileTree({
  files,
  selectedPath,
  onSelect,
  emptyLabel,
}: SkillFileTreeProps) {
  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 py-6 text-center text-sm text-[color:var(--lime-text-muted)]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {files.map((entry) => {
        const EntryIcon = entry.isDirectory ? Folder : FileText;
        const depth = getSkillFileEntryDepth(entry);
        const isSelected = entry.path === selectedPath;
        return (
          <button
            key={`${entry.isDirectory ? "dir" : "file"}:${entry.path}`}
            type="button"
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors",
              isSelected
                ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                : "text-[color:var(--lime-text)] hover:bg-[color:var(--lime-surface)]",
            )}
            disabled={entry.isDirectory}
            aria-pressed={isSelected}
            onClick={() => {
              if (!entry.isDirectory) {
                onSelect(entry.path);
              }
            }}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
          >
            <EntryIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {getSkillFileEntryLabel(entry)}
            </span>
            {!entry.isDirectory && entry.size > 0 ? (
              <span className="shrink-0 text-[10px] text-[color:var(--lime-text-muted)]">
                {formatSkillFileSize(entry.size)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

interface SkillFileContentPreviewProps {
  content: string | null;
  selectedFile: SkillFilePreviewEntry | undefined;
  emptyLabel: string;
}

export function SkillFileContentPreview({
  content,
  selectedFile,
  emptyLabel,
}: SkillFileContentPreviewProps) {
  if (content) {
    return isSkillMarkdownFile(selectedFile) ? (
      renderSkillMarkdown(content)
    ) : (
      <pre className="overflow-auto rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4 text-sm leading-6 text-[color:var(--lime-text-strong)]">
        {content}
      </pre>
    );
  }

  return (
    <div className="rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-4 py-10 text-center text-sm text-[color:var(--lime-text-muted)]">
      {emptyLabel}
    </div>
  );
}
