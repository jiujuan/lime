import type {
  HomeGuideCard,
  HomeInputSuggestion,
  HomeSkillCategory,
  HomeStarterChip,
} from "./homeSurfaceTypes";

export type HomeSurfaceCopyKey =
  | "agentChat.home.composer.placeholder"
  | "agentChat.home.composer.autoLaunchExample"
  | "agentChat.home.composer.pathReferenceFallbackPrompt"
  | "agentChat.home.composer.guideHelpDefaultLabel"
  | "agentChat.home.composer.guideHelpClose"
  | "agentChat.home.composer.guideHelpCloseWithLabel"
  | "agentChat.home.composer.advancedSettings.label"
  | "agentChat.home.composer.advancedSettings.expand"
  | "agentChat.home.composer.advancedSettings.collapse"
  | "agentChat.home.composer.currentModel.label"
  | "agentChat.home.composer.currentModel.title"
  | "agentChat.home.composer.fileManager.open"
  | "agentChat.home.composer.fileManager.close"
  | "agentChat.home.composer.creationMode.label"
  | "agentChat.home.hero.eyebrow"
  | "agentChat.home.hero.slogan"
  | "agentChat.home.hero.description"
  | "agentChat.home.hero.supportingDescription"
  | "agentChat.home.toast.imageReadFailed"
  | "agentChat.home.toast.unnamedImage"
  | "agentChat.home.toast.imagePasted"
  | "agentChat.home.toast.imageAdded"
  | "agentChat.home.toast.systemPathDropUnsupported"
  | "agentChat.home.curatedTask.reviewSuggestionPrefillHint"
  | "agentChat.home.quickActions.title"
  | "agentChat.home.quickActions.description"
  | "agentChat.home.quickActions.badge"
  | "agentChat.home.quickActions.preset.generateImage.label"
  | "agentChat.home.quickActions.preset.generateImage.prompt"
  | "agentChat.home.quickActions.preset.joinNotebook.label"
  | "agentChat.home.quickActions.preset.joinNotebook.prompt"
  | "agentChat.home.quickActions.preset.createSkill.label"
  | "agentChat.home.quickActions.preset.createSkill.prompt"
  | "agentChat.home.quickActions.preset.createSlides.label"
  | "agentChat.home.quickActions.preset.createSlides.prompt"
  | "agentChat.home.quickActions.preset.frontendDesign.label"
  | "agentChat.home.quickActions.preset.frontendDesign.prompt"
  | "agentChat.home.quickActions.preset.professionalEmail.label"
  | "agentChat.home.quickActions.preset.professionalEmail.prompt"
  | "agentChat.home.quickActions.preset.researchMode.label"
  | "agentChat.home.quickActions.preset.researchMode.prompt"
  | "agentChat.home.guideHelp.contextLabel"
  | "agentChat.home.guideHelp.contextLabelWithStarter"
  | "agentChat.home.guideHelp.placeholder"
  | "agentChat.home.starter.rowLabel"
  | "agentChat.home.starter.managerLabel"
  | "agentChat.home.category.recent"
  | "agentChat.home.category.social"
  | "agentChat.home.category.video"
  | "agentChat.home.category.visualDesign"
  | "agentChat.home.category.editor"
  | "agentChat.home.category.audioMusic"
  | "agentChat.home.category.other"
  | "agentChat.home.starter.guideHelp.label"
  | "agentChat.home.starter.writing.label"
  | "agentChat.home.starter.knowledgeImport.label"
  | "agentChat.home.starter.ppt.label"
  | "agentChat.home.starter.ppt.prompt"
  | "agentChat.home.starter.researchReport.label"
  | "agentChat.home.starter.requirementAnalysis.label"
  | "agentChat.home.starter.video.label"
  | "agentChat.home.starter.design.label"
  | "agentChat.home.starter.design.prompt"
  | "agentChat.home.starter.excel.label"
  | "agentChat.home.starter.excel.prompt"
  | "agentChat.home.starter.code.label"
  | "agentChat.home.starter.code.prompt"
  | "agentChat.home.starter.more.label"
  | "agentChat.home.inputSuggestion.meetingNotes.label"
  | "agentChat.home.inputSuggestion.meetingNotes.prompt"
  | "agentChat.home.inputSuggestion.knowledgeImport.label"
  | "agentChat.home.inputSuggestion.knowledgeImport.prompt"
  | "agentChat.home.inputSuggestion.researchReport.label"
  | "agentChat.home.inputSuggestion.researchReport.prompt"
  | "agentChat.home.inputSuggestion.pptOutline.label"
  | "agentChat.home.inputSuggestion.pptOutline.prompt"
  | "agentChat.home.inputSuggestion.requirementAnalysis.label"
  | "agentChat.home.inputSuggestion.requirementAnalysis.prompt"
  | "agentChat.home.inputSuggestion.videoScript.label"
  | "agentChat.home.inputSuggestion.videoScript.prompt"
  | "agentChat.home.guide.longTermPlan.title"
  | "agentChat.home.guide.longTermPlan.summary"
  | "agentChat.home.guide.longTermPlan.prompt"
  | "agentChat.home.guide.addModel.title"
  | "agentChat.home.guide.addModel.summary"
  | "agentChat.home.guide.addModel.prompt"
  | "agentChat.home.guide.installSkill.title"
  | "agentChat.home.guide.installSkill.summary"
  | "agentChat.home.guide.installSkill.prompt"
  | "agentChat.home.guide.knowledge.title"
  | "agentChat.home.guide.knowledge.summary"
  | "agentChat.home.guide.knowledge.prompt"
  | "agentChat.home.guide.voiceInput.title"
  | "agentChat.home.guide.voiceInput.summary"
  | "agentChat.home.guide.voiceInput.prompt"
  | "agentChat.home.guideCards.label"
  | "agentChat.home.moreSkills.drawerLabel"
  | "agentChat.home.gallery.title"
  | "agentChat.home.gallery.description"
  | "agentChat.home.scrollCue.label"
  | "agentChat.home.secondScreen.label"
  | "agentChat.home.supplemental.recentSession.defaultAction";

