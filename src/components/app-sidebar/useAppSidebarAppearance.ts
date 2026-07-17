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
    typeof window === "undefined" ? "dream-blossom" : loadLimeColorSchemeId(),
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
    "dream-blossom": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.dreamBlossom.label",
        "梦樱花境",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.dreamBlossom.description",
        "梦樱人物、粉白花幕与酒红重点色。",
      ),
    },
    "lime-classic": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeClassic.label",
        "森野秘境",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeClassic.description",
        "墨绿森林、晨雾与低干扰工作表面。",
      ),
    },
    "lime-forest": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeForest.label",
        "财神打工",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeForest.description",
        "财神程序员、朱红鎏金与轻松国潮。",
      ),
    },
    "lime-ocean": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeOcean.label",
        "奥特曼守护",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeOcean.description",
        "银红英雄、深海蓝未来城市与电光青。",
      ),
    },
    "lime-sand": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeSand.label",
        "东方国潮",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeSand.description",
        "东方人物、山河云纹与胭脂红宣纸白。",
      ),
    },
    "lime-neon": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeNeon.label",
        "初音未来",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeNeon.description",
        "青蓝歌姬、粉紫舞台与冰白表面。",
      ),
    },
    "lime-citron": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeCitron.label",
        "灵感少年",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeCitron.description",
        "ENFP 动漫少年、青柠黄与薄荷青。",
      ),
    },
    "lime-dusk": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeDusk.label",
        "黑金舞台",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeDusk.description",
        "黑金明星、唱片舞台与香槟金光线。",
      ),
    },
    "lime-minimal": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeMinimal.label",
        "极简未来",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeMinimal.description",
        "冷白建筑、石墨灰与钴蓝光门。",
      ),
    },
    "lime-vivid": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeVivid.label",
        "爆燃涂鸦",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeVivid.description",
        "街头动漫创作者、珊瑚红与湖蓝。",
      ),
    },
    "lime-literary": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeLiterary.label",
        "清透少年",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeLiterary.description",
        "明星定制、鼠尾草绿与自然窗光。",
      ),
    },
    "lime-luxury": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeLuxury.label",
        "蓝紫星夜",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeLuxury.description",
        "星夜明星、宝石蓝与星紫银白。",
      ),
    },
    "lime-future": {
      label: t(
        "navigation.sidebar.appearance.colorScheme.limeFuture.label",
        "红白未来城",
      ),
      description: t(
        "navigation.sidebar.appearance.colorScheme.limeFuture.description",
        "红色天体、冷白城市与中国红轨道。",
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
        "皮肤",
      ),
      entryLabel: t(
        "navigation.sidebar.appearance.entry.label",
        "快速切换外观",
      ),
      formatColorSchemeSwitchAria: (colorScheme: string) =>
        t("navigation.sidebar.appearance.colorScheme.switchAria", {
          colorScheme,
          defaultValue: "切换皮肤为{{colorScheme}}",
        }),
      formatThemeSwitchAria: (theme: string) =>
        t("navigation.sidebar.appearance.theme.switchAria", {
          theme,
          defaultValue: "切换主题为{{theme}}",
        }),
      randomColorSchemeAriaLabel: t(
        "navigation.sidebar.appearance.colorScheme.random.ariaLabel",
        "随机切换皮肤",
      ),
      randomColorSchemeLabel: t(
        "navigation.sidebar.appearance.colorScheme.random.label",
        "随机",
      ),
      randomColorSchemeTitle: t(
        "navigation.sidebar.appearance.colorScheme.random.title",
        "随机切换一套皮肤",
      ),
      summaryLabel: t("navigation.sidebar.appearance.dialog.summary", {
        theme: currentThemeLabel,
        colorScheme: currentColorSchemeLabel,
        defaultValue: "{{theme}} · {{colorScheme}}",
      }),
      themeGroupLabel: t("navigation.sidebar.appearance.theme.group", "主题"),
      titleLabel: t("navigation.sidebar.appearance.dialog.title", "外观"),
    },
  };
}
