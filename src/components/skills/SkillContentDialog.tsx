import type { ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownPreview } from "@/components/preview/MarkdownPreview";
import type { LocalSkillInspection } from "@/lib/api/skills";
import "@/components/preview/preview.css";

export interface SkillContentDialogProps {
  /** Skill 名称 */
  skillName: string;
  /** Skill 描述 */
  skillDescription?: string;
  /** 是否打开 */
  open: boolean;
  /** 打开状态变化 */
  onOpenChange: (open: boolean) => void;
  /** Skill 检查结果 */
  inspection: LocalSkillInspection | null;
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-background p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function InlineTag({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function SkillContentDialog({
  skillName,
  skillDescription,
  open,
  onOpenChange,
  inspection,
  loading,
  error,
}: SkillContentDialogProps) {
  const { t } = useTranslation("agent");
  const content = inspection?.content ?? "";
  const compliance = inspection?.standardCompliance;
  const metadataEntries = Object.entries(inspection?.metadata ?? {});
  const allowedTools = inspection?.allowedTools ?? [];
  const deprecatedFields = compliance?.deprecatedFields ?? [];
  const validationErrors = compliance?.validationErrors ?? [];
  const resourceSummary = inspection?.resourceSummary;

  const complianceBadge = (() => {
    if (!compliance) {
      return null;
    }

    if (!compliance.isStandard) {
      return (
        <InlineTag className="gap-1 bg-red-100 text-red-700">
          <AlertTriangle className="h-3 w-3" />
          {t("skills.contentDialog.compliance.needsFix")}
        </InlineTag>
      );
    }

    if (deprecatedFields.length > 0) {
      return (
        <InlineTag className="gap-1 bg-amber-100 text-amber-700">
          <AlertTriangle className="h-3 w-3" />
          {t("skills.contentDialog.compliance.compatFields")}
        </InlineTag>
      );
    }

    return (
      <InlineTag className="gap-1 bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        {t("skills.contentDialog.compliance.standard")}
      </InlineTag>
    );
  })();

  const resourceTags = [
    resourceSummary?.hasScripts ? "scripts" : null,
    resourceSummary?.hasReferences ? "references" : null,
    resourceSummary?.hasAssets ? "assets" : null,
  ].filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        maxWidth="max-w-5xl"
        className="h-[80vh] p-0 overflow-hidden"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            {skillName}
          </DialogTitle>
          <DialogDescription>
            {skillDescription?.trim()
              ? skillDescription
              : t("skills.contentDialog.description.default")}
          </DialogDescription>
        </DialogHeader>

        <div className="h-[calc(80vh-88px)] overflow-auto bg-muted/10">
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("skills.contentDialog.loading")}
            </div>
          )}

          {!loading && error && (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-red-600">
              <AlertCircle className="h-8 w-8" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && (
            <>
              {inspection ? (
                <div className="space-y-4 p-6">
                  <section className="rounded-xl border bg-background p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {complianceBadge}
                      {inspection.license && (
                        <InlineTag className="bg-slate-100 text-slate-700">
                          {t("skills.contentDialog.license", {
                            license: inspection.license,
                          })}
                        </InlineTag>
                      )}
                      {resourceTags.map((tag) => (
                        <InlineTag
                          key={tag}
                          className="bg-sky-100 text-sky-700"
                        >
                          {tag}
                        </InlineTag>
                      ))}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border bg-muted/20 px-3 py-2">
                        <div className="text-xs text-muted-foreground">
                          {t("skills.contentDialog.metric.validationErrors")}
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {validationErrors.length}
                        </div>
                      </div>
                      <div className="rounded-lg border bg-muted/20 px-3 py-2">
                        <div className="text-xs text-muted-foreground">
                          {t("skills.contentDialog.metric.deprecatedFields")}
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {deprecatedFields.length}
                        </div>
                      </div>
                      <div className="rounded-lg border bg-muted/20 px-3 py-2">
                        <div className="text-xs text-muted-foreground">
                          {t("skills.contentDialog.metric.allowedTools")}
                        </div>
                        <div className="mt-1 text-sm font-semibold">
                          {allowedTools.length}
                        </div>
                      </div>
                    </div>
                  </section>

                  {validationErrors.length > 0 && (
                    <Section
                      title={t("skills.contentDialog.section.validationErrors")}
                    >
                      <div className="space-y-2">
                        {validationErrors.map((message) => (
                          <div
                            key={message}
                            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                          >
                            {message}
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {deprecatedFields.length > 0 && (
                    <Section
                      title={t("skills.contentDialog.section.deprecatedFields")}
                    >
                      <div className="flex flex-wrap gap-2">
                        {deprecatedFields.map((field) => (
                          <InlineTag
                            key={field}
                            className="bg-amber-100 text-amber-700"
                          >
                            {field}
                          </InlineTag>
                        ))}
                      </div>
                    </Section>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <Section title={t("skills.contentDialog.section.metadata")}>
                      {metadataEntries.length > 0 ? (
                        <dl className="space-y-3">
                          {metadataEntries.map(([key, value]) => (
                            <div
                              key={key}
                              className="rounded-lg border bg-muted/20 px-3 py-2"
                            >
                              <dt className="text-xs font-medium text-muted-foreground">
                                {key}
                              </dt>
                              <dd className="mt-1 break-all text-sm text-foreground">
                                {value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          {t("skills.contentDialog.metadata.empty")}
                        </div>
                      )}
                    </Section>

                    <Section
                      title={t("skills.contentDialog.section.allowedTools")}
                    >
                      {allowedTools.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {allowedTools.map((tool) => (
                            <InlineTag
                              key={tool}
                              className="bg-slate-100 text-slate-700"
                            >
                              {tool}
                            </InlineTag>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          {t("skills.contentDialog.allowedTools.empty")}
                        </div>
                      )}
                    </Section>
                  </div>

                  <Section
                    title={t("skills.contentDialog.section.originalSkill")}
                  >
                    {content.trim() ? (
                      <div className="[--terminal-bg:#ffffff] [--terminal-fg:#111827] [--terminal-border:#e5e7eb] [--terminal-muted:#6b7280] [--terminal-accent:#2563eb] [--terminal-tab-bg:#f8fafc]">
                        <MarkdownPreview content={content} />
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {t("skills.contentDialog.content.empty")}
                      </div>
                    )}
                  </Section>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
                  {t("skills.contentDialog.emptyInspection")}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
