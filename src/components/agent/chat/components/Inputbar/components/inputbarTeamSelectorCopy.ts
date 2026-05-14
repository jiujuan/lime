export type InputbarTeamSelectorCopyKey =
  | "agentChat.inputbar.teamSelector.trigger.selected"
  | "agentChat.inputbar.teamSelector.trigger.default"
  | "agentChat.inputbar.teamSelector.loading"
  | "agentChat.inputbar.teamSelector.defaultRole.planner.label"
  | "agentChat.inputbar.teamSelector.defaultRole.planner.summary"
  | "agentChat.inputbar.teamSelector.defaultRole.executor.label"
  | "agentChat.inputbar.teamSelector.defaultRole.executor.summary"
  | "agentChat.inputbar.teamSelector.card.selected"
  | "agentChat.inputbar.teamSelector.card.detailTitle"
  | "agentChat.inputbar.teamSelector.card.profilePrefix"
  | "agentChat.inputbar.teamSelector.card.skillPrefix"
  | "agentChat.inputbar.teamSelector.card.viewDetail"
  | "agentChat.inputbar.teamSelector.card.collapseDetail"
  | "agentChat.inputbar.teamSelector.card.copyCustom"
  | "agentChat.inputbar.teamSelector.card.edit"
  | "agentChat.inputbar.teamSelector.card.delete"
  | "agentChat.inputbar.teamSelector.summary.rolesPrefix"
  | "agentChat.inputbar.teamSelector.summary.roleSeparator"
  | "agentChat.inputbar.teamSelector.toast.invalidDraft"
  | "agentChat.inputbar.teamSelector.toast.saveProjectSuccess"
  | "agentChat.inputbar.teamSelector.toast.saveLocalSuccess"
  | "agentChat.inputbar.teamSelector.toast.saveFailed"
  | "agentChat.inputbar.teamSelector.toast.deleteProjectSuccess"
  | "agentChat.inputbar.teamSelector.toast.deleteLocalSuccess"
  | "agentChat.inputbar.teamSelector.toast.deleteFailed"
  | "agentChat.inputbar.teamSelector.emptyInspector"
  | "agentChat.inputbar.teamSelector.badge.recommended"
  | "agentChat.inputbar.teamSelector.badge.custom"
  | "agentChat.inputbar.teamSelector.badge.systemTemplate"
  | "agentChat.inputbar.teamSelector.badge.system"
  | "agentChat.inputbar.teamSelector.inspector.current"
  | "agentChat.inputbar.teamSelector.inspector.defaultDescription"
  | "agentChat.inputbar.teamSelector.inspector.select"
  | "agentChat.inputbar.teamSelector.inspector.copyCustom"
  | "agentChat.inputbar.teamSelector.inspector.edit"
  | "agentChat.inputbar.teamSelector.inspector.summaryTitle"
  | "agentChat.inputbar.teamSelector.inspector.rolesTitle"
  | "agentChat.inputbar.teamSelector.inspector.delete"
  | "agentChat.inputbar.teamSelector.editor.title.edit"
  | "agentChat.inputbar.teamSelector.editor.title.create"
  | "agentChat.inputbar.teamSelector.editor.description"
  | "agentChat.inputbar.teamSelector.editor.close"
  | "agentChat.inputbar.teamSelector.editor.teamName"
  | "agentChat.inputbar.teamSelector.editor.teamNamePlaceholder"
  | "agentChat.inputbar.teamSelector.editor.teamDescription"
  | "agentChat.inputbar.teamSelector.editor.teamDescriptionPlaceholder"
  | "agentChat.inputbar.teamSelector.editor.rolesTitle"
  | "agentChat.inputbar.teamSelector.editor.addRole"
  | "agentChat.inputbar.teamSelector.editor.customCloneLabel"
  | "agentChat.inputbar.teamSelector.editor.roleIndex"
  | "agentChat.inputbar.teamSelector.editor.removeRole"
  | "agentChat.inputbar.teamSelector.editor.roleNamePlaceholder"
  | "agentChat.inputbar.teamSelector.editor.roleSummaryPlaceholder"
  | "agentChat.inputbar.teamSelector.editor.profileLabel"
  | "agentChat.inputbar.teamSelector.editor.profileNone"
  | "agentChat.inputbar.teamSelector.editor.profileHelp"
  | "agentChat.inputbar.teamSelector.editor.roleKeyPlaceholder"
  | "agentChat.inputbar.teamSelector.editor.roleKeyHelp"
  | "agentChat.inputbar.teamSelector.editor.skillIdsPlaceholder"
  | "agentChat.inputbar.teamSelector.editor.recommendedSkills"
  | "agentChat.inputbar.teamSelector.editor.skillIdsHelp"
  | "agentChat.inputbar.teamSelector.editor.cancel"
  | "agentChat.inputbar.teamSelector.editor.save"
  | "agentChat.inputbar.teamSelector.header.eyebrow"
  | "agentChat.inputbar.teamSelector.header.description"
  | "agentChat.inputbar.teamSelector.header.scope.project"
  | "agentChat.inputbar.teamSelector.header.scope.local"
  | "agentChat.inputbar.teamSelector.header.clear"
  | "agentChat.inputbar.teamSelector.current.title"
  | "agentChat.inputbar.teamSelector.searchPlaceholder"
  | "agentChat.inputbar.teamSelector.action.createCustom"
  | "agentChat.inputbar.teamSelector.action.clearCurrent"
  | "agentChat.inputbar.teamSelector.section.recommended"
  | "agentChat.inputbar.teamSelector.recommended.selected"
  | "agentChat.inputbar.teamSelector.section.custom.project"
  | "agentChat.inputbar.teamSelector.section.custom.local"
  | "agentChat.inputbar.teamSelector.action.createShort"
  | "agentChat.inputbar.teamSelector.emptyCustom.project"
  | "agentChat.inputbar.teamSelector.emptyCustom.local"
  | "agentChat.inputbar.teamSelector.action.createNow"
  | "agentChat.inputbar.teamSelector.section.system";

