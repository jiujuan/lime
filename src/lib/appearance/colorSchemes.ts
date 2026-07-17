export const LIME_COLOR_SCHEME_STORAGE_KEY = "lime.appearance.skin";
export const LIME_COLOR_SCHEME_CHANGED_EVENT = "lime-color-scheme-changed";

export const DEFAULT_LIME_COLOR_SCHEME_ID = "dream-blossom";

export type LimeColorSchemeId =
  | "dream-blossom"
  | "lime-classic"
  | "lime-forest"
  | "lime-ocean"
  | "lime-sand"
  | "lime-neon"
  | "lime-citron"
  | "lime-dusk"
  | "lime-minimal"
  | "lime-vivid"
  | "lime-literary"
  | "lime-luxury"
  | "lime-future";

export interface LimeColorScheme {
  id: LimeColorSchemeId;
  label: string;
  description: string;
  swatches: readonly [string, string, string];
  variables: Record<string, string>;
  darkVariables: Record<string, string>;
}

export interface LimeColorSchemeChangedEventDetail {
  colorSchemeId: LimeColorSchemeId;
}

type LimeColorSchemeEffectiveThemeMode = "light" | "dark";

interface Palette {
  textStrong: string;
  text: string;
  textMuted: string;
  app: string;
  shell: string;
  stage: string;
  stageTop: string;
  surface: string;
  soft: string;
  muted: string;
  hover: string;
  border: string;
  borderStrong: string;
  brandStrong: string;
  brand: string;
  brandMuted: string;
  brandSoft: string;
  info: string;
  infoSoft: string;
  infoBorder: string;
  warning: string;
  warningSoft: string;
  warningBorder: string;
  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  sidebar: string;
  sidebarTop: string;
  sidebarMiddle: string;
  sidebarBottom: string;
}

function makePalette(overrides: Partial<Palette> = {}): Palette {
  return {
    textStrong: "#132019",
    text: "#26342c",
    textMuted: "#6b7a72",
    app: "#f3f7f3",
    shell: "#edf4ee",
    stage: "#fafcf9",
    stageTop: "#ffffff",
    surface: "#ffffff",
    soft: "#f5f9f5",
    muted: "#eaf1eb",
    hover: "#edf5ee",
    border: "#d8e3da",
    borderStrong: "#bfd2c3",
    brandStrong: "#17623d",
    brand: "#2f9862",
    brandMuted: "#70ab89",
    brandSoft: "#e5f5eb",
    info: "#3d718d",
    infoSoft: "#edf6fb",
    infoBorder: "#bdd8e6",
    warning: "#b56a1e",
    warningSoft: "#fff5df",
    warningBorder: "#e7c58c",
    danger: "#bc3d58",
    dangerSoft: "#fff0f3",
    dangerBorder: "#edbdc9",
    sidebar: "#f2f7f2",
    sidebarTop: "#edf4ee",
    sidebarMiddle: "#f5f9f5",
    sidebarBottom: "#ffffff",
    ...overrides,
  };
}

