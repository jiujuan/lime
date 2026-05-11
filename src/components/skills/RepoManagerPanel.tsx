import { useState } from "react";
import { X, Plus, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SkillRepo } from "@/lib/api/skills";

interface RepoManagerPanelProps {
  repos: SkillRepo[];
  onClose: () => void;
  onAddRepo: (repo: SkillRepo) => Promise<void>;
  onRemoveRepo: (owner: string, name: string) => Promise<void>;
  onRefresh: () => void;
}

export function RepoManagerPanel({
  repos,
  onClose,
  onAddRepo,
  onRemoveRepo,
  onRefresh,
}: RepoManagerPanelProps) {
  const { t } = useTranslation("agent");
  const [owner, setOwner] = useState("");
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleAdd = async () => {
    if (!owner.trim() || !name.trim()) {
      window.alert(t("skills.repoManager.validation.ownerAndName"));
      return;
    }

    setAdding(true);
    try {
      await onAddRepo({
        owner: owner.trim(),
        name: name.trim(),
        branch: branch.trim() || "main",
        enabled: true,
      });
      setOwner("");
      setName("");
      setBranch("main");
    } catch (e) {
      window.alert(
        t("skills.repoManager.message.addFailed", {
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (repoOwner: string, repoName: string) => {
    const key = `${repoOwner}/${repoName}`;
    setRemoving(key);
    try {
      await onRemoveRepo(repoOwner, repoName);
    } catch (e) {
      window.alert(
        t("skills.repoManager.message.removeFailed", {
          message: e instanceof Error ? e.message : String(e),
        }),
      );
    } finally {
      setRemoving(null);
    }
  };

  const openRepo = (repo: SkillRepo) => {
    window.open(`https://github.com/${repo.owner}/${repo.name}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[linear-gradient(180deg,rgba(240,249,255,0.82)_0%,rgba(236,253,245,0.74)_52%,rgba(255,255,255,0.86)_100%)] backdrop-blur-[2px]">
      <div className="bg-background rounded-xl shadow-lg w-full max-w-2xl max-h-[80vh] overflow-hidden border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-lg font-semibold">
              {t("skills.repoManager.title")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("skills.repoManager.description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="rounded-lg p-2 hover:bg-muted"
              title={t("skills.repoManager.action.refresh")}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 hover:bg-muted"
              title={t("skills.repoManager.action.close")}
              aria-label={t("skills.repoManager.action.close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(80vh-140px)]">
          {/* Add Repo Form */}
          <div className="rounded-lg border bg-card p-4">
            <h4 className="font-medium mb-3">
              {t("skills.repoManager.form.title")}
            </h4>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">
                    {t("skills.repoManager.field.owner")}
                  </label>
                  <input
                    type="text"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    placeholder="anthropics"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">
                    {t("skills.repoManager.field.repositoryName")}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="skills"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">
                  {t("skills.repoManager.field.branch")}
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={adding}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {adding ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t("skills.repoManager.action.adding")}
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    {t("skills.repoManager.action.add")}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Repo List */}
          <div className="space-y-2">
            <h4 className="font-medium">
              {t("skills.repoManager.list.title")}
            </h4>
            {repos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t("skills.repoManager.list.empty")}
              </p>
            ) : (
              repos.map((repo) => {
                const key = `${repo.owner}/${repo.name}`;
                const isRemoving = removing === key;

                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg border bg-card p-3"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{key}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("skills.repoManager.repo.branch", {
                          branch: repo.branch,
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openRepo(repo)}
                        className="rounded-lg p-2 hover:bg-muted"
                        title={t("skills.repoManager.action.openGitHub")}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleRemove(repo.owner, repo.name)}
                        disabled={isRemoving}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                        title={t("skills.repoManager.action.remove")}
                      >
                        {isRemoving ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
