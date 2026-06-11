import React, { useEffect, useState } from "react";
import {
  BookOpen,
  Blocks,
  Bot,
  ChevronRight,
  Paperclip,
  ListChecks,
  Target,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type InputbarPlusPanelId = "knowledge" | "skills";

interface InputbarPlusMenuLabels {
  open: string;
  addFiles: string;
  attachKnowledge: string;
  planMode: string;
  subagent: string;
  objective: string;
  skills: string;
  unavailable: string;
}

export interface InputbarPlusMenuConfig {
  labels: InputbarPlusMenuLabels;
  taskEnabled: boolean;
  knowledgeOpenRequestKey?: number;
  subagentEnabled?: boolean;
  knowledgeActive?: boolean;
  objectiveActive?: boolean;
  skillsActive?: boolean;
  onAddFiles: () => void;
  onToggleTask: () => void;
  onToggleObjective: () => void;
  onToggleSubagent?: () => void;
  knowledgePanel?: React.ReactNode;
  skillsPanel?: React.ReactNode;
}

interface InputbarPlusMenuProps {
  config: InputbarPlusMenuConfig;
  disabled?: boolean;
  children: React.ReactElement;
}

function InputbarPlusSwitch({ checked }: { checked?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex h-[18px] w-[30px] flex-shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-sky-500" : "bg-slate-200",
      )}
    >
      <span
        className={cn(
          "inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[14px]" : "translate-x-0.5",
        )}
      />
    </span>
  );
}

const InputbarPlusRow = React.forwardRef<
  HTMLButtonElement,
  {
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  showArrow?: boolean;
  testId: string;
  title?: string;
  trailing?: React.ReactNode;
  }
>(function InputbarPlusRow(
  {
    active,
    disabled,
    icon,
    label,
    onClick,
    showArrow,
    testId,
    title,
    trailing,
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      className={cn(
        "flex h-8 w-full min-w-0 items-center gap-2 px-2 text-left text-[13px] leading-none transition-colors",
        "rounded-md text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus-visible:bg-slate-50 focus-visible:outline-none",
        active && "bg-slate-50 text-slate-950",
        disabled && "cursor-default text-slate-300 hover:bg-transparent hover:text-slate-300",
      )}
      data-testid={testId}
      disabled={disabled}
      title={title}
      onClick={disabled ? undefined : onClick}
    >
      <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-slate-500">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      {showArrow ? (
        <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
      ) : null}
    </button>
  );
});

export function InputbarPlusMenu({
  config,
  disabled = false,
  children,
}: InputbarPlusMenuProps) {
  const [open, setOpen] = useState(false);
  const [secondaryPanelId, setSecondaryPanelId] =
    useState<InputbarPlusPanelId | null>(null);
  const panels: Record<InputbarPlusPanelId, React.ReactNode | undefined> = {
    knowledge: config.knowledgePanel,
    skills: config.skillsPanel,
  };

  useEffect(() => {
    if (!config.knowledgeOpenRequestKey || !config.knowledgePanel) {
      return;
    }
    setOpen(true);
    setSecondaryPanelId("knowledge");
  }, [config.knowledgeOpenRequestKey, config.knowledgePanel]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setSecondaryPanelId(null);
    }
  };

  const handleSecondaryOpenChange = (
    panelId: InputbarPlusPanelId,
    nextOpen: boolean,
  ) => {
    setSecondaryPanelId(nextOpen ? panelId : null);
  };

  const renderSecondaryRow = ({
    active,
    icon,
    label,
    panelId,
    testId,
    title,
    trailing,
  }: {
    active?: boolean;
    icon: React.ReactNode;
    label: string;
    panelId: InputbarPlusPanelId;
    testId: string;
    title?: string;
    trailing?: React.ReactNode;
  }) => {
    const panel = panels[panelId];
    if (!panel) {
      return (
        <InputbarPlusRow
          active={active}
          icon={icon}
          label={label}
          testId={testId}
          disabled
          title={title ?? config.labels.unavailable}
          trailing={trailing}
        />
      );
    }

    return (
      <Popover
        open={secondaryPanelId === panelId}
        onOpenChange={(nextOpen) =>
          handleSecondaryOpenChange(panelId, nextOpen)
        }
      >
        <PopoverTrigger asChild>
          <InputbarPlusRow
            active={active || secondaryPanelId === panelId}
            icon={icon}
            label={label}
            testId={testId}
            showArrow
            trailing={trailing}
          />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="right"
          sideOffset={10}
          className="z-[60] max-h-[min(520px,calc(100vh-160px))] w-[360px] overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-[0_22px_56px_-30px_rgba(15,23,42,0.48)]"
          data-inputbar-plus-secondary={panelId}
          data-testid={`inputbar-plus-panel-${panelId}`}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {panel}
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        className="w-[232px] overflow-visible rounded-xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.42)]"
        data-testid="inputbar-plus-menu"
      >
        <div role="menu" aria-label={config.labels.open}>
          <InputbarPlusRow
            icon={<Paperclip className="h-4 w-4" />}
            label={config.labels.addFiles}
            testId="inputbar-plus-add-files"
            disabled={disabled}
            onClick={() => {
              config.onAddFiles();
              handleOpenChange(false);
            }}
          />
          {renderSecondaryRow({
            active: Boolean(config.knowledgeActive),
            icon: <BookOpen className="h-4 w-4" />,
            label: config.labels.attachKnowledge,
            panelId: "knowledge",
            testId: "inputbar-plus-knowledge",
            trailing: config.knowledgeActive ? (
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
            ) : null,
          })}
          <div className="my-1 border-t border-slate-100" />
          <InputbarPlusRow
            icon={<ListChecks className="h-4 w-4" />}
            label={config.labels.planMode}
            testId="inputbar-plus-plan-mode"
            trailing={<InputbarPlusSwitch checked={config.taskEnabled} />}
            onClick={config.onToggleTask}
          />
          {config.onToggleSubagent ? (
            <InputbarPlusRow
              icon={<Bot className="h-4 w-4" />}
              label={config.labels.subagent}
              testId="inputbar-plus-subagent-mode"
              trailing={
                <InputbarPlusSwitch checked={config.subagentEnabled} />
              }
              onClick={config.onToggleSubagent}
            />
          ) : null}
          <InputbarPlusRow
            active={Boolean(config.objectiveActive)}
            icon={<Target className="h-4 w-4" />}
            label={config.labels.objective}
            testId="inputbar-plus-objective"
            trailing={<InputbarPlusSwitch checked={config.objectiveActive} />}
            onClick={config.onToggleObjective}
          />
          <div className="my-1 border-t border-slate-100" />
          {renderSecondaryRow({
            active: Boolean(config.skillsActive),
            icon: <Blocks className="h-4 w-4" />,
            label: config.labels.skills,
            panelId: "skills",
            testId: "inputbar-plus-skills",
            trailing: config.skillsActive ? (
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500" />
            ) : null,
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