type HomeSurfaceCopyValue = number | string;

export type HomeSurfaceCopyTranslate = (
  key: HomeSurfaceCopyKey,
  values?: Record<string, HomeSurfaceCopyValue>,
) => string;

export interface HomeSurfaceChromeCopy {
  starterRowLabel: string;
  starterManagerLabel: string;
  guideCardsLabel: string;
  moreSkillsDrawerLabel: string;
  galleryTitle: string;
  galleryDescription: string;
  scrollCueLabel: string;
  secondScreenLabel: string;
  recentSessionDefaultActionLabel: string;
}

export interface HomeSurfaceHeroCopy {
  eyebrow: string;
  slogan: string;
  description: string;
  supportingDescription: string;
}

export interface HomeSurfaceToastCopy {
  unnamedImage: string;
  imageReadFailed: (fileName: string) => string;
  imagePasted: string;
  imageAdded: string;
  systemPathDropUnsupported: string;
}

export interface HomeSurfaceQuickPresetCopy {
  key: string;
  label: string;
  icon: string;
  prompt: string;
}

export interface HomeSurfaceQuickActionsCopy {
  title: string;
  description: string;
  badge: (icon: string) => string;
  presets: HomeSurfaceQuickPresetCopy[];
}

export interface HomeSurfaceComposerCopy {
  guideHelpDefaultLabel: string;
  guideHelpClose: string;
  guideHelpCloseWithLabel: (label: string) => string;
  advancedSettings: {
    label: string;
    expand: string;
    collapse: string;
  };
  currentModel: {
    label: string;
    title: (model: string) => string;
  };
  fileManager: {
    open: string;
    close: string;
  };
  creationMode: {
    label: string;
  };
}

export interface HomeSurfaceCopy {
  hero: HomeSurfaceHeroCopy;
  composerPlaceholder: string;
  composerAutoLaunchPlaceholder: (example: string) => string;
  composerPathReferenceFallbackPrompt: string;
  composer: HomeSurfaceComposerCopy;
  guideHelpContextLabel: string;
  guideHelpContextLabelWithStarter: (label: string) => string;
  guideHelpPlaceholder: string;
  toast: HomeSurfaceToastCopy;
  curatedTaskReviewSuggestionPrefillHint: string;
  quickActions: HomeSurfaceQuickActionsCopy;
  chrome: HomeSurfaceChromeCopy;
  categoryLabels: Record<HomeSkillCategory, string>;
  starterChips: HomeStarterChip[];
  starterMoreLabel: string;
  inputSuggestions: HomeInputSuggestion[];
  guideCards: HomeGuideCard[];
}