function buildVariables(palette: Palette): Record<string, string> {
  const accentGlow = palette.brand.replace("#", "");
  return {
    "--lime-text-strong": palette.textStrong,
    "--lime-text": palette.text,
    "--lime-text-muted": palette.textMuted,
    "--lime-surface": palette.surface,
    "--lime-surface-subtle": palette.stageTop,
    "--lime-surface-soft": palette.soft,
    "--lime-surface-muted": palette.muted,
    "--lime-surface-hover": palette.hover,
    "--lime-surface-border": palette.border,
    "--lime-surface-border-strong": palette.borderStrong,
    "--lime-shadow-color": "rgba(15, 23, 42, 0.12)",
    "--lime-app-bg": palette.app,
    "--lime-shell-surface": `linear-gradient(180deg, ${palette.shell} 0%, ${palette.surface} 100%)`,
    "--lime-stage-surface": `linear-gradient(180deg, ${palette.stageTop} 0%, ${palette.stage} 58%, ${palette.surface} 100%)`,
    "--lime-stage-surface-soft": `linear-gradient(180deg, ${palette.stageTop} 0%, ${palette.stage} 100%)`,
    "--lime-stage-surface-top": palette.stageTop,
    "--lime-card-subtle": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.soft} 100%)`,
    "--lime-card-subtle-border": palette.border,
    "--lime-divider-subtle": palette.border,
    "--lime-brand-strong": palette.brandStrong,
    "--lime-brand": palette.brand,
    "--lime-brand-muted": palette.brandMuted,
    "--lime-brand-soft": palette.brandSoft,
    "--lime-info": palette.info,
    "--lime-info-soft": palette.infoSoft,
    "--lime-info-border": palette.infoBorder,
    "--lime-warning": palette.warning,
    "--lime-warning-soft": palette.warningSoft,
    "--lime-warning-border": palette.warningBorder,
    "--lime-danger": palette.danger,
    "--lime-danger-soft": palette.dangerSoft,
    "--lime-danger-border": palette.dangerBorder,
    "--lime-focus-ring": `color-mix(in srgb, ${palette.brand} 22%, transparent)`,
    "--lime-chrome-rail": palette.sidebarTop,
    "--lime-chrome-rail-surface": `linear-gradient(180deg, ${palette.sidebarTop} 0%, ${palette.sidebar} 100%)`,
    "--lime-chrome-surface": palette.surface,
    "--lime-chrome-active-tab": palette.stageTop,
    "--lime-chrome-tab-hover": palette.hover,
    "--lime-chrome-tab-active-surface": palette.stageTop,
    "--lime-chrome-border": palette.border,
    "--lime-chrome-divider": palette.border,
    "--lime-chrome-stage-blend": `linear-gradient(180deg, ${palette.stageTop} 0%, ${palette.stage} 100%)`,
    "--lime-chrome-stage-seam": palette.borderStrong,
    "--lime-chrome-shadow-subtle": "0 10px 22px -30px rgba(15, 23, 42, 0.32)",
    "--lime-chrome-text": palette.text,
    "--lime-chrome-muted": palette.textMuted,
    "--lime-sidebar-surface": `linear-gradient(180deg, ${palette.sidebarTop} 0%, ${palette.sidebarMiddle} 52%, ${palette.sidebarBottom} 100%)`,
    "--lime-sidebar-surface-top": palette.sidebarTop,
    "--lime-sidebar-surface-middle": palette.sidebarMiddle,
    "--lime-sidebar-surface-bottom": palette.sidebarBottom,
    "--lime-sidebar-border": palette.border,
    "--lime-sidebar-divider": palette.border,
    "--lime-sidebar-hover": palette.hover,
    "--lime-sidebar-active": palette.brandSoft,
    "--lime-sidebar-active-text": palette.brandStrong,
    "--lime-sidebar-search-bg": palette.surface,
    "--lime-sidebar-search-hover": palette.soft,
    "--lime-sidebar-search-border-hover": palette.borderStrong,
    "--lime-sidebar-card-surface": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.soft} 100%)`,
    "--lime-sidebar-card-border": palette.border,
    "--lime-sidebar-card-highlight": "rgba(255, 255, 255, 0.56)",
    "--lime-sidebar-card-shadow": "0 14px 28px -26px rgba(15, 23, 42, 0.3)",
    "--lime-sidebar-glow-primary": `color-mix(in srgb, ${palette.brand} 5%, transparent)`,
    "--lime-sidebar-glow-secondary": `color-mix(in srgb, ${palette.brandMuted} 4%, transparent)`,
    "--lime-sidebar-glow-tertiary": `color-mix(in srgb, ${palette.info} 4%, transparent)`,
    "--lime-home-bg-start": palette.app,
    "--lime-home-bg-mid": palette.surface,
    "--lime-home-bg-end": palette.stage,
    "--lime-home-glow-primary": `color-mix(in srgb, ${palette.brand} 5%, transparent)`,
    "--lime-home-glow-secondary": `color-mix(in srgb, ${palette.info} 5%, transparent)`,
    "--lime-home-title-gradient": `linear-gradient(90deg, ${palette.textStrong} 0%, ${palette.brand} 100%)`,
    "--lime-home-title-shadow": "0 12px 26px rgba(15, 23, 42, 0.04)",
    "--lime-home-dot-gradient": `linear-gradient(135deg, ${palette.brandMuted}, ${palette.brand})`,
    "--lime-home-dot-shadow": `0 0 0 8px color-mix(in srgb, #${accentGlow} 6%, transparent), 0 0 14px color-mix(in srgb, ${palette.brand} 10%, transparent)`,
    "--lime-home-beam-gradient": `linear-gradient(90deg, transparent 0%, color-mix(in srgb, ${palette.brand} 5%, transparent) 34%, rgba(255,255,255,0.24) 50%, transparent 100%)`,
    "--lime-home-card-surface": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.soft} 100%)`,
    "--lime-home-card-surface-strong": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.muted} 100%)`,
    "--lime-home-card-border": palette.border,
    "--lime-home-card-border-muted": palette.border,
    "--lime-home-card-hover-border": palette.borderStrong,
    "--lime-composer-surface": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.soft} 100%)`,
    "--lime-composer-shell": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.soft} 100%)`,
    "--lime-composer-surface-floating": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.soft} 100%)`,
    "--lime-composer-surface-focus": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.muted} 100%)`,
    "--lime-composer-context-surface": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.soft} 100%)`,
    "--lime-composer-context-surface-focus": `linear-gradient(180deg, ${palette.surface} 0%, ${palette.muted} 100%)`,
    "--lime-composer-border": palette.border,
    "--lime-composer-border-focus": palette.brand,
    "--lime-primary-gradient": `linear-gradient(135deg, ${palette.brandStrong} 0%, ${palette.brand} 60%, ${palette.brandMuted} 100%)`,
    "--lime-primary-gradient-simple": `linear-gradient(135deg, ${palette.brandStrong} 0%, ${palette.brand} 100%)`,
  };
}

const DARK_BASE = makePalette({
  textStrong: "#f5fbf7",
  text: "#dbe8df",
  textMuted: "#9fb2a6",
  app: "#0e1712",
  shell: "#142019",
  stage: "#121b16",
  stageTop: "#1b2a22",
  surface: "#1b2821",
  soft: "#24352c",
  muted: "#2f4438",
  hover: "#30473a",
  border: "#40594a",
  borderStrong: "#617668",
  brandStrong: "#a8e7bd",
  brand: "#63c68b",
  brandMuted: "#89b79b",
  brandSoft: "#203b2b",
  info: "#8ac7e8",
  infoSoft: "#203449",
  infoBorder: "#4d7690",
  warning: "#f0bf79",
  warningSoft: "#3b2e1d",
  warningBorder: "#81633b",
  danger: "#f29aad",
  dangerSoft: "#43262e",
  dangerBorder: "#8c4b59",
  sidebar: "#101d16",
  sidebarTop: "#142019",
  sidebarMiddle: "#19271f",
  sidebarBottom: "#0e1712",
});

interface SkinBlueprint {
  id: LimeColorSchemeId;
  label: string;
  description: string;
  swatches: readonly [string, string, string];
  light: Palette;
  dark: Palette;
}

function skin(
  id: LimeColorSchemeId,
  label: string,
  description: string,
  swatches: readonly [string, string, string],
  light: Partial<Palette>,
  dark: Partial<Palette>,
): SkinBlueprint {
  return { id, label, description, swatches, light: makePalette(light), dark: makePalette({ ...DARK_BASE, ...dark }) };
}

const SKIN_BLUEPRINTS: readonly SkinBlueprint[] = [
  skin("dream-blossom", "梦樱花境", "梦樱人物、粉白花幕与酒红重点色。", ["#fff7fa", "#d95f87", "#963958"], {
    textStrong: "#402530", text: "#654652", textMuted: "#8e6e7a", app: "#fdf3f7", shell: "#fff7fa", stage: "#fdf3f7", soft: "#fff1f6", muted: "#f9e5ed", border: "#efceda", borderStrong: "#dfafc1", brandStrong: "#963958", brand: "#d95f87", brandMuted: "#e982a4", brandSoft: "#fde7ef", info: "#2878a4", infoSoft: "#edf7fb", infoBorder: "#b9dce9", sidebar: "#fbeef3", sidebarTop: "#f7e6ed", sidebarMiddle: "#fbeef3", sidebarBottom: "#fff6f9",
  }, {
    textStrong: "#fff1f5", text: "#f1dce4", textMuted: "#c5a5b2", app: "#160f14", shell: "#1b1117", stage: "#160f14", surface: "#251820", soft: "#34212b", muted: "#402934", border: "#573642", borderStrong: "#805162", brandStrong: "#f4a6c1", brand: "#ec8eae", brandMuted: "#d76e94", brandSoft: "#482d3a", sidebar: "#21151c", sidebarTop: "#1b1117", sidebarMiddle: "#21151c", sidebarBottom: "#251820",
  }),
  skin("lime-classic", "森野秘境", "墨绿森林、晨雾与低干扰工作表面。", ["#f8fcf7", "#2f9862", "#0ea5e9"], {}, {}),
  skin("lime-forest", "财神打工", "财神程序员、朱红鎏金与轻松国潮。", ["#fffaf0", "#c43c2f", "#d49a32"], {
    textStrong: "#491718", text: "#5b2621", textMuted: "#8a6a58", app: "#f7ecd8", shell: "#f5e4c4", stage: "#f7ecd8", soft: "#f9edd3", muted: "#f2dfbd", hover: "#f5e4c4", border: "#ead3aa", borderStrong: "#dcb77a", brandStrong: "#9c1f1f", brand: "#c43c2f", brandMuted: "#d49a32", brandSoft: "#fff0d2", info: "#4d7c68", sidebar: "#faefd9", sidebarTop: "#f3dfb9", sidebarMiddle: "#faefd9", sidebarBottom: "#fff8ea",
  }, {
    app: "#241311", shell: "#301815", stage: "#241311", stageTop: "#3b1f1b", surface: "#3a211b", soft: "#4a2a20", muted: "#5a3325", border: "#714333", borderStrong: "#a36d3a", brandStrong: "#ffd88b", brand: "#e7a743", brandMuted: "#b97833", brandSoft: "#4a2d1f", sidebar: "#2d1815", sidebarTop: "#351b17", sidebarMiddle: "#2d1815", sidebarBottom: "#20110f",
  }),
  skin("lime-ocean", "奥特曼守护", "银红英雄、深海蓝未来城市与电光青。", ["#f3f8fa", "#0f766e", "#ef4444"], {
    textStrong: "#173346", text: "#23465d", textMuted: "#647b8f", app: "#f2f7f9", shell: "#edf5f7", stage: "#f2f7f9", soft: "#f3f8fa", muted: "#e1eef2", border: "#c8dde4", borderStrong: "#9ec8d3", brandStrong: "#0f766e", brand: "#14b8a6", brandMuted: "#3b82f6", brandSoft: "#e5fbfb", info: "#2f6f8f", sidebar: "#f5fafb", sidebarTop: "#edf5f7", sidebarMiddle: "#f5fafb", sidebarBottom: "#f8fcfd",
  }, {
    app: "#0b1120", shell: "#101b30", stage: "#0b1120", stageTop: "#142943", surface: "#0f172a", soft: "#17233a", muted: "#203451", border: "#2d4868", borderStrong: "#467799", brandStrong: "#86efac", brand: "#2de1c2", brandMuted: "#60a5fa", brandSoft: "#123b42", info: "#8bd3f3", sidebar: "#0c1627", sidebarTop: "#101b30", sidebarMiddle: "#0f1a2d", sidebarBottom: "#08101d",
  }),
  skin("lime-sand", "东方国潮", "东方人物、山河云纹与胭脂红宣纸白。", ["#fffaf2", "#be2e35", "#c58b44"], {
    textStrong: "#271516", text: "#422220", textMuted: "#7d625b", app: "#f5e8dc", shell: "#f2dfd2", stage: "#f5e8dc", soft: "#f8eadc", muted: "#f0d7c8", border: "#e5c7b7", borderStrong: "#c98774", brandStrong: "#8f1d22", brand: "#be2e35", brandMuted: "#c58b44", brandSoft: "#fff0e7", info: "#467b73", sidebar: "#f8ece1", sidebarTop: "#f0ddd0", sidebarMiddle: "#f8ece1", sidebarBottom: "#fff8ef",
  }, {
    app: "#1b1114", shell: "#281719", stage: "#1b1114", stageTop: "#3a2021", surface: "#2d1b1b", soft: "#3b2423", muted: "#4b2a27", border: "#69403a", borderStrong: "#9d6751", brandStrong: "#ffd99b", brand: "#e86b54", brandMuted: "#c99855", brandSoft: "#4b2924", sidebar: "#241416", sidebarTop: "#2d191a", sidebarMiddle: "#241416", sidebarBottom: "#160c0f",
  }),
  skin("lime-neon", "初音未来", "青蓝歌姬、粉紫舞台与冰白表面。", ["#effcff", "#22c7c9", "#c084fc"], {
    textStrong: "#193849", text: "#2e5365", textMuted: "#6d8391", app: "#f0fbfd", shell: "#e8f8fb", stage: "#f5fcfd", soft: "#e9f7fb", muted: "#d9eef4", border: "#b9dfe9", borderStrong: "#83c8d7", brandStrong: "#008d9d", brand: "#22c7c9", brandMuted: "#c084fc", brandSoft: "#e6faff", info: "#4b7fd0", sidebar: "#edfafd", sidebarTop: "#e3f5f8", sidebarMiddle: "#effafd", sidebarBottom: "#ffffff",
  }, {
    app: "#10192d", shell: "#162642", stage: "#10192d", stageTop: "#1e3860", surface: "#182a48", soft: "#21385c", muted: "#2d4773", border: "#41658f", borderStrong: "#5d90b9", brandStrong: "#7ceaf0", brand: "#2de1df", brandMuted: "#d2a7ff", brandSoft: "#2b2a5a", sidebar: "#121f37", sidebarTop: "#192b4a", sidebarMiddle: "#162642", sidebarBottom: "#0d1527",
  }),
  skin("lime-citron", "灵感少年", "ENFP 动漫少年、青柠黄与薄荷青。", ["#fbffe8", "#84cc16", "#f97316"], {
    textStrong: "#273416", text: "#3e5026", textMuted: "#6d7e5b", app: "#f6fbdc", shell: "#eef7d0", stage: "#f8fce9", soft: "#f2f9d7", muted: "#e5f0bc", border: "#d0e3a0", borderStrong: "#b2cf6c", brandStrong: "#4d7c0f", brand: "#84cc16", brandMuted: "#f97316", brandSoft: "#effac7", info: "#2686a1", sidebar: "#f1f8d8", sidebarTop: "#eaf4c9", sidebarMiddle: "#f4fbdc", sidebarBottom: "#ffffff",
  }, {
    app: "#17200f", shell: "#222e15", stage: "#18210f", stageTop: "#2d3f1c", surface: "#26351a", soft: "#33491e", muted: "#435b25", border: "#5d7836", borderStrong: "#81a84d", brandStrong: "#d8f98b", brand: "#a4df36", brandMuted: "#ffad67", brandSoft: "#33471c", sidebar: "#1f2c14", sidebarTop: "#263619", sidebarMiddle: "#202f15", sidebarBottom: "#141d0d",
  }),
  skin("lime-dusk", "黑金舞台", "黑金明星、唱片舞台与香槟金光线。", ["#17171b", "#d9a441", "#f2c76b"], {
    textStrong: "#30251b", text: "#4b3b2a", textMuted: "#7e705f", app: "#f3eadc", shell: "#eadfce", stage: "#f3eadc", soft: "#f7ead7", muted: "#efdfc8", border: "#dcc8aa", borderStrong: "#c9ad83", brandStrong: "#65691f", brand: "#7c7f32", brandMuted: "#c1784a", brandSoft: "#f7f3dd", info: "#8a5a44", sidebar: "#f6ecdc", sidebarTop: "#eadfce", sidebarMiddle: "#f6ecdc", sidebarBottom: "#fffaf2",
  }, {
    textStrong: "#fff9ec", text: "#f2eadc", textMuted: "#b8ab9a", app: "#111114", shell: "#17171b", stage: "#111114", stageTop: "#1d1d22", surface: "#202024", soft: "#29292f", muted: "#333139", hover: "#3b3942", border: "#4d4953", borderStrong: "#716653", brandStrong: "#f2c76b", brand: "#d9a441", brandMuted: "#a98245", brandSoft: "#3a3021", info: "#9caed1", sidebar: "#1d1b1c", sidebarTop: "#17171b", sidebarMiddle: "#1d1b1c", sidebarBottom: "#111114",
  }),
  skin("lime-minimal", "极简未来", "冷白建筑、石墨灰与钴蓝光门。", ["#f8fafc", "#334155", "#2563eb"], {
    textStrong: "#1e293b", text: "#334155", textMuted: "#64748b", app: "#f3f6fa", shell: "#eef2f7", stage: "#f3f6fa", soft: "#f1f5f9", muted: "#e2e8f0", border: "#d8e0ea", borderStrong: "#cbd5e1", brandStrong: "#334155", brand: "#2563eb", brandMuted: "#0f766e", brandSoft: "#eff6ff", info: "#0369a1", sidebar: "#f8fafc", sidebarTop: "#eef2f7", sidebarMiddle: "#f8fafc", sidebarBottom: "#ffffff",
  }, {
    app: "#111827", shell: "#172033", stage: "#111827", stageTop: "#1e293b", surface: "#1f2937", soft: "#273449", muted: "#34445d", border: "#465a75", borderStrong: "#657d9e", brandStrong: "#c4d7ff", brand: "#6e9cff", brandMuted: "#55c3c2", brandSoft: "#253554", info: "#8bc4ee", sidebar: "#172033", sidebarTop: "#1b283e", sidebarMiddle: "#172033", sidebarBottom: "#0f172a",
  }),
  skin("lime-vivid", "爆燃涂鸦", "街头动漫创作者、珊瑚红与湖蓝。", ["#fff6f3", "#f97316", "#14b8a6"], {
    textStrong: "#3c2622", text: "#54403a", textMuted: "#82716a", app: "#fff3ef", shell: "#f9e8e2", stage: "#fff5f2", soft: "#fff0ea", muted: "#f8ddd2", border: "#e9c3b6", borderStrong: "#dc9b86", brandStrong: "#c2410c", brand: "#f97316", brandMuted: "#14b8a6", brandSoft: "#fff0e8", info: "#167a9a", sidebar: "#fbeae4", sidebarTop: "#f6dfd7", sidebarMiddle: "#fceee8", sidebarBottom: "#fffaf8",
  }, {
    app: "#241516", shell: "#321c1d", stage: "#241516", stageTop: "#452324", surface: "#382123", soft: "#4a292a", muted: "#5d3030", border: "#7a4440", borderStrong: "#a96754", brandStrong: "#ffc18a", brand: "#ff9362", brandMuted: "#4dd8c2", brandSoft: "#4b2925", sidebar: "#301b1c", sidebarTop: "#3b2021", sidebarMiddle: "#301b1c", sidebarBottom: "#1e1012",
  }),
  skin("lime-literary", "清透少年", "明星定制、鼠尾草绿与自然窗光。", ["#f5f7fb", "#6e8f7a", "#b0a0da"], {
    textStrong: "#29352f", text: "#45574d", textMuted: "#74847b", app: "#f4f7f5", shell: "#ebf1ed", stage: "#f6f8f7", soft: "#f0f4f1", muted: "#e0e9e2", border: "#d1ddd4", borderStrong: "#b4c8b8", brandStrong: "#4f725e", brand: "#6e8f7a", brandMuted: "#9e8cc8", brandSoft: "#edf4ee", info: "#547da0", sidebar: "#eef3ef", sidebarTop: "#e7efea", sidebarMiddle: "#f0f5f1", sidebarBottom: "#ffffff",
  }, {
    app: "#121b18", shell: "#192722", stage: "#121b18", stageTop: "#20372e", surface: "#21352c", soft: "#2a4438", muted: "#355446", border: "#4a6b58", borderStrong: "#6c9276", brandStrong: "#b8dfc1", brand: "#81b896", brandMuted: "#b3a2e8", brandSoft: "#294434", sidebar: "#17251f", sidebarTop: "#1d3027", sidebarMiddle: "#192a22", sidebarBottom: "#0f1814",
  }),
  skin("lime-luxury", "蓝紫星夜", "星夜明星、宝石蓝与星紫银白。", ["#171a35", "#8669f6", "#65c6e8"], {
    textStrong: "#24264a", text: "#3d416f", textMuted: "#72789f", app: "#f1f2fb", shell: "#e7e8f8", stage: "#f5f5fd", soft: "#ececff", muted: "#deddf7", border: "#cac9e9", borderStrong: "#aaa8dc", brandStrong: "#5844b7", brand: "#8669f6", brandMuted: "#4db9d3", brandSoft: "#efedff", info: "#4d82c4", sidebar: "#e9e9f8", sidebarTop: "#dfdef3", sidebarMiddle: "#ececfa", sidebarBottom: "#ffffff",
  }, {
    textStrong: "#eef1ff", text: "#dfe4ff", textMuted: "#9ca8d0", app: "#0e1128", shell: "#171a35", stage: "#0e1128", stageTop: "#202654", surface: "#171a35", soft: "#222651", muted: "#2e3264", hover: "#383d77", border: "#474d8a", borderStrong: "#6368ae", brandStrong: "#b6a7ff", brand: "#8669f6", brandMuted: "#4db9d3", brandSoft: "#30265f", info: "#65c6e8", sidebar: "#1a1c3c", sidebarTop: "#151831", sidebarMiddle: "#1a1c3c", sidebarBottom: "#101329",
  }),
  skin("lime-future", "红白未来城", "红色天体、冷白城市与中国红轨道。", ["#ffffff", "#d52f3d", "#657182"], {
    textStrong: "#202329", text: "#34363d", textMuted: "#73747a", app: "#f1f2f4", shell: "#e9ebee", stage: "#f1f2f4", soft: "#f4f5f6", muted: "#e9ebee", border: "#d8dce1", borderStrong: "#c4cad1", brandStrong: "#a61924", brand: "#d52f3d", brandMuted: "#657182", brandSoft: "#fff0f1", info: "#4c6f98", sidebar: "#f7f8f9", sidebarTop: "#eceef0", sidebarMiddle: "#f7f8f9", sidebarBottom: "#ffffff",
  }, {
    app: "#15181f", shell: "#1d232c", stage: "#15181f", stageTop: "#29313d", surface: "#242a33", soft: "#303843", muted: "#3c4652", border: "#566271", borderStrong: "#7a8998", brandStrong: "#ffb5bb", brand: "#ef5e6b", brandMuted: "#91a8c4", brandSoft: "#4a252e", info: "#9dc4ed", sidebar: "#1d232c", sidebarTop: "#252d38", sidebarMiddle: "#1f2731", sidebarBottom: "#12161c",
  }),
];

export const LIME_COLOR_SCHEMES: readonly LimeColorScheme[] = SKIN_BLUEPRINTS.map(
  (blueprint) => ({
    ...blueprint,
    variables: buildVariables(blueprint.light),
    darkVariables: buildVariables(blueprint.dark),
  }),
);

const colorSchemeIds = new Set<LimeColorSchemeId>(
  LIME_COLOR_SCHEMES.map((scheme) => scheme.id),
);
const skinVariableNames = new Set(
  LIME_COLOR_SCHEMES.flatMap((scheme) => [
    ...Object.keys(scheme.variables),
    ...Object.keys(scheme.darkVariables),
  ]),
);

export function resolveLimeColorSchemeId(
  value: string | null | undefined,
): LimeColorSchemeId {
  return colorSchemeIds.has(value as LimeColorSchemeId)
    ? (value as LimeColorSchemeId)
    : DEFAULT_LIME_COLOR_SCHEME_ID;
}

export function getLimeColorScheme(
  id: string | null | undefined,
): LimeColorScheme {
  const resolvedId = resolveLimeColorSchemeId(id);
  return (
    LIME_COLOR_SCHEMES.find((scheme) => scheme.id === resolvedId) ??
    LIME_COLOR_SCHEMES[0]
  );
}

export function loadLimeColorSchemeId(): LimeColorSchemeId {
  if (typeof window === "undefined") {
    return DEFAULT_LIME_COLOR_SCHEME_ID;
  }
  return resolveLimeColorSchemeId(
    window.localStorage.getItem(LIME_COLOR_SCHEME_STORAGE_KEY),
  );
}

export function applyLimeColorScheme(
  id: string | null | undefined,
  options: { effectiveThemeMode?: LimeColorSchemeEffectiveThemeMode } = {},
): LimeColorSchemeId {
  const resolvedId = resolveLimeColorSchemeId(id);
  if (typeof document === "undefined") {
    return resolvedId;
  }

  const scheme = getLimeColorScheme(resolvedId);
  const root = document.documentElement;
  skinVariableNames.forEach((name) => root.style.removeProperty(name));
  Object.entries(scheme.variables).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });

  const effectiveThemeMode =
    options.effectiveThemeMode ??
    (root.dataset.limeThemeEffective === "dark" || root.classList.contains("dark")
      ? "dark"
      : "light");
  if (effectiveThemeMode === "dark") {
    Object.entries(scheme.darkVariables).forEach(([name, value]) => {
      root.style.setProperty(name, value);
    });
  }

  root.dataset.limeColorScheme = scheme.id;
  root.dataset.limeSkin = scheme.id;
  return scheme.id;
}

export function initializeLimeColorScheme(): LimeColorSchemeId {
  return applyLimeColorScheme(loadLimeColorSchemeId());
}

export function persistLimeColorScheme(id: string): LimeColorSchemeId {
  const resolvedId = applyLimeColorScheme(id);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LIME_COLOR_SCHEME_STORAGE_KEY, resolvedId);
    window.dispatchEvent(
      new CustomEvent<LimeColorSchemeChangedEventDetail>(
        LIME_COLOR_SCHEME_CHANGED_EVENT,
        { detail: { colorSchemeId: resolvedId } },
      ),
    );
  }
  return resolvedId;
}
