/**
 * 个人资料设置页面组件
 *
 * 保留现有资料读写逻辑，升级为更清晰的摘要卡 + 分区表单布局。
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Edit2,
  Mail,
  Plus,
  Sparkles,
  Tag,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { WorkbenchInfoTip } from "@/components/media/WorkbenchInfoTip";
import { cn } from "@/lib/utils";
import {
  getConfig,
  saveConfig,
  type Config,
  type UserProfile,
} from "@/lib/api/appConfig";

type EditableProfileField = "nickname" | "bio" | "email";

interface ProfileFieldMeta {
  key: EditableProfileField;
  icon: LucideIcon;
  editable?: boolean;
  multiline?: boolean;
}

const DEFAULT_USER_PROFILE: UserProfile = {
  avatar_url: "",
  nickname: "",
  bio: "",
  email: "",
  tags: [],
};

const PROFILE_FIELDS: ProfileFieldMeta[] = [
  {
    key: "nickname",
    icon: User,
    editable: true,
  },
  {
    key: "bio",
    icon: Edit2,
    editable: true,
    multiline: true,
  },
  {
    key: "email",
    icon: Mail,
    editable: false,
  },
];

const SUGGESTED_TAG_KEYS = [
  "programming",
  "writing",
  "design",
  "dataAnalysis",
  "productManager",
  "founder",
  "student",
  "researcher",
] as const;
const PRIMARY_ACTION_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-[16px] border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-4 py-3 text-sm font-medium text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95";
const PRIMARY_PILL_BUTTON_CLASS =
  "inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-emerald-950/15 transition hover:opacity-95";
const ICON_ACTION_BUTTON_CLASS =
  "absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-2xl border border-white bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_55%,#10b981_100%)] text-white shadow-lg shadow-emerald-950/15 transition hover:opacity-95";

function hasText(value?: string) {
  return Boolean(value?.trim());
}

interface ProfileFieldCardProps {
  field: EditableProfileField;
  icon: LucideIcon;
  label: string;
  description: string;
  value: string;
  placeholder: string;
  editable?: boolean;
  multiline?: boolean;
  hint: string;
  isEditing: boolean;
  editValue: string;
  onStartEdit: (field: EditableProfileField, currentValue: string) => void;
  onEditValueChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  actionLabels: {
    cancel: string;
    cancelAria: string;
    edit: string;
    editAria: string;
    readOnly: string;
    save: string;
    saveAria: string;
    tipAria: string;
    tipsHint: string;
  };
}

function ProfileFieldCard({
  field,
  icon: Icon,
  label,
  description,
  value,
  placeholder,
  editable = true,
  multiline = false,
  hint,
  isEditing,
  editValue,
  onStartEdit,
  onEditValueChange,
  onSave,
  onCancel,
  actionLabels,
}: ProfileFieldCardProps) {
  return (
    <article className="rounded-[22px] border border-slate-200/80 bg-white/90 p-4 shadow-sm shadow-slate-950/5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-slate-700">
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-900">{label}</p>
              <WorkbenchInfoTip
                ariaLabel={actionLabels.tipAria}
                content={
                  <div className="space-y-1">
                    <p>{description}</p>
                    <p>{hint}</p>
                  </div>
                }
                tone="slate"
              />
              {!editable && (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {actionLabels.readOnly}
                </span>
              )}
            </div>
          </div>
        </div>

        {editable && !isEditing && (
          <button
            type="button"
            aria-label={actionLabels.editAria}
            onClick={() => onStartEdit(field, value)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            <Edit2 className="h-3.5 w-3.5" />
            {actionLabels.edit}
          </button>
        )}
      </div>

      <div className="mt-4">
        {isEditing ? (
          multiline ? (
            <textarea
              id={`profile-field-${field}`}
              value={editValue}
              onChange={(event) => {
                onEditValueChange(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSave();
                } else if (event.key === "Escape") {
                  onCancel();
                }
              }}
              rows={4}
              className="min-h-[120px] w-full rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
              placeholder={placeholder}
              autoFocus
            />
          ) : (
            <input
              id={`profile-field-${field}`}
              type="text"
              value={editValue}
              onChange={(event) => {
                onEditValueChange(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onSave();
                } else if (event.key === "Escape") {
                  onCancel();
                }
              }}
              className="w-full rounded-[18px] border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
              placeholder={placeholder}
              autoFocus
            />
          )
        ) : (
          <div className="rounded-[18px] border border-slate-100 bg-slate-50/80 px-4 py-3">
            <p
              className={cn(
                "text-sm leading-6",
                value ? "text-slate-700" : "text-slate-400",
              )}
            >
              {value || placeholder}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-xs leading-5 text-slate-500">
          {actionLabels.tipsHint}
        </span>
        {isEditing && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label={actionLabels.cancelAria}
              onClick={onCancel}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            >
              {actionLabels.cancel}
            </button>
            <button
              type="button"
              aria-label={actionLabels.saveAria}
              onClick={onSave}
              className={PRIMARY_PILL_BUTTON_CLASS}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {actionLabels.save}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function ProfileSettings() {
  const { t } = useTranslation("settings");
  const [config, setConfig] = useState<Config | null>(null);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<EditableProfileField | null>(
    null,
  );
  const [editValue, setEditValue] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [newTag, setNewTag] = useState("");
  const messageTimerRef = useRef<number | null>(null);
  const profileFields = PROFILE_FIELDS.map((field) => {
    const keyPrefix = `settings.profile.field.${field.key}`;
    const label = t(`${keyPrefix}.label`, {
      defaultValue:
        field.key === "nickname"
          ? "昵称"
          : field.key === "bio"
            ? "个人简介"
            : "邮箱",
    });

    return {
      ...field,
      label,
      description: t(`${keyPrefix}.description`, {
        defaultValue:
          field.key === "nickname"
            ? "展示在工作区与 AI 语境中的称呼。"
            : field.key === "bio"
              ? "用几句话说明你的工作背景、兴趣和当前目标。"
              : "账号识别邮箱，当前页面仅展示，不支持直接修改。",
      }),
      placeholder: t(`${keyPrefix}.placeholder`, {
        defaultValue:
          field.key === "nickname"
            ? "还没有设置昵称"
            : field.key === "bio"
              ? "补充你的角色、关注方向或当前项目，AI 会更快理解你。"
              : "尚未绑定邮箱",
      }),
      hint: t(`${keyPrefix}.hint`, {
        defaultValue:
          field.key === "nickname"
            ? "建议使用你最常用的称呼，便于系统在多处一致展示。"
            : field.key === "bio"
              ? "按 Enter 保存，使用 Shift + Enter 换行。"
              : "如需修改邮箱，请使用账号相关入口或后续专用流程。",
      }),
      tipAria: t("settings.profile.field.tipAria", {
        label,
        defaultValue: "{{label}}说明",
      }),
      editAria: t("settings.profile.field.editAria", {
        label,
        defaultValue: "编辑{{label}}",
      }),
      cancelAria: t("settings.profile.field.cancelAria", {
        label,
        defaultValue: "取消编辑{{label}}",
      }),
      saveAria: t("settings.profile.field.saveAria", {
        label,
        defaultValue: "保存{{label}}",
      }),
    };
  });

  useEffect(() => {
    void loadConfig();
    return () => {
      if (messageTimerRef.current !== null) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const loadedConfig = await getConfig();
      setConfig(loadedConfig);
      setProfile(loadedConfig.user_profile || DEFAULT_USER_PROFILE);
    } catch (error) {
      console.error("加载用户资料失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    if (messageTimerRef.current !== null) {
      window.clearTimeout(messageTimerRef.current);
    }

    setMessage({ type, text });
    messageTimerRef.current = window.setTimeout(() => {
      setMessage(null);
      messageTimerRef.current = null;
    }, 3000);
  };

  const saveProfileEntry = async <K extends keyof UserProfile>(
    key: K,
    value: UserProfile[K],
  ) => {
    if (!config) {
      showMessage(
        "error",
        t(
          "settings.profile.message.configPending",
          "资料配置尚未加载完成，暂时无法保存。",
        ),
      );
      return;
    }

    try {
      const newProfile = {
        ...profile,
        [key]: value,
      };
      const completeProfile: UserProfile = {
        avatar_url: newProfile.avatar_url || profile.avatar_url || "",
        nickname: newProfile.nickname || profile.nickname || "",
        bio: newProfile.bio || profile.bio || "",
        email: newProfile.email || profile.email || "",
        tags: newProfile.tags || profile.tags || [],
      };
      const updatedFullConfig = {
        ...config,
        user_profile: completeProfile,
      };

      await saveConfig(updatedFullConfig);
      setConfig(updatedFullConfig);
      setProfile(completeProfile);
      showMessage("success", t("settings.profile.message.saved", "资料已保存"));
    } catch (error) {
      console.error("保存用户资料失败:", error);
      showMessage(
        "error",
        t("settings.profile.message.saveFailed", {
          error: String(error),
          defaultValue: "保存失败: {{error}}",
        }),
      );
    }
  };

  const handleStartEdit = (
    field: EditableProfileField,
    currentValue: string = "",
  ) => {
    if (editingField === field) {
      return;
    }

    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleSaveEdit = () => {
    if (!editingField) {
      return;
    }

    void saveProfileEntry(editingField, editValue);
    setEditingField(null);
    setEditValue("");
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const handleAddTag = () => {
    const trimmedTag = newTag.trim();
    if (!trimmedTag || (profile.tags || []).includes(trimmedTag)) {
      return;
    }

    void saveProfileEntry("tags", [...(profile.tags || []), trimmedTag]);
    setNewTag("");
  };

  const handleRemoveTag = (tag: string) => {
    void saveProfileEntry(
      "tags",
      (profile.tags || []).filter((item) => item !== tag),
    );
  };

  const handleUploadAvatar = async () => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/png,image/jpeg,image/gif,image/webp";
      input.style.display = "none";

      input.onchange = async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) {
          return;
        }

        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
          showMessage(
            "error",
            t("settings.profile.message.fileTooLarge", {
              size: (file.size / 1024 / 1024).toFixed(2),
              max: 5,
              defaultValue: "文件过大 ({{size}}MB)，最大支持 {{max}}MB",
            }),
          );
          return;
        }

        await file.arrayBuffer();
        showMessage(
          "success",
          t("settings.profile.message.avatarWip", "头像上传功能正在完善中"),
        );
      };

      document.body.appendChild(input);
      input.click();
      document.body.removeChild(input);
    } catch (error) {
      console.error("上传头像失败:", error);
      showMessage(
        "error",
        t("settings.profile.message.uploadFailed", {
          error: String(error),
          defaultValue: "上传失败: {{error}}",
        }),
      );
    }
  };

  const tags = profile.tags || [];
  const completionItems = [
    hasText(profile.nickname),
    hasText(profile.bio),
    hasText(profile.email),
    tags.length > 0,
  ].filter(Boolean).length;
  const completionPercent = Math.round((completionItems / 4) * 100);
  const statusLabel =
    completionPercent >= 75
      ? t("settings.profile.status.complete", "资料完整")
      : completionPercent >= 40
        ? t("settings.profile.status.progress", "逐步成型")
        : t("settings.profile.status.pending", "待补充");
  const statusClassName =
    completionPercent >= 75
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : completionPercent >= 40
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  const suggestedTags = SUGGESTED_TAG_KEYS.map((key) =>
    t(`settings.profile.suggestedTag.${key}`, {
      defaultValue:
        key === "programming"
          ? "编程"
          : key === "writing"
            ? "写作"
            : key === "design"
              ? "设计"
              : key === "dataAnalysis"
                ? "数据分析"
                : key === "productManager"
                  ? "产品经理"
                  : key === "founder"
                    ? "创业者"
                    : key === "student"
                      ? "学生"
                      : "研究者",
    }),
  ).filter(
    (tag) => !tags.includes(tag),
  ).slice(0, 6);
  const quickTags = tags.slice(0, 3);
  const extraTagCount = Math.max(tags.length - quickTags.length, 0);
  const isInitialLoading = loading && !config;

  if (isInitialLoading) {
    return (
      <div className="space-y-4">
        <div className="h-[176px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.95fr)]">
          <div className="space-y-4">
            <div className="h-[320px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
          </div>
          <div className="space-y-4">
            <div className="h-[300px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
            <div className="h-[180px] animate-pulse rounded-[26px] border border-slate-200/80 bg-white" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      {message && (
        <div
          className={cn(
            "flex items-center gap-3 rounded-[20px] border px-4 py-3 text-sm shadow-sm shadow-slate-950/5",
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50/90 text-emerald-700"
              : "border-rose-200 bg-rose-50/90 text-rose-700",
          )}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <section className="rounded-[26px] border border-slate-200/80 bg-white px-5 py-4 shadow-sm shadow-slate-950/5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">
                  {t("settings.profile.hero.title", "个人资料")}
                </h1>
                <WorkbenchInfoTip
                  ariaLabel={t(
                    "settings.profile.hero.tipAria",
                    "个人资料总览说明",
                  )}
                  content={t(
                    "settings.profile.hero.tip",
                    "管理昵称、简介、邮箱和偏好标签，帮助 Lime 在工作区里更准确地理解你的语境。",
                  )}
                  tone="mint"
                />
              </div>
              <p className="text-sm text-slate-500">
                {t(
                  "settings.profile.hero.subtitle",
                  "管理昵称、简介、邮箱和偏好标签。",
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  statusClassName,
                )}
              >
                {t("settings.profile.hero.status", {
                  status: statusLabel,
                  defaultValue: "状态：{{status}}",
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                {t("settings.profile.hero.completion", {
                  percent: completionPercent,
                  defaultValue: "完成度：{{percent}}%",
                })}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                {t("settings.profile.hero.tags", {
                  count: tags.length,
                  defaultValue: "标签：{{count}}",
                })}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-[22px] border border-slate-200/80 bg-slate-50/60 p-4 lg:flex-row lg:items-start">
            <div className="relative flex-shrink-0 self-start">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={t("settings.profile.avatar.alt", "头像")}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-10 w-10 text-slate-400" />
                )}
              </div>
              <button
                type="button"
                aria-label={t("settings.profile.avatar.update", "更新头像")}
                onClick={handleUploadAvatar}
                className={ICON_ACTION_BUTTON_CLASS}
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>

            <div className="min-w-0 space-y-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                    {profile.nickname ||
                      t("settings.profile.avatar.nicknameEmpty", "未设置昵称")}
                  </h2>
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium",
                      statusClassName,
                    )}
                  >
                    {statusLabel}
                  </span>
                </div>
                <p className="max-w-2xl text-sm leading-6 text-slate-600">
                  {profile.bio ||
                    t(
                      "settings.profile.avatar.bioEmpty",
                      "补充几句你的工作背景、关注方向或使用目标，AI 会更快进入正确语境。",
                    )}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  {profile.email ||
                    t("settings.profile.avatar.emailEmpty", "邮箱待补充")}
                </span>

                {quickTags.length > 0 ? (
                  quickTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-dashed border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-500">
                    {t(
                      "settings.profile.avatar.tagsEmpty",
                      "添加标签帮助 AI 理解你的领域偏好",
                    )}
                  </span>
                )}

                {extraTagCount > 0 && (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                    {t("settings.profile.avatar.extraTags", {
                      count: extraTagCount,
                      defaultValue: "+{{count}} 个标签",
                    })}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs leading-5 text-slate-500">
                <span>
                  {t(
                    "settings.profile.avatar.limitInline",
                    "头像格式限制已收纳",
                  )}
                </span>
                <WorkbenchInfoTip
                  ariaLabel={t(
                    "settings.profile.avatar.limitAria",
                    "头像上传限制说明",
                  )}
                  content={t(
                    "settings.profile.avatar.limitTip",
                    "头像支持 PNG / JPG / GIF / WEBP，单文件不超过 5MB。",
                  )}
                  tone="slate"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.95fr)]">
        <div className="space-y-4">
          <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {t("settings.profile.basic.title", "基础资料")}
                  </p>
                  <WorkbenchInfoTip
                    ariaLabel={t(
                      "settings.profile.basic.tipAria",
                      "基础资料说明",
                    )}
                    content={t(
                      "settings.profile.basic.tip",
                      "这些信息会参与欢迎语、工作区称呼和部分个性化提示生成。",
                    )}
                    tone="slate"
                  />
                </div>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                {t("settings.profile.basic.itemCount", {
                  count: profileFields.length,
                  defaultValue: "{{count}} 项",
                })}
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {profileFields.map((field) => (
                <ProfileFieldCard
                  key={field.key}
                  field={field.key}
                  icon={field.icon}
                  label={field.label}
                  description={field.description}
                  value={profile[field.key] || ""}
                  placeholder={field.placeholder}
                  editable={field.editable}
                  multiline={field.multiline}
                  hint={field.hint}
                  isEditing={editingField === field.key}
                  editValue={editValue}
                  onStartEdit={handleStartEdit}
                  onEditValueChange={setEditValue}
                  onSave={handleSaveEdit}
                  onCancel={handleCancelEdit}
                  actionLabels={{
                    cancel: t("settings.profile.action.cancel", "取消"),
                    cancelAria: field.cancelAria,
                    edit: t("settings.profile.action.edit", "编辑"),
                    editAria: field.editAria,
                    readOnly: t("settings.profile.field.readOnly", "只读"),
                    save: t("settings.profile.action.save", "保存"),
                    saveAria: field.saveAria,
                    tipAria: field.tipAria,
                    tipsHint: t(
                      "settings.profile.field.tipsHint",
                      "通过 Tips 查看说明",
                    ),
                  }}
                />
              ))}
            </div>
          </article>
        </div>

        <div className="space-y-4">
          <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Tag className="h-4 w-4 text-emerald-600" />
                  {t("settings.profile.tags.title", "偏好标签")}
                  <WorkbenchInfoTip
                    ariaLabel={t(
                      "settings.profile.tags.tipAria",
                      "偏好标签说明",
                    )}
                    content={t(
                      "settings.profile.tags.tip",
                      "标签帮助 AI 判断你更关注的主题和表达风格。",
                    )}
                    tone="slate"
                  />
                </div>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                {t("settings.profile.tags.selectedCount", {
                  count: tags.length,
                  defaultValue: "{{count}} 个已选",
                })}
              </span>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {tags.length > 0 ? (
                tags.map((tag) => (
                  <div
                    key={tag}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      aria-label={t("settings.profile.tags.removeAria", {
                        tag,
                        defaultValue: "移除标签{{tag}}",
                      })}
                      onClick={() => handleRemoveTag(tag)}
                      className="rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 text-sm leading-6 text-slate-500">
                  {t(
                    "settings.profile.tags.empty",
                    "还没有添加标签。可以从推荐标签开始，也可以输入自定义领域。",
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
              <label
                htmlFor="profile-new-tag"
                className="text-xs font-medium tracking-[0.12em] text-slate-500"
              >
                {t("settings.profile.tags.customLabel", "CUSTOM TAG")}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="profile-new-tag"
                  type="text"
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder={t(
                    "settings.profile.tags.customPlaceholder",
                    "例如：全栈工程、内容策略、效率工具",
                  )}
                  className="flex-1 rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-slate-300"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className={PRIMARY_ACTION_BUTTON_CLASS}
                >
                  <Plus className="h-4 w-4" />
                  {t("settings.profile.tags.add", "添加标签")}
                </button>
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-medium tracking-[0.12em] text-slate-500">
                {t("settings.profile.tags.recommended", "推荐标签")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      void saveProfileEntry("tags", [...tags, tag]);
                    }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </article>

          <article className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-950/5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-sky-600" />
              {t("settings.profile.usage.title", "资料如何被使用")}
              <WorkbenchInfoTip
                ariaLabel={t(
                  "settings.profile.usage.tipAria",
                  "资料如何被使用说明",
                )}
                content={
                  <div className="space-y-1">
                    <p>
                      {t(
                        "settings.profile.usage.tipNickname",
                        "昵称和简介会帮助 AI 在开场、建议和工作区提示中更自然地引用你的背景。",
                      )}
                    </p>
                    <p>
                      {t(
                        "settings.profile.usage.tipTags",
                        "标签只用于偏好判断，不会替代系统提示词，也不会自动暴露给外部服务。",
                      )}
                    </p>
                    <p>
                      {t(
                        "settings.profile.usage.tipEmail",
                        "邮箱由账号体系维护，当前页面仅做展示，避免在多入口出现不一致状态。",
                      )}
                    </p>
                  </div>
                }
                tone="slate"
              />
            </div>
            <div className="mt-4 rounded-[22px] border border-slate-100 bg-slate-50/70 px-4 py-3 text-xs leading-5 text-slate-500">
              {t("settings.profile.usage.inline", "说明已收纳到标题旁 Tips。")}
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