export const HOME_CATEGORY_ORDER: HomeSkillCategory[] = [
  "recent",
  "social",
  "video",
  "visual_design",
  "editor",
  "audio_music",
  "other",
];

export function buildHomeSurfaceCopy(
  translate: HomeSurfaceCopyTranslate,
): HomeSurfaceCopy {
  const starterMoreLabel = translate("agentChat.home.starter.more.label");

  return {
    hero: {
      eyebrow: translate("agentChat.home.hero.eyebrow"),
      slogan: translate("agentChat.home.hero.slogan"),
      description: translate("agentChat.home.hero.description"),
      supportingDescription: translate(
        "agentChat.home.hero.supportingDescription",
      ),
    },
    composerPlaceholder: translate("agentChat.home.composer.placeholder"),
    composerAutoLaunchPlaceholder: (example) =>
      translate("agentChat.home.composer.autoLaunchExample", { example }),
    composerPathReferenceFallbackPrompt: translate(
      "agentChat.home.composer.pathReferenceFallbackPrompt",
    ),
    composer: {
      guideHelpDefaultLabel: translate(
        "agentChat.home.composer.guideHelpDefaultLabel",
      ),
      guideHelpClose: translate("agentChat.home.composer.guideHelpClose"),
      guideHelpCloseWithLabel: (label) =>
        translate("agentChat.home.composer.guideHelpCloseWithLabel", {
          label,
        }),
      advancedSettings: {
        label: translate("agentChat.home.composer.advancedSettings.label"),
        expand: translate("agentChat.home.composer.advancedSettings.expand"),
        collapse: translate(
          "agentChat.home.composer.advancedSettings.collapse",
        ),
      },
      currentModel: {
        label: translate("agentChat.home.composer.currentModel.label"),
        title: (model) =>
          translate("agentChat.home.composer.currentModel.title", { model }),
      },
      fileManager: {
        open: translate("agentChat.home.composer.fileManager.open"),
        close: translate("agentChat.home.composer.fileManager.close"),
      },
      creationMode: {
        label: translate("agentChat.home.composer.creationMode.label"),
      },
    },
    guideHelpContextLabel: translate("agentChat.home.guideHelp.contextLabel"),
    guideHelpContextLabelWithStarter: (label) =>
      translate("agentChat.home.guideHelp.contextLabelWithStarter", { label }),
    guideHelpPlaceholder: translate("agentChat.home.guideHelp.placeholder"),
    toast: {
      unnamedImage: translate("agentChat.home.toast.unnamedImage"),
      imageReadFailed: (fileName) =>
        translate("agentChat.home.toast.imageReadFailed", { fileName }),
      imagePasted: translate("agentChat.home.toast.imagePasted"),
      imageAdded: translate("agentChat.home.toast.imageAdded"),
      systemPathDropUnsupported: translate(
        "agentChat.home.toast.systemPathDropUnsupported",
      ),
    },
    curatedTaskReviewSuggestionPrefillHint: translate(
      "agentChat.home.curatedTask.reviewSuggestionPrefillHint",
    ),
    quickActions: {
      title: translate("agentChat.home.quickActions.title"),
      description: translate("agentChat.home.quickActions.description"),
      badge: (icon) =>
        translate("agentChat.home.quickActions.badge", { icon }),
      presets: [
        {
          key: "generate-image",
          label: translate(
            "agentChat.home.quickActions.preset.generateImage.label",
          ),
          icon: "✨",
          prompt: translate(
            "agentChat.home.quickActions.preset.generateImage.prompt",
          ),
        },
        {
          key: "join-notebook",
          label: translate(
            "agentChat.home.quickActions.preset.joinNotebook.label",
          ),
          icon: "📒",
          prompt: translate(
            "agentChat.home.quickActions.preset.joinNotebook.prompt",
          ),
        },
        {
          key: "create-skill",
          label: translate(
            "agentChat.home.quickActions.preset.createSkill.label",
          ),
          icon: "🧩",
          prompt: translate(
            "agentChat.home.quickActions.preset.createSkill.prompt",
          ),
        },
        {
          key: "create-slides",
          label: translate(
            "agentChat.home.quickActions.preset.createSlides.label",
          ),
          icon: "🖥️",
          prompt: translate(
            "agentChat.home.quickActions.preset.createSlides.prompt",
          ),
        },
        {
          key: "frontend-design",
          label: translate(
            "agentChat.home.quickActions.preset.frontendDesign.label",
          ),
          icon: "🌐",
          prompt: translate(
            "agentChat.home.quickActions.preset.frontendDesign.prompt",
          ),
        },
        {
          key: "copymail-skill",
          label: translate(
            "agentChat.home.quickActions.preset.professionalEmail.label",
          ),
          icon: "✉️",
          prompt: translate(
            "agentChat.home.quickActions.preset.professionalEmail.prompt",
          ),
        },
        {
          key: "research-skills",
          label: translate(
            "agentChat.home.quickActions.preset.researchMode.label",
          ),
          icon: "🔎",
          prompt: translate(
            "agentChat.home.quickActions.preset.researchMode.prompt",
          ),
        },
      ],
    },
    chrome: {
      starterRowLabel: translate("agentChat.home.starter.rowLabel"),
      starterManagerLabel: translate("agentChat.home.starter.managerLabel"),
      guideCardsLabel: translate("agentChat.home.guideCards.label"),
      moreSkillsDrawerLabel: translate("agentChat.home.moreSkills.drawerLabel"),
      galleryTitle: translate("agentChat.home.gallery.title"),
      galleryDescription: translate("agentChat.home.gallery.description"),
      scrollCueLabel: translate("agentChat.home.scrollCue.label"),
      secondScreenLabel: translate("agentChat.home.secondScreen.label"),
      recentSessionDefaultActionLabel: translate(
        "agentChat.home.supplemental.recentSession.defaultAction",
      ),
    },
    categoryLabels: {
      recent: translate("agentChat.home.category.recent"),
      social: translate("agentChat.home.category.social"),
      video: translate("agentChat.home.category.video"),
      visual_design: translate("agentChat.home.category.visualDesign"),
      editor: translate("agentChat.home.category.editor"),
      audio_music: translate("agentChat.home.category.audioMusic"),
      other: translate("agentChat.home.category.other"),
    },
    starterChips: [
      {
        id: "starter-guide-help",
        label: translate("agentChat.home.starter.guideHelp.label"),
        launchKind: "toggle_guide",
        groupKey: "guide_help",
        iconToken: "lightbulb",
        primary: true,
        testId: "home-guide-help-trigger",
      },
      {
        id: "starter-writing",
        label: translate("agentChat.home.starter.writing.label"),
        launchKind: "curated_task_launcher",
        targetItemId: "social-post-starter",
        category: "social",
        primary: true,
        testId: "entry-recommended-social-post-starter",
      },
      {
        id: "starter-knowledge-import",
        label: translate("agentChat.home.starter.knowledgeImport.label"),
        launchKind: "open_knowledge_hub",
        category: "other",
        iconToken: "knowledge",
        testId: "entry-home-knowledge-import",
      },
      {
        id: "starter-ppt",
        label: translate("agentChat.home.starter.ppt.label"),
        launchKind: "prefill_prompt",
        category: "editor",
        prompt: translate("agentChat.home.starter.ppt.prompt"),
        testId: "entry-home-ppt",
      },
      {
        id: "starter-research-report",
        label: translate("agentChat.home.starter.researchReport.label"),
        launchKind: "curated_task_launcher",
        targetItemId: "daily-trend-briefing",
        category: "social",
        testId: "entry-recommended-daily-trend-briefing",
      },
      {
        id: "starter-requirement-analysis",
        label: translate("agentChat.home.starter.requirementAnalysis.label"),
        launchKind: "curated_task_launcher",
        targetItemId: "account-project-review",
        category: "social",
        testId: "entry-recommended-account-project-review",
      },
      {
        id: "starter-video",
        label: translate("agentChat.home.starter.video.label"),
        launchKind: "curated_task_launcher",
        targetItemId: "script-to-voiceover",
        category: "video",
        testId: "entry-recommended-script-to-voiceover",
      },
      {
        id: "starter-design",
        label: translate("agentChat.home.starter.design.label"),
        launchKind: "prefill_prompt",
        category: "visual_design",
        prompt: translate("agentChat.home.starter.design.prompt"),
        testId: "entry-home-design",
      },
      {
        id: "starter-excel",
        label: translate("agentChat.home.starter.excel.label"),
        launchKind: "prefill_prompt",
        category: "editor",
        prompt: translate("agentChat.home.starter.excel.prompt"),
        testId: "entry-home-excel",
      },
      {
        id: "starter-code",
        label: translate("agentChat.home.starter.code.label"),
        launchKind: "prefill_prompt",
        category: "other",
        prompt: translate("agentChat.home.starter.code.prompt"),
        testId: "entry-home-code",
      },
      {
        id: "starter-more",
        label: starterMoreLabel,
        launchKind: "open_drawer",
        testId: "home-more-skills-trigger",
      },
      {
        id: "starter-manager",
        label: "⚙",
        launchKind: "open_manager",
        testId: "home-skill-manager-trigger",
      },
    ],
    starterMoreLabel,
    inputSuggestions: [
      {
        id: "suggestion-meeting-notes",
        label: translate("agentChat.home.inputSuggestion.meetingNotes.label"),
        prompt: translate("agentChat.home.inputSuggestion.meetingNotes.prompt"),
        order: 5,
        testId: "home-input-suggestion-meeting-notes",
      },
      {
        id: "suggestion-knowledge-import",
        label: translate(
          "agentChat.home.inputSuggestion.knowledgeImport.label",
        ),
        prompt: translate(
          "agentChat.home.inputSuggestion.knowledgeImport.prompt",
        ),
        order: 8,
        testId: "home-input-suggestion-knowledge-import",
      },
      {
        id: "suggestion-research-report",
        label: translate("agentChat.home.inputSuggestion.researchReport.label"),
        prompt: translate(
          "agentChat.home.inputSuggestion.researchReport.prompt",
        ),
        order: 10,
        testId: "home-input-suggestion-research-report",
      },
      {
        id: "suggestion-ppt-outline",
        label: translate("agentChat.home.inputSuggestion.pptOutline.label"),
        prompt: translate("agentChat.home.inputSuggestion.pptOutline.prompt"),
        order: 20,
        testId: "home-input-suggestion-ppt-outline",
      },
      {
        id: "suggestion-requirement-analysis",
        label: translate(
          "agentChat.home.inputSuggestion.requirementAnalysis.label",
        ),
        prompt: translate(
          "agentChat.home.inputSuggestion.requirementAnalysis.prompt",
        ),
        order: 30,
        testId: "home-input-suggestion-requirement-analysis",
      },
      {
        id: "suggestion-video-script",
        label: translate("agentChat.home.inputSuggestion.videoScript.label"),
        prompt: translate("agentChat.home.inputSuggestion.videoScript.prompt"),
        order: 40,
        testId: "home-input-suggestion-video-script",
      },
    ],
    guideCards: [
      {
        id: "guide-long-term-plan",
        title: translate("agentChat.home.guide.longTermPlan.title"),
        summary: translate("agentChat.home.guide.longTermPlan.summary"),
        prompt: translate("agentChat.home.guide.longTermPlan.prompt"),
        groupKey: "guide_help",
        testId: "home-guide-long-term-plan",
      },
      {
        id: "guide-add-model",
        title: translate("agentChat.home.guide.addModel.title"),
        summary: translate("agentChat.home.guide.addModel.summary"),
        prompt: translate("agentChat.home.guide.addModel.prompt"),
        groupKey: "guide_help",
        testId: "home-guide-add-model",
      },
      {
        id: "guide-install-skill",
        title: translate("agentChat.home.guide.installSkill.title"),
        summary: translate("agentChat.home.guide.installSkill.summary"),
        prompt: translate("agentChat.home.guide.installSkill.prompt"),
        groupKey: "guide_help",
        testId: "home-guide-install-skill",
      },
      {
        id: "guide-knowledge",
        title: translate("agentChat.home.guide.knowledge.title"),
        summary: translate("agentChat.home.guide.knowledge.summary"),
        prompt: translate("agentChat.home.guide.knowledge.prompt"),
        groupKey: "guide_help",
        testId: "home-guide-knowledge",
      },
      {
        id: "guide-voice-input",
        title: translate("agentChat.home.guide.voiceInput.title"),
        summary: translate("agentChat.home.guide.voiceInput.summary"),
        prompt: translate("agentChat.home.guide.voiceInput.prompt"),
        groupKey: "guide_help",
        testId: "home-guide-voice-input",
      },
    ],
  };
}
