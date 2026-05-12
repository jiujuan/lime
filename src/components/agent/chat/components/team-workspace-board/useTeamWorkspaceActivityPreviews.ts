import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TeamWorkspaceActivityEntry } from "../../teamWorkspaceRuntime";
import {
  buildActivityPreviewCopy,
  buildSelectedSessionActivityState,
  type ActivityPreviewTranslate,
  type ActivityPreviewSession,
  type SelectedSessionActivityState,
} from "../../team-workspace-runtime/activityPreviewSelectors";
import { useTeamWorkspaceActivityPreviewSync } from "./useTeamWorkspaceActivityPreviewSync";

interface UseTeamWorkspaceActivityPreviewsParams {
  activityRefreshVersionBySessionId?: Record<string, number>;
  activityTimelineEntryLimit: number;
  basePreviewableRailSessions: ActivityPreviewSession[];
  liveActivityBySessionId?: Record<string, TeamWorkspaceActivityEntry[]>;
  pollIntervalMs?: number;
  selectedBaseSession?: ActivityPreviewSession | null;
  selectedSession?: ActivityPreviewSession | null;
}

export function useTeamWorkspaceActivityPreviews({
  activityRefreshVersionBySessionId = {},
  activityTimelineEntryLimit,
  basePreviewableRailSessions,
  liveActivityBySessionId = {},
  pollIntervalMs,
  selectedBaseSession = null,
  selectedSession = null,
}: UseTeamWorkspaceActivityPreviewsParams) {
  const { t } = useTranslation("agent");
  const translateActivityPreview = useMemo<ActivityPreviewTranslate>(
    () => (key, options) => String(t(key as never, options as never)),
    [t],
  );
  const activityPreviewCopy = useMemo(
    () =>
      buildActivityPreviewCopy({
        translate: translateActivityPreview,
      }),
    [translateActivityPreview],
  );
  const selectedSessionActivitySyncTarget =
    useMemo<SelectedSessionActivityState>(
      () =>
        buildSelectedSessionActivityState({
          copy: activityPreviewCopy,
          selectedSession,
          selectedBaseSession,
          activityRefreshVersionBySessionId,
          activityTimelineEntryLimit,
        }),
      [
        activityRefreshVersionBySessionId,
        activityTimelineEntryLimit,
        activityPreviewCopy,
        selectedBaseSession,
        selectedSession,
      ],
    );
  const { sessionActivityPreviewById } = useTeamWorkspaceActivityPreviewSync({
    activityRefreshVersionBySessionId,
    activityTimelineEntryLimit,
    basePreviewableRailSessions,
    copy: activityPreviewCopy,
    pollIntervalMs,
    selectedSessionActivityState: selectedSessionActivitySyncTarget,
  });
  const selectedSessionActivityState = useMemo<SelectedSessionActivityState>(
    () =>
      buildSelectedSessionActivityState({
        selectedSession,
        selectedBaseSession,
        liveActivityBySessionId,
        previewBySessionId: sessionActivityPreviewById,
        activityRefreshVersionBySessionId,
        activityTimelineEntryLimit,
        copy: activityPreviewCopy,
      }),
    [
      activityRefreshVersionBySessionId,
      activityTimelineEntryLimit,
      activityPreviewCopy,
      liveActivityBySessionId,
      selectedBaseSession,
      selectedSession,
      sessionActivityPreviewById,
    ],
  );

  return {
    selectedSessionActivityState,
    sessionActivityPreviewById,
  };
}
