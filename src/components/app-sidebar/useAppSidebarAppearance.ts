import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LIME_COLOR_SCHEME_CHANGED_EVENT,
  LIME_COLOR_SCHEMES,
  LIME_COLOR_SCHEME_STORAGE_KEY,
  applyLimeColorScheme,
  getLimeColorScheme,
  loadLimeColorSchemeId,
  persistLimeColorScheme,
  type LimeColorSchemeChangedEventDetail,
  type LimeColorSchemeId,
} from "@/lib/appearance/colorSchemes";
import {
  LIME_THEME_CHANGED_EVENT,
  LIME_THEME_MODE_OPTIONS,
  LIME_THEME_STORAGE_KEY,
  applyLimeThemeMode,
  getEffectiveLimeThemeMode,
  loadLimeThemeMode,
  persistLimeThemeMode,
  type LimeEffectiveThemeMode,
  type LimeThemeChangedEventDetail,
  type LimeThemeMode,
} from "@/lib/appearance/themeMode";

export function useAppSidebarAppearance() {
  const { t } = useTranslation("navigation");
  const [themeState, setThemeState] = useState<{
    themeMode: LimeThemeMode;
    effectiveThemeMode: LimeEffectiveThemeMode;
  }>(() => {
    const themeMode =
      typeof window === "undefined" ? "system" : loadLimeThemeMode();
    return {
      themeMode,
      effectiveThemeMode: getEffectiveLimeThemeMode(themeMode),
    };
  });
  const [colorSchemeId, setColorSchemeId] = useState<LimeColorSchemeId>(() =>
    typeof window === "undefined" ? "lime-classic" : loadLimeColorSchemeId(),
  );
  const [appearancePopoverOpen, setAppearancePopoverOpen] = useState(false);
  const appearanceControlRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncThemeFromStorage = () => {
      const themeMode = loadLimeThemeMode();
      const effectiveThemeMode = applyLimeThemeMode(themeMode);
      setThemeState({ themeMode, effectiveThemeMode });
    };

    const syncColorSchemeFromStorage = () => {
      const nextColorSchemeId = loadLimeColorSchemeId();
      applyLimeColorScheme(nextColorSchemeId);
      setColorSchemeId(nextColorSchemeId);
    };

    const handleThemeChanged = (event: Event) => {
      const detail = (event as CustomEvent<LimeThemeChangedEventDetail>).detail;
      const themeMode = detail?.themeMode ?? loadLimeThemeMode();
      const effectiveThemeMode =
        detail?.effectiveThemeMode ?? getEffectiveLimeThemeMode(themeMode);
      setThemeState({ themeMode, effectiveThemeMode });
    };

    const handleColorSchemeChanged = (event: Event) => {
      const detail = (event as CustomEvent<LimeColorSchemeChangedEventDetail>)
        .detail;
      setColorSchemeId(detail?.colorSchemeId ?? loadLimeColorSchemeId());
    };

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === null || event.key === LIME_THEME_STORAGE_KEY) {
        syncThemeFromStorage();
      }
      if (event.key === null || event.key === LIME_COLOR_SCHEME_STORAGE_KEY) {
        syncColorSchemeFromStorage();
      }
    };

    const systemThemeQuery = window.matchMedia?.(
      "(prefers-color-scheme: dark)",
    );
    const handleSystemThemeChange = () => {
      setThemeState((current) => {
        if (current.themeMode !== "system") {
          return current;
        }

        const effectiveThemeMode = applyLimeThemeMode("system");
        return {
          themeMode: "system",
          effectiveThemeMode,
        };
      });
    };

    syncThemeFromStorage();
    syncColorSchemeFromStorage();

    window.addEventListener(LIME_THEME_CHANGED_EVENT, handleThemeChanged);
    window.addEventListener(
      LIME_COLOR_SCHEME_CHANGED_EVENT,
      handleColorSchemeChanged,
    );
    window.addEventListener("storage", handleStorageChange);
    systemThemeQuery?.addEventListener("change", handleSystemThemeChange);

    return () => {
      window.removeEventListener(LIME_THEME_CHANGED_EVENT, handleThemeChanged);
      window.removeEventListener(
        LIME_COLOR_SCHEME_CHANGED_EVENT,
        handleColorSchemeChanged,
      );
      window.removeEventListener("storage", handleStorageChange);
      systemThemeQuery?.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  useEffect(() => {
    if (!appearancePopoverOpen || typeof window === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        appearanceControlRef.current?.contains(target)
      ) {
        return;
      }

      setAppearancePopoverOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAppearancePopoverOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [appearancePopoverOpen]);

  const handleThemeModeChange = useCallback((nextThemeMode: LimeThemeMode) => {
    const themeMode = persistLimeThemeMode(nextThemeMode);
    setThemeState({
      themeMode,
      effectiveThemeMode: getEffectiveLimeThemeMode(themeMode),
    });
  }, []);

  const handleColorSchemeChange = useCallback(
    (nextColorSchemeId: LimeColorSchemeId) => {
      const resolvedColorSchemeId = persistLimeColorScheme(nextColorSchemeId);
      setColorSchemeId(resolvedColorSchemeId);
    },
    [],
  );

  const handleRandomColorScheme = useCallback(() => {
    const candidates = LIME_COLOR_SCHEMES.filter(
      (scheme) => scheme.id !== colorSchemeId,
    );
    const nextScheme =
      candidates[Math.floor(Math.random() * candidates.length)] ??
      LIME_COLOR_SCHEMES[0];
    handleColorSchemeChange(nextScheme.id);
  }, [colorSchemeId, handleColorSchemeChange]);

  const currentColorScheme = getLimeColorScheme(colorSchemeId);
  const appearanceThemeCopy = {
    light: {
      label: t("navigation.sidebar.appearance.theme.light.label", "浅色"),
      description: t(
        "navigation.sidebar.appearance.theme.light.description",
        "适合白天和高亮环境。",
      ),
    },
    dark: {
      label: t("navigation.sidebar.appearance.theme.dark.label", "深色"),
      description: t(
        "navigation.sidebar.appearance.theme.dark.description",
        "降低夜间使用时的眩光。",
      ),
    },
    system: {
      label: t("navigation.sidebar.appearance.theme.system.label", "跟随系统"),
      description: t(
        "navigation.sidebar.appearance.theme.system.description",
        "自动同步系统外观。",
      ),
    },
  } satisfies Record<LimeThemeMode, { label: string; description: string }>;
  const appearanceColorSchemeCopy = {
    "lime-classic": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeClassic.label",
        "墨绿",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeClassic.description",
        "经典深绿，温暖米色背景。",
      ),
    },
    "lime-forest": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeForest.label",
        "自然",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeForest.description",
        "舒适放松的清新自然风。",
      ),
    },
    "lime-ocean": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeOcean.label",
        "海洋",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeOcean.description",
        "沉静专业的蓝色调。",
      ),
    },
    "lime-sand": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeSand.label",
        "复古",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeSand.description",
        "温暖怀旧的琥珀色调。",
      ),
    },
    "lime-neon": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeNeon.label",
        "霓虹",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeNeon.description",
        "赛博明亮的粉紫色调。",
      ),
    },
    "lime-citron": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeCitron.label",
        "青柠",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeCitron.description",
        "活力清新的黄绿配紫。",
      ),
    },
    "lime-dusk": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeDusk.label",
        "黄昏",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeDusk.description",
        "柔和温暖的暮色调。",
      ),
    },
    "lime-minimal": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeMinimal.label",
        "极简",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeMinimal.description",
        "清晰专业的深蓝商务风。",
      ),
    },
    "lime-vivid": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeVivid.label",
        "活力",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeVivid.description",
        "时尚有冲击力的现代科技风。",
      ),
    },
    "lime-literary": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeLiterary.label",
        "文艺",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeLiterary.description",
        "宁静高雅的灰蓝文艺风。",
      ),
    },
    "lime-luxury": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeLuxury.label",
        "奢华",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeLuxury.description",
        "尊贵权威的黑金商务风。",
      ),
    },
  } satisfies Record<LimeColorSchemeId, { label: string; description: string }>;
  const appearanceThemeOptions = LIME_THEME_MODE_OPTIONS.map((option) => ({
    ...option,
    ...appearanceThemeCopy[option.id],
  }));
  const appearanceColorSchemes = LIME_COLOR_SCHEMES.map((scheme) => ({
    ...scheme,
    ...appearanceColorSchemeCopy[scheme.id],
  }));
  const currentThemeLabel =
    appearanceThemeCopy[themeState.themeMode]?.label ??
    appearanceThemeCopy.system.label;
  const currentColorSchemeLabel =
    appearanceColorSchemeCopy[currentColorScheme.id]?.label ??
    currentColorScheme.label;

  return {
    appearanceColorSchemes,
    appearanceControlRef,
    appearancePopoverOpen,
    appearanceThemeOptions,
    colorSchemeId,
    currentColorScheme,
    handleColorSchemeChange,
    handleRandomColorScheme,
    handleThemeModeChange,
    setAppearancePopoverOpen,
    themeState,
    copy: {
      colorSchemeGroupLabel: t(
        "navigation.sidebar.appearance.colorScheme.group",
        "配色",
      ),
      entryLabel: t(
        "navigation.sidebar.appearance.entry.label",
        "快速切换外观",
      ),
      formatColorSchemeSwitchAria: (colorScheme: string) =>
        t("navigation.sidebar.appearance.colorScheme.switchAria", {
          colorScheme,
          defaultValue: "切换配色为{{colorScheme}}",
        }),
      formatThemeSwitchAria: (theme: string) =>
        t("navigation.sidebar.appearance.theme.switchAria", {
          theme,
          defaultValue: "切换主题为{{theme}}",
        }),
      randomColorSchemeAriaLabel: t(
        "navigation.sidebar.appearance.colorScheme.random.ariaLabel",
        "随机切换配色",
      ),
      randomColorSchemeLabel: t(
        "navigation.sidebar.appearance.colorScheme.random.label",
        "随机",
      ),
      randomColorSchemeTitle: t(
        "navigation.sidebar.appearance.colorScheme.random.title",
        "随机切换一个颜色主题",
      ),
      summaryLabel: t("navigation.sidebar.appearance.dialog.summary", {
        theme: currentThemeLabel,
        colorScheme: currentColorSchemeLabel,
        defaultValue: "{{theme}} · {{colorScheme}}",
      }),
      themeGroupLabel: t(
        "navigation.sidebar.appearance.theme.group",
        "主题",
      ),
      titleLabel: t("navigation.sidebar.appearance.dialog.title", "外观"),
    },
  };
}