type InputbarTeamSelectorCopyValue = number | string;

export type InputbarTeamSelectorCopyTranslate = (
  key: InputbarTeamSelectorCopyKey,
  values?: Record<string, InputbarTeamSelectorCopyValue>,
) => string;

export interface InputbarTeamSelectorCopy {
  triggerSelected: (label: string) => string;
  triggerDefault: string;
  loading: string;
  defaultRole: {
    plannerLabel: string;
    plannerSummary: string;
    executorLabel: string;
    executorSummary: string;
  };
  card: {
    selected: string;
    detailTitle: string;
    profilePrefix: string;
    skillPrefix: string;
    viewDetail: string;
    collapseDetail: string;
    copyCustom: string;
    edit: string;
    delete: string;
  };
  summary: {
    rolesPrefix: string;
    roleSeparator: string;
  };
  toast: {
    invalidDraft: string;
    saveProjectSuccess: (label: string) => string;
    saveLocalSuccess: (label: string) => string;
    saveFailed: (error: string) => string;
    deleteProjectSuccess: (label: string) => string;
    deleteLocalSuccess: (label: string) => string;
    deleteFailed: (error: string) => string;
  };
  emptyInspector: string;
  badge: {
    recommended: string;
    custom: string;
    systemTemplate: string;
    system: string;
  };
  inspector: {
    current: string;
    defaultDescription: string;
    select: string;
    copyCustom: string;
    edit: string;
    summaryTitle: string;
    rolesTitle: string;
    delete: string;
  };
  editor: {
    editTitle: string;
    createTitle: string;
    description: string;
    close: string;
    teamName: string;
    teamNamePlaceholder: string;
    teamDescription: string;
    teamDescriptionPlaceholder: string;
    rolesTitle: string;
    addRole: string;
    customCloneLabel: (label: string) => string;
    roleIndex: (index: number) => string;
    removeRole: (index: number) => string;
    roleNamePlaceholder: string;
    roleSummaryPlaceholder: string;
    profileLabel: string;
    profileNone: string;
    profileHelp: string;
    roleKeyPlaceholder: string;
    roleKeyHelp: string;
    skillIdsPlaceholder: string;
    recommendedSkills: (skills: string) => string;
    skillIdsHelp: string;
    cancel: string;
    save: string;
  };
  header: {
    eyebrow: string;
    description: string;
    projectScope: string;
    localScope: string;
    clear: string;
  };
  currentTitle: string;
  searchPlaceholder: string;
  createCustom: string;
  clearCurrent: string;
  recommendedSection: string;
  recommendedSelected: string;
  customSectionProject: string;
  customSectionLocal: string;
  createShort: string;
  emptyCustomProject: string;
  emptyCustomLocal: string;
  createNow: string;
  systemSection: string;
}

