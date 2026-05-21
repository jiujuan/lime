import { useCallback, useEffect, useRef } from "react";
import { safeListen } from "@/lib/dev-bridge";
import { SKILL_PACKAGE_OPEN_EVENT, skillsApi } from "@/lib/api/skills";
import { hasTauriInvokeCapability } from "@/lib/tauri-runtime";
import type { Page, PageParams, SkillsPageParams } from "@/types/page";

interface UseSkillPackageOpenRequestsOptions {
  onNavigate: (page: Page, params?: PageParams) => void;
}

function basenameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

function normalizeSkillPackageOpenPayload(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function buildSkillPackageOpenPageParams(
  sourcePath: string,
  requestKey: number,
): SkillsPageParams {
  return {
    initialView: "installed",
    initialSkillPackagePath: sourcePath,
    initialSkillPackageName: basenameFromPath(sourcePath),
    initialSkillPackageRequestKey: requestKey,
  };
}

export function useSkillPackageOpenRequests({
  onNavigate,
}: UseSkillPackageOpenRequestsOptions) {
  const requestCounterRef = useRef(0);
  const lastHandledAtRef = useRef(new Map<string, number>());

  const openSkillPackage = useCallback(
    (sourcePath: string) => {
      const normalizedPath = sourcePath.trim();
      if (!normalizedPath) {
        return;
      }

      const now = Date.now();
      const lastHandledAt = lastHandledAtRef.current.get(normalizedPath) ?? 0;
      if (now - lastHandledAt < 1_000) {
        return;
      }
      lastHandledAtRef.current.set(normalizedPath, now);

      requestCounterRef.current += 1;
      onNavigate(
        "skills",
        buildSkillPackageOpenPageParams(
          normalizedPath,
          now + requestCounterRef.current,
        ),
      );
    },
    [onNavigate],
  );

  const openLatestSkillPackage = useCallback(
    (paths: string[]) => {
      const latestPath = paths.at(-1);
      if (latestPath) {
        openSkillPackage(latestPath);
      }
    },
    [openSkillPackage],
  );

  useEffect(() => {
    if (!hasTauriInvokeCapability()) {
      return;
    }

    let mounted = true;
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      try {
        unlisten = await safeListen<string[]>(
          SKILL_PACKAGE_OPEN_EVENT,
          (event) => {
            if (!mounted) {
              return;
            }
            openLatestSkillPackage(
              normalizeSkillPackageOpenPayload(event.payload),
            );
            void skillsApi
              .takePendingSkillPackageOpenRequests()
              .catch((error) => {
                console.warn(
                  "[Skill Package] 清理已处理的安装包打开请求失败",
                  error,
                );
              });
          },
        );

        const pendingPaths =
          await skillsApi.takePendingSkillPackageOpenRequests();
        if (mounted) {
          openLatestSkillPackage(pendingPaths);
        }
      } catch (error) {
        console.warn("[Skill Package] 监听安装包打开请求失败", error);
      }
    };

    void setup();

    return () => {
      mounted = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [openLatestSkillPackage]);
}
