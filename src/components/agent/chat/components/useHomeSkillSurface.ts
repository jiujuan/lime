import { useEffect, useMemo, useState } from "react";
import type { Skill } from "@/lib/api/skills";
import {
  getSkillCatalog,
  listSkillCatalogEntries,
  listSkillCatalogSceneEntries,
  subscribeSkillCatalogChanged,
  type SkillCatalogEntry,
  type SkillCatalogSceneEntry,
} from "@/lib/api/skillCatalog";
import {
  buildHomeGalleryItems,
  buildHomeGuideCards,
  buildHomeSkillItems,
  buildHomeSkillSections,
  buildHomeStarterChips,
} from "../home/buildHomeSkillSurface";
import type { HomeSurfaceCopy } from "../home/homeSurfaceCopy";
import { listFeaturedHomeServiceSkills } from "../service-skills/homeEntrySkills";
import type { ServiceSkillHomeCopy } from "../service-skills/homeCopy";
import type { ServiceSkillHomeItem } from "../service-skills/types";
import {
  listSlashEntryUsage,
  subscribeSlashEntryUsageChanged,
} from "../skill-selection/slashEntryUsage";
import type { CuratedTaskTemplateItem } from "../utils/curatedTaskTemplates";

interface UseHomeSkillSurfaceInput {
  copy: HomeSurfaceCopy;
  curatedTasks: CuratedTaskTemplateItem[];
  installedSkills?: Skill[];
  serviceSkillHomeCopy: ServiceSkillHomeCopy;
  serviceSkills?: ServiceSkillHomeItem[];
}

export function useHomeSkillSurface({
  copy,
  curatedTasks,
  installedSkills = [],
  serviceSkillHomeCopy,
  serviceSkills = [],
}: UseHomeSkillSurfaceInput) {
  const [catalogEntries, setCatalogEntries] = useState<SkillCatalogEntry[]>([]);
  const [catalogSceneEntries, setCatalogSceneEntries] = useState<
    SkillCatalogSceneEntry[]
  >([]);
  const [slashEntryUsageVersion, setSlashEntryUsageVersion] = useState(0);

  useEffect(() => {
    return subscribeSlashEntryUsageChanged(() => {
      setSlashEntryUsageVersion((previous) => previous + 1);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCatalogScenes = async () => {
      try {
        const catalog = await getSkillCatalog();
        if (cancelled) {
          return;
        }
        setCatalogEntries(
          listSkillCatalogEntries(catalog).filter((entry) =>
            (entry.surfaceScopes ?? []).includes("home"),
          ),
        );
        setCatalogSceneEntries(
          listSkillCatalogSceneEntries(catalog).filter((entry) =>
            (entry.surfaceScopes ?? []).includes("home"),
          ),
        );
      } catch {
        if (!cancelled) {
          setCatalogEntries([]);
          setCatalogSceneEntries([]);
        }
      }
    };

    void loadCatalogScenes();
    const unsubscribe = subscribeSkillCatalogChanged(() => {
      void loadCatalogScenes();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const serviceSkillItems = useMemo(
    () => listFeaturedHomeServiceSkills(serviceSkills, { limit: 6 }),
    [serviceSkills],
  );
  const starterChips = useMemo(
    () => buildHomeStarterChips(catalogEntries, copy),
    [catalogEntries, copy],
  );
  const guideCards = useMemo(
    () => buildHomeGuideCards(catalogEntries, copy),
    [catalogEntries, copy],
  );
  const skillItems = useMemo(() => {
    void slashEntryUsageVersion;
    return buildHomeSkillItems({
      catalogSceneEntries,
      curatedTasks,
      installedSkills,
      serviceSkillHomeCopy,
      serviceSkills: serviceSkillItems,
      slashEntryUsage: listSlashEntryUsage(),
    });
  }, [
    catalogSceneEntries,
    curatedTasks,
    installedSkills,
    serviceSkillHomeCopy,
    serviceSkillItems,
    slashEntryUsageVersion,
  ]);
  const skillSections = useMemo(
    () => buildHomeSkillSections(skillItems, copy),
    [copy, skillItems],
  );
  const galleryItems = useMemo(
    () => buildHomeGalleryItems(skillItems, "all"),
    [skillItems],
  );

  return {
    galleryItems,
    guideCards,
    serviceSkillItems,
    skillItems,
    skillSections,
    starterChips,
  };
}