export function buildInputbarTeamSelectorCopy(
  translate: InputbarTeamSelectorCopyTranslate,
): InputbarTeamSelectorCopy {
  return {
    triggerSelected: (label) =>
      translate("agentChat.inputbar.teamSelector.trigger.selected", { label }),
    triggerDefault: translate(
      "agentChat.inputbar.teamSelector.trigger.default",
    ),
    loading: translate("agentChat.inputbar.teamSelector.loading"),
    defaultRole: {
      plannerLabel: translate(
        "agentChat.inputbar.teamSelector.defaultRole.planner.label",
      ),
      plannerSummary: translate(
        "agentChat.inputbar.teamSelector.defaultRole.planner.summary",
      ),
      executorLabel: translate(
        "agentChat.inputbar.teamSelector.defaultRole.executor.label",
      ),
      executorSummary: translate(
        "agentChat.inputbar.teamSelector.defaultRole.executor.summary",
      ),
    },
    card: {
      selected: translate("agentChat.inputbar.teamSelector.card.selected"),
      detailTitle: translate(
        "agentChat.inputbar.teamSelector.card.detailTitle",
      ),
      profilePrefix: translate(
        "agentChat.inputbar.teamSelector.card.profilePrefix",
      ),
      skillPrefix: translate(
        "agentChat.inputbar.teamSelector.card.skillPrefix",
      ),
      viewDetail: translate("agentChat.inputbar.teamSelector.card.viewDetail"),
      collapseDetail: translate(
        "agentChat.inputbar.teamSelector.card.collapseDetail",
      ),
      copyCustom: translate("agentChat.inputbar.teamSelector.card.copyCustom"),
      edit: translate("agentChat.inputbar.teamSelector.card.edit"),
      delete: translate("agentChat.inputbar.teamSelector.card.delete"),
    },
    summary: {
      rolesPrefix: translate(
        "agentChat.inputbar.teamSelector.summary.rolesPrefix",
      ),
      roleSeparator: translate(
        "agentChat.inputbar.teamSelector.summary.roleSeparator",
      ),
    },
    toast: {
      invalidDraft: translate(
        "agentChat.inputbar.teamSelector.toast.invalidDraft",
      ),
      saveProjectSuccess: (label) =>
        translate("agentChat.inputbar.teamSelector.toast.saveProjectSuccess", {
          label,
        }),
      saveLocalSuccess: (label) =>
        translate("agentChat.inputbar.teamSelector.toast.saveLocalSuccess", {
          label,
        }),
      saveFailed: (error) =>
        translate("agentChat.inputbar.teamSelector.toast.saveFailed", {
          error,
        }),
      deleteProjectSuccess: (label) =>
        translate(
          "agentChat.inputbar.teamSelector.toast.deleteProjectSuccess",
          { label },
        ),
      deleteLocalSuccess: (label) =>
        translate("agentChat.inputbar.teamSelector.toast.deleteLocalSuccess", {
          label,
        }),
      deleteFailed: (error) =>
        translate("agentChat.inputbar.teamSelector.toast.deleteFailed", {
          error,
        }),
    },
    emptyInspector: translate("agentChat.inputbar.teamSelector.emptyInspector"),
    badge: {
      recommended: translate(
        "agentChat.inputbar.teamSelector.badge.recommended",
      ),
      custom: translate("agentChat.inputbar.teamSelector.badge.custom"),
      systemTemplate: translate(
        "agentChat.inputbar.teamSelector.badge.systemTemplate",
      ),
      system: translate("agentChat.inputbar.teamSelector.badge.system"),
    },
    inspector: {
      current: translate("agentChat.inputbar.teamSelector.inspector.current"),
      defaultDescription: translate(
        "agentChat.inputbar.teamSelector.inspector.defaultDescription",
      ),
      select: translate("agentChat.inputbar.teamSelector.inspector.select"),
      copyCustom: translate(
        "agentChat.inputbar.teamSelector.inspector.copyCustom",
      ),
      edit: translate("agentChat.inputbar.teamSelector.inspector.edit"),
      summaryTitle: translate(
        "agentChat.inputbar.teamSelector.inspector.summaryTitle",
      ),
      rolesTitle: translate(
        "agentChat.inputbar.teamSelector.inspector.rolesTitle",
      ),
      delete: translate("agentChat.inputbar.teamSelector.inspector.delete"),
    },
    editor: {
      editTitle: translate("agentChat.inputbar.teamSelector.editor.title.edit"),
      createTitle: translate(
        "agentChat.inputbar.teamSelector.editor.title.create",
      ),
      description: translate(
        "agentChat.inputbar.teamSelector.editor.description",
      ),
      close: translate("agentChat.inputbar.teamSelector.editor.close"),
      teamName: translate("agentChat.inputbar.teamSelector.editor.teamName"),
      teamNamePlaceholder: translate(
        "agentChat.inputbar.teamSelector.editor.teamNamePlaceholder",
      ),
      teamDescription: translate(
        "agentChat.inputbar.teamSelector.editor.teamDescription",
      ),
      teamDescriptionPlaceholder: translate(
        "agentChat.inputbar.teamSelector.editor.teamDescriptionPlaceholder",
      ),
      rolesTitle: translate(
        "agentChat.inputbar.teamSelector.editor.rolesTitle",
      ),
      addRole: translate("agentChat.inputbar.teamSelector.editor.addRole"),
      customCloneLabel: (label) =>
        translate("agentChat.inputbar.teamSelector.editor.customCloneLabel", {
          label,
        }),
      roleIndex: (index) =>
        translate("agentChat.inputbar.teamSelector.editor.roleIndex", {
          index,
        }),
      removeRole: (index) =>
        translate("agentChat.inputbar.teamSelector.editor.removeRole", {
          index,
        }),
      roleNamePlaceholder: translate(
        "agentChat.inputbar.teamSelector.editor.roleNamePlaceholder",
      ),
      roleSummaryPlaceholder: translate(
        "agentChat.inputbar.teamSelector.editor.roleSummaryPlaceholder",
      ),
      profileLabel: translate(
        "agentChat.inputbar.teamSelector.editor.profileLabel",
      ),
      profileNone: translate(
        "agentChat.inputbar.teamSelector.editor.profileNone",
      ),
      profileHelp: translate(
        "agentChat.inputbar.teamSelector.editor.profileHelp",
      ),
      roleKeyPlaceholder: translate(
        "agentChat.inputbar.teamSelector.editor.roleKeyPlaceholder",
      ),
      roleKeyHelp: translate(
        "agentChat.inputbar.teamSelector.editor.roleKeyHelp",
      ),
      skillIdsPlaceholder: translate(
        "agentChat.inputbar.teamSelector.editor.skillIdsPlaceholder",
      ),
      recommendedSkills: (skills) =>
        translate("agentChat.inputbar.teamSelector.editor.recommendedSkills", {
          skills,
        }),
      skillIdsHelp: translate(
        "agentChat.inputbar.teamSelector.editor.skillIdsHelp",
      ),
      cancel: translate("agentChat.inputbar.teamSelector.editor.cancel"),
      save: translate("agentChat.inputbar.teamSelector.editor.save"),
    },
    header: {
      eyebrow: translate("agentChat.inputbar.teamSelector.header.eyebrow"),
      description: translate(
        "agentChat.inputbar.teamSelector.header.description",
      ),
      projectScope: translate(
        "agentChat.inputbar.teamSelector.header.scope.project",
      ),
      localScope: translate(
        "agentChat.inputbar.teamSelector.header.scope.local",
      ),
      clear: translate("agentChat.inputbar.teamSelector.header.clear"),
    },
    currentTitle: translate("agentChat.inputbar.teamSelector.current.title"),
    searchPlaceholder: translate(
      "agentChat.inputbar.teamSelector.searchPlaceholder",
    ),
    createCustom: translate(
      "agentChat.inputbar.teamSelector.action.createCustom",
    ),
    clearCurrent: translate(
      "agentChat.inputbar.teamSelector.action.clearCurrent",
    ),
    recommendedSection: translate(
      "agentChat.inputbar.teamSelector.section.recommended",
    ),
    recommendedSelected: translate(
      "agentChat.inputbar.teamSelector.recommended.selected",
    ),
    customSectionProject: translate(
      "agentChat.inputbar.teamSelector.section.custom.project",
    ),
    customSectionLocal: translate(
      "agentChat.inputbar.teamSelector.section.custom.local",
    ),
    createShort: translate(
      "agentChat.inputbar.teamSelector.action.createShort",
    ),
    emptyCustomProject: translate(
      "agentChat.inputbar.teamSelector.emptyCustom.project",
    ),
    emptyCustomLocal: translate(
      "agentChat.inputbar.teamSelector.emptyCustom.local",
    ),
    createNow: translate("agentChat.inputbar.teamSelector.action.createNow"),
    systemSection: translate("agentChat.inputbar.teamSelector.section.system"),
  };
}
