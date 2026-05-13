import { useCallback, useEffect, useState } from "react";
import {
  listOfficialSkillMarketplace,
  type SkillMarketplaceItem,
} from "@/lib/api/officialSkillMarketplace";

interface UseOfficialSkillMarketplaceResult {
  skills: SkillMarketplaceItem[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useOfficialSkillMarketplace(
  enabled = true,
): UseOfficialSkillMarketplaceResult {
  const [skills, setSkills] = useState<SkillMarketplaceItem[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSkills([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const nextSkills = await listOfficialSkillMarketplace({ sort: "default" });
      setSkills(nextSkills);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { skills, isLoading, error, refresh };
}
