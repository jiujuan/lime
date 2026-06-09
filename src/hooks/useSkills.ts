import { useState, useEffect, useCallback, useRef } from "react";
import { skillsApi, Skill, SkillRepo, AppType } from "@/lib/api/skills";

/** 模块级内存缓存，跨组件挂载共享 */
interface SkillsCache {
  skills: Skill[];
  repos: SkillRepo[];
  timestamp: number;
}

const CACHE_TTL_MS = 30_000;
type SkillsCacheMode = "catalog" | "local";
type SkillsCacheKey = `${AppType}:${SkillsCacheMode}`;
const cache = new Map<SkillsCacheKey, SkillsCache>();

interface UseSkillsOptions {
  includeRepos?: boolean;
}

function buildCacheKey(app: AppType, mode: SkillsCacheMode): SkillsCacheKey {
  return `${app}:${mode}`;
}

export function useSkills(app: AppType = "lime", options?: UseSkillsOptions) {
  const includeRepos = options?.includeRepos ?? true;
  const cacheMode: SkillsCacheMode = includeRepos ? "catalog" : "local";
  const cacheKey = buildCacheKey(app, cacheMode);
  const cached = cache.get(cacheKey);
  const isCacheFresh = cached && Date.now() - cached.timestamp < CACHE_TTL_MS;

  const [skills, setSkills] = useState<Skill[]>(cached?.skills ?? []);
  const [repos, setRepos] = useState<SkillRepo[]>(cached?.repos ?? []);
  const [loading, setLoading] = useState(!isCacheFresh);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initializedRef = useRef(false);

  const updateCache = useCallback(
    (data: Skill[], reposData?: SkillRepo[]) => {
      const prev = cache.get(cacheKey);
      cache.set(cacheKey, {
        skills: data,
        repos: reposData ?? prev?.repos ?? [],
        timestamp: Date.now(),
      });
    },
    [cacheKey],
  );

  const fetchLocalSkills = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await skillsApi.getLocal(app);
      setSkills(data);
      updateCache(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [app, updateCache]);

  const fetchAllSkills = useCallback(
    async (refreshRemote = false) => {
      try {
        setLoading(true);
        setRemoteLoading(true);
        setError(null);
        const data = await skillsApi.getAll(app, { refreshRemote });
        setSkills(data);
        updateCache(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRemoteLoading(false);
        setLoading(false);
      }
    },
    [app, updateCache],
  );

  const fetchSkillsAfterLocalChange = useCallback(async () => {
    if (includeRepos) {
      await fetchAllSkills(false);
      return;
    }

    await fetchLocalSkills();
  }, [fetchAllSkills, fetchLocalSkills, includeRepos]);

  const refreshSkills = useCallback(
    async (refreshRemote = false) => {
      if (includeRepos) {
        await skillsApi.refreshCache();
        await fetchAllSkills(refreshRemote);
        return;
      }

      await fetchLocalSkills();
    },
    [fetchAllSkills, fetchLocalSkills, includeRepos],
  );

  const fetchRepos = useCallback(async () => {
    try {
      const data = await skillsApi.getRepos();
      setRepos(data);
      const prev = cache.get(cacheKey);
      if (prev) {
        prev.repos = data;
      }
    } catch (e) {
      console.error("Failed to fetch repos:", e);
    }
  }, [cacheKey]);

  useEffect(() => {
    if (initializedRef.current || isCacheFresh) {
      initializedRef.current = true;
      return;
    }
    initializedRef.current = true;

    void fetchLocalSkills();

    if (includeRepos) {
      fetchRepos();
    }
  }, [fetchLocalSkills, fetchRepos, includeRepos, isCacheFresh]);

  const install = async (directory: string) => {
    await skillsApi.install(directory, app);
    await fetchSkillsAfterLocalChange();
  };

  const uninstall = async (directory: string) => {
    await skillsApi.uninstall(directory, app);
    await fetchSkillsAfterLocalChange();
  };

  const addRepo = async (repo: SkillRepo) => {
    await skillsApi.addRepo(repo);
    await fetchRepos();
    await fetchAllSkills(true);
  };

  const removeRepo = async (owner: string, name: string) => {
    await skillsApi.removeRepo(owner, name);
    await fetchRepos();
    await fetchAllSkills(true);
  };

  return {
    skills,
    repos,
    loading,
    remoteLoading,
    error,
    refresh: async () => {
      await refreshSkills(true);
    },
    install,
    uninstall,
    addRepo,
    removeRepo,
  };
}
