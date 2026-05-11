import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  capabilityDraftsApi,
  type CapabilityDraftRecord,
  type CapabilityDraftVerificationCheck,
  type CapabilityDraftVerificationEvidence,
  type CapabilityDraftVerificationReport,
} from "@/lib/api/capabilityDrafts";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/i18n/format";
import { cn } from "@/lib/utils";
import {
  canVerifyCapabilityDraft,
  canExecuteCapabilityDraft,
  canRegisterCapabilityDraft,
  getCapabilityDraftStatusPresentation,
  type CapabilityDraftPresentationCopy,
  summarizeCapabilityDraftFailedChecks,
  summarizeCapabilityDraftFiles,
  summarizeCapabilityDraftPermissions,
  summarizeCapabilityDraftRegistration,
  summarizeCapabilityDraftVerification,
} from "../domain/capabilityDraftPresentation";

interface CapabilityDraftPanelProps {
  workspaceRoot?: string | null;
  projectPending?: boolean;
  projectError?: string | null;
  highlightedDraftId?: string | null;
  onRegisteredSkillsChanged?: () => void;
  className?: string;
}

const STATUS_TONE_CLASSNAMES = {
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  slate: "border-slate-200 bg-slate-50 text-slate-600",
};

function sortDraftsForDisplay(
  drafts: CapabilityDraftRecord[],
  highlightedDraftId?: string | null,
): CapabilityDraftRecord[] {
  const normalizedHighlight = highlightedDraftId?.trim();
  return [...drafts].sort((left, right) => {
    const leftHighlighted =
      normalizedHighlight && left.draftId === normalizedHighlight ? 1 : 0;
    const rightHighlighted =
      normalizedHighlight && right.draftId === normalizedHighlight ? 1 : 0;
    if (leftHighlighted !== rightHighlighted) {
      return rightHighlighted - leftHighlighted;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function getEvidenceChecks(
  report?: CapabilityDraftVerificationReport,
): CapabilityDraftVerificationCheck[] {
  if (!report) {
    return [];
  }
  return report.checks.filter((check) => check.evidence.length > 0);
}

function formatEvidenceKey(
  key: string,
  labels: Record<string, string>,
): string {
  return labels[key] ?? key;
}

function formatEvidenceValue(evidence: CapabilityDraftVerificationEvidence) {
  const value = evidence.value.trim();
  if (evidence.key === "durationMs" && value && !value.endsWith("ms")) {
    return `${value}ms`;
  }
  if (evidence.key.toLowerCase().includes("sha256") && value.length > 16) {
    return `${value.slice(0, 16)}...`;
  }
  return value.replace(/\s+/g, " ");
}

export function CapabilityDraftPanel({
  workspaceRoot,
  projectPending = false,
  projectError,
  highlightedDraftId,
  onRegisteredSkillsChanged,
  className,
}: CapabilityDraftPanelProps) {
  const { i18n, t } = useTranslation("agent");
  const locale = i18n.language;
  const [drafts, setDrafts] = useState<CapabilityDraftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyingDraftId, setVerifyingDraftId] = useState<string | null>(null);
  const [registeringDraftId, setRegisteringDraftId] = useState<string | null>(
    null,
  );
  const [verificationMessage, setVerificationMessage] = useState<string | null>(
    null,
  );
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(
    null,
  );
  const [verificationReportsByDraftId, setVerificationReportsByDraftId] =
    useState<Record<string, CapabilityDraftVerificationReport>>({});
  const normalizedWorkspaceRoot = workspaceRoot?.trim() || null;
  const presentationCopy = useMemo<CapabilityDraftPresentationCopy>(
    () => ({
      failedChecksPassed: t(
        "capabilityDraft.panel.summary.failedChecksPassed",
        "所有检查均已通过。",
      ),
      filesEmpty: t("capabilityDraft.panel.summary.filesEmpty", "暂无文件清单"),
      formatFilesWithMore: (shown, totalCount) =>
        t("capabilityDraft.panel.summary.filesWithMore", {
          defaultValue: "{{files}} 等 {{total}} 个文件",
          files: shown,
          total: formatNumber(totalCount, { locale }),
        }),
      formatRegistrationDirectory: (directory) =>
        t("capabilityDraft.panel.summary.registrationDirectory", {
          defaultValue: "已注册目录：{{directory}}",
          directory,
        }),
      permissionEmpty: t(
        "capabilityDraft.panel.summary.permissionEmpty",
        "未声明额外权限，默认停留在只读发现与草案内写入。",
      ),
      registrationEmpty: t(
        "capabilityDraft.panel.summary.registrationEmpty",
        "还没有注册到 Workspace。",
      ),
      registrationFallback: t(
        "capabilityDraft.panel.summary.registrationFallback",
        "已注册到当前 Workspace。",
      ),
      separator: t("capabilityDraft.panel.summary.separator", " / "),
      status: {
        failed_self_check: {
          description: t(
            "capabilityDraft.panel.status.failedSelfCheck.description",
            "需要先修复草案内容，再进入验证门禁。",
          ),
          label: t(
            "capabilityDraft.panel.status.failedSelfCheck.label",
            "自检未通过",
          ),
        },
        registered: {
          description: t(
            "capabilityDraft.panel.status.registered.description",
            "已写入当前 Workspace 的本地 Skill 目录；运行与自动化仍需后续 runtime gate。",
          ),
          label: t("capabilityDraft.panel.status.registered.label", "已注册"),
        },
        unverified: {
          description: t(
            "capabilityDraft.panel.status.unverified.description",
            "只能查看和继续修复，不能运行、注册或接入自动化。",
          ),
          label: t("capabilityDraft.panel.status.unverified.label", "未验证"),
        },
        verification_failed: {
          description: t(
            "capabilityDraft.panel.status.verificationFailed.description",
            "verification gate 发现结构、权限或 contract 问题，需要修复后重试。",
          ),
          label: t(
            "capabilityDraft.panel.status.verificationFailed.label",
            "验证未通过",
          ),
        },
        verified_pending_registration: {
          description: t(
            "capabilityDraft.panel.status.verifiedPendingRegistration.description",
            "最小验证已通过，可以注册到当前 Workspace，但仍不会运行或接入自动化。",
          ),
          label: t(
            "capabilityDraft.panel.status.verifiedPendingRegistration.label",
            "验证通过，待注册",
          ),
        },
      },
      verificationEmpty: t(
        "capabilityDraft.panel.summary.verificationEmpty",
        "还没有运行 verification gate。",
      ),
    }),
    [locale, t],
  );
  const evidenceLabels = useMemo<Record<string, string>>(
    () => ({
      actualSha256: t(
        "capabilityDraft.panel.evidence.actualSha256",
        "实际 Hash",
      ),
      credentialReferenceId: t(
        "capabilityDraft.panel.evidence.credentialReferenceId",
        "凭证引用",
      ),
      durationMs: t("capabilityDraft.panel.evidence.durationMs", "耗时"),
      endpointSource: t(
        "capabilityDraft.panel.evidence.endpointSource",
        "Endpoint",
      ),
      evidenceSchema: t(
        "capabilityDraft.panel.evidence.evidenceSchema",
        "证据 Schema",
      ),
      expectedOutputPath: t(
        "capabilityDraft.panel.evidence.expectedOutputPath",
        "期望输出",
      ),
      expectedSha256: t(
        "capabilityDraft.panel.evidence.expectedSha256",
        "期望 Hash",
      ),
      exitStatus: t("capabilityDraft.panel.evidence.exitStatus", "退出状态"),
      method: t("capabilityDraft.panel.evidence.method", "方法"),
      policyPath: t("capabilityDraft.panel.evidence.policyPath", "Policy"),
      preflightMode: t(
        "capabilityDraft.panel.evidence.preflightMode",
        "Preflight",
      ),
      scriptPath: t("capabilityDraft.panel.evidence.scriptPath", "脚本"),
      stdoutPreview: t(
        "capabilityDraft.panel.evidence.stdoutPreview",
        "stdout",
      ),
    }),
    [t],
  );

  const loadDrafts = useCallback(async () => {
    if (!normalizedWorkspaceRoot) {
      setDrafts([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const nextDrafts = await capabilityDraftsApi.list({
        workspaceRoot: normalizedWorkspaceRoot,
      });
      setDrafts(nextDrafts);
    } catch (loadError) {
      setDrafts([]);
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [normalizedWorkspaceRoot]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!normalizedWorkspaceRoot) {
        setDrafts([]);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const nextDrafts = await capabilityDraftsApi.list({
          workspaceRoot: normalizedWorkspaceRoot,
        });
        if (!cancelled) {
          setDrafts(nextDrafts);
        }
      } catch (loadError) {
        if (!cancelled) {
          setDrafts([]);
          setError(String(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [normalizedWorkspaceRoot]);

  const visibleDrafts = useMemo(
    () => sortDraftsForDisplay(drafts, highlightedDraftId).slice(0, 3),
    [drafts, highlightedDraftId],
  );

  const effectiveError = projectError || error;
  const isBusy = projectPending || loading;

  const handleVerifyDraft = useCallback(
    async (draft: CapabilityDraftRecord) => {
      if (!normalizedWorkspaceRoot || verifyingDraftId) {
        return;
      }

      setVerifyingDraftId(draft.draftId);
      setError(null);
      setVerificationMessage(null);
      setRegistrationMessage(null);
      try {
        const result = await capabilityDraftsApi.verify({
          workspaceRoot: normalizedWorkspaceRoot,
          draftId: draft.draftId,
        });
        setDrafts((current) =>
          current.map((item) =>
            item.draftId === result.draft.draftId ? result.draft : item,
          ),
        );
        setVerificationReportsByDraftId((current) => ({
          ...current,
          [result.draft.draftId]: result.report,
        }));
        setVerificationMessage(
          `${result.report.summary} ${summarizeCapabilityDraftFailedChecks(
            result.report,
            presentationCopy,
          )}`,
        );
      } catch (verifyError) {
        setError(String(verifyError));
      } finally {
        setVerifyingDraftId(null);
      }
    },
    [normalizedWorkspaceRoot, presentationCopy, verifyingDraftId],
  );

  const handleRegisterDraft = useCallback(
    async (draft: CapabilityDraftRecord) => {
      if (!normalizedWorkspaceRoot || registeringDraftId) {
        return;
      }

      setRegisteringDraftId(draft.draftId);
      setError(null);
      setVerificationMessage(null);
      setRegistrationMessage(null);
      try {
        const result = await capabilityDraftsApi.register({
          workspaceRoot: normalizedWorkspaceRoot,
          draftId: draft.draftId,
        });
        setDrafts((current) =>
          current.map((item) =>
            item.draftId === result.draft.draftId ? result.draft : item,
          ),
        );
        setRegistrationMessage(
          t("capabilityDraft.panel.feedback.registered", {
            defaultValue:
              "已注册到当前 Workspace：{{directory}}。运行与自动化仍需后续 runtime gate。",
            directory: result.registration.skillDirectory,
          }),
        );
        onRegisteredSkillsChanged?.();
      } catch (registerError) {
        setError(String(registerError));
      } finally {
        setRegisteringDraftId(null);
      }
    },
    [normalizedWorkspaceRoot, onRegisteredSkillsChanged, registeringDraftId, t],
  );

  return (
    <section
      className={cn(
        "rounded-[28px] border border-amber-200/80 bg-white p-5 shadow-sm shadow-amber-950/5",
        className,
      )}
      data-testid="capability-draft-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
              {t("capabilityDraft.panel.badge", "草案区")}
            </span>
            <h2 className="text-[15px] font-semibold text-slate-900">
              {t("capabilityDraft.panel.title", "能力草案")}
            </h2>
          </div>
          <p className="text-[11px] leading-5 text-slate-500">
            {t(
              "capabilityDraft.panel.description",
              "Coding Agent 产出的 Skill 草案先停在这里；未验证前不会注册，也不会自动运行。",
            )}
          </p>
        </div>
        {normalizedWorkspaceRoot ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-2xl px-3 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            onClick={() => void loadDrafts()}
            disabled={isBusy}
            data-testid="capability-draft-refresh"
          >
            <RefreshCw
              className={cn("mr-1.5 h-3.5 w-3.5", isBusy && "animate-spin")}
            />
            {t("capabilityDraft.panel.action.refresh", "刷新")}
          </Button>
        ) : null}
      </div>

      {!normalizedWorkspaceRoot ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-amber-200 bg-amber-50/60 px-4 py-5 text-sm leading-6 text-amber-800">
          {t(
            "capabilityDraft.panel.empty.missingProject",
            "选择或进入一个项目后，才能查看该项目里的能力草案。",
          )}
        </div>
      ) : effectiveError ? (
        <div className="mt-4 rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-5 text-sm leading-6 text-rose-700">
          {t("capabilityDraft.panel.empty.error", {
            defaultValue: "能力草案暂时没读到：{{message}}",
            message: effectiveError,
          })}
        </div>
      ) : isBusy ? (
        <div className="mt-4 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
          {t("capabilityDraft.panel.empty.loading", "正在读取能力草案...")}
        </div>
      ) : visibleDrafts.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-amber-200 bg-amber-50/60 px-4 py-5 text-sm leading-6 text-amber-800">
          {t(
            "capabilityDraft.panel.empty.noDrafts",
            "当前项目还没有能力草案。后续 Coding Agent 生成的新能力会先进入这里复核。",
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {visibleDrafts.map((draft) => {
            const status = getCapabilityDraftStatusPresentation(
              draft.verificationStatus,
              presentationCopy,
            );
            const canRun = canExecuteCapabilityDraft(draft);
            const canRegister = canRegisterCapabilityDraft(draft);
            const canVerify = canVerifyCapabilityDraft(draft);
            const isVerifying = verifyingDraftId === draft.draftId;
            const isRegistering = registeringDraftId === draft.draftId;
            const evidenceChecks = getEvidenceChecks(
              verificationReportsByDraftId[draft.draftId],
            );

            return (
              <article
                key={draft.draftId}
                className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                      STATUS_TONE_CLASSNAMES[status.tone],
                    )}
                  >
                    {status.label}
                  </span>
                  <span className="text-[11px] leading-5 text-slate-400">
                    {draft.sourceKind || "manual"}
                  </span>
                </div>
                <div className="mt-2.5 space-y-1.5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {draft.name}
                  </h3>
                  <p className="line-clamp-2 text-[12px] leading-5 text-slate-600">
                    {draft.description || draft.userGoal}
                  </p>
                </div>
                <div className="mt-3 space-y-1 text-[11px] leading-5 text-slate-500">
                  <div>
                    <span className="font-medium text-slate-700">
                      {t("capabilityDraft.panel.field.goal", "目标：")}
                    </span>
                    {draft.userGoal}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">
                      {t("capabilityDraft.panel.field.permissions", "权限：")}
                    </span>
                    {summarizeCapabilityDraftPermissions(
                      draft,
                      presentationCopy,
                    )}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">
                      {t("capabilityDraft.panel.field.files", "文件：")}
                    </span>
                    {summarizeCapabilityDraftFiles(draft, presentationCopy)}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">
                      {t("capabilityDraft.panel.field.verification", "验证：")}
                    </span>
                    {summarizeCapabilityDraftVerification(
                      draft,
                      presentationCopy,
                    )}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">
                      {t("capabilityDraft.panel.field.registration", "注册：")}
                    </span>
                    {summarizeCapabilityDraftRegistration(
                      draft,
                      presentationCopy,
                    )}
                  </div>
                  <div className="text-amber-700">
                    {status.description}
                    {!canRun &&
                    !canRegister &&
                    draft.verificationStatus !== "registered"
                      ? t(
                          "capabilityDraft.panel.guard.noEntry",
                          " 当前没有运行、注册或自动化入口。",
                        )
                      : null}
                    {canRegister
                      ? t(
                          "capabilityDraft.panel.guard.registerOnly",
                          " 注册只会复制为 Workspace 本地 Skill，不会立即运行。",
                        )
                      : null}
                    {draft.verificationStatus === "registered"
                      ? t(
                          "capabilityDraft.panel.guard.registeredNoEntry",
                          " 当前没有运行或自动化入口。",
                        )
                      : null}
                  </div>
                </div>
                {evidenceChecks.length > 0 ? (
                  <div className="mt-3 rounded-[18px] border border-sky-100 bg-sky-50 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-800">
                        {t("capabilityDraft.panel.evidence.title", "验证证据")}
                      </span>
                      <span className="text-[10px] leading-4 text-sky-700">
                        {t(
                          "capabilityDraft.panel.evidence.subtitle",
                          "本次 verification report",
                        )}
                      </span>
                    </div>
                    <div className="mt-2 space-y-2">
                      {evidenceChecks.slice(0, 2).map((check) => (
                        <div key={check.id} className="space-y-1.5">
                          <div className="text-[11px] leading-5 text-slate-600">
                            {check.label || check.id}
                          </div>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {check.evidence.slice(0, 6).map((evidence) => (
                              <div
                                key={`${check.id}:${evidence.key}`}
                                className="rounded-xl border border-sky-100 bg-white px-2.5 py-1.5"
                              >
                                <div className="text-[10px] leading-4 text-slate-400">
                                  {formatEvidenceKey(
                                    evidence.key,
                                    evidenceLabels,
                                  )}
                                </div>
                                <div className="truncate font-mono text-[10px] leading-4 text-slate-700">
                                  {formatEvidenceValue(evidence)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {canVerify || canRegister ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
                    <p className="text-[11px] leading-5 text-slate-500">
                      {canRegister
                        ? t(
                            "capabilityDraft.panel.action.registerHelp",
                            "注册只写当前 Workspace 的 .agents/skills，不接运行或自动化。",
                          )
                        : t(
                            "capabilityDraft.panel.action.verifyHelp",
                            "只做静态门禁检查，不执行草案脚本。",
                          )}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {canVerify ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-2xl border-amber-200 bg-white px-3 text-amber-800 hover:bg-amber-50"
                          onClick={() => void handleVerifyDraft(draft)}
                          disabled={
                            isBusy ||
                            Boolean(verifyingDraftId) ||
                            Boolean(registeringDraftId)
                          }
                        >
                          <RefreshCw
                            className={cn(
                              "mr-1.5 h-3.5 w-3.5",
                              isVerifying && "animate-spin",
                            )}
                          />
                          {t("capabilityDraft.panel.action.verify", "运行验证")}
                        </Button>
                      ) : null}
                      {canRegister ? (
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-2xl bg-slate-900 px-3 text-white hover:bg-slate-800"
                          onClick={() => void handleRegisterDraft(draft)}
                          disabled={
                            isBusy ||
                            Boolean(verifyingDraftId) ||
                            Boolean(registeringDraftId)
                          }
                        >
                          <CheckCircle2
                            className={cn(
                              "mr-1.5 h-3.5 w-3.5",
                              isRegistering && "animate-pulse",
                            )}
                          />
                          {t(
                            "capabilityDraft.panel.action.register",
                            "注册到 Workspace",
                          )}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {verificationMessage ? (
        <div className="mt-3 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-600">
          {verificationMessage}
        </div>
      ) : null}
      {registrationMessage ? (
        <div className="mt-3 rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] leading-5 text-emerald-700">
          {registrationMessage}
        </div>
      ) : null}
    </section>
  );
}
