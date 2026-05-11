import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BrowserProfileRecord,
  ChromeBridgeObserverSnapshot,
  ChromeBridgePageInfo,
} from "@/lib/webview-api";
import {
  type ExistingSessionTabRecord,
  getExistingSessionTabLabel,
} from "./existingSessionBridge";
import {
  type ExistingSessionAttachContext,
  listExistingSessionTabs,
  loadExistingSessionAttachContext,
  readExistingSessionPage,
  switchExistingSessionTab,
} from "./existingSessionBridgeClient";
import {
  mergeExistingSessionObserverPageInfo,
  mergeExistingSessionPageInfo,
} from "./existingSessionPageInfo";
import {
  buildExistingSessionAttachPresentation,
  type ExistingSessionAttachPresentation,
  type ExistingSessionAttachPresentationCopy,
} from "./existingSessionAttachPresentation";

type RuntimeMessage = {
  type: "success" | "error";
  text: string;
};

export type ExistingSessionAttachPanelCopy = {
  presentation: ExistingSessionAttachPresentationCopy;
  attachStatusLoadFailed: (message: string) => string;
  pageReadSuccess: string;
  pageReadFailed: (message: string) => string;
  tabsLoadFailed: (message: string) => string;
  tabSwitchSuccess: (tabLabel: string) => string;
  tabSwitchFailed: (message: string) => string;
};

type UseExistingSessionAttachPanelOptions = {
  selectedProfileKey?: string | null;
  initialProfileKey?: string;
  sessionState: unknown | null;
  copy: ExistingSessionAttachPanelCopy;
  onMessage?: (message: RuntimeMessage) => void;
};

type UseExistingSessionAttachPanelResult = {
  activeAttachProfileKey: string;
  attachProfile: BrowserProfileRecord | null;
  attachObserver: ChromeBridgeObserverSnapshot | null;
  attachContextLoading: boolean;
  attachPageLoading: boolean;
  attachTabsLoading: boolean;
  attachTabs: ExistingSessionTabRecord[];
  switchingAttachTabId: string | null;
  attachPageInfo: ChromeBridgePageInfo | null;
  shouldUseAttachPresentation: boolean;
  attachPresentation: ExistingSessionAttachPresentation;
  loadAttachContext: (options?: {
    quiet?: boolean;
  }) => Promise<ExistingSessionAttachContext | null>;
  loadAttachPage: (options?: {
    quiet?: boolean;
  }) => Promise<ChromeBridgePageInfo | null>;
  loadAttachTabs: (options?: {
    quiet?: boolean;
  }) => Promise<ExistingSessionTabRecord[]>;
  handleSwitchAttachTab: (tab: ExistingSessionTabRecord) => Promise<void>;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useExistingSessionAttachPanel(
  options: UseExistingSessionAttachPanelOptions,
): UseExistingSessionAttachPanelResult {
  const {
    selectedProfileKey,
    initialProfileKey,
    sessionState,
    copy,
    onMessage,
  } = options;
  const [attachProfile, setAttachProfile] =
    useState<BrowserProfileRecord | null>(null);
  const [attachBridgeStatus, setAttachBridgeStatus] =
    useState<ExistingSessionAttachContext["bridgeStatus"]>(null);
  const [attachContextLoading, setAttachContextLoading] = useState(false);
  const [attachPageLoading, setAttachPageLoading] = useState(false);
  const [attachTabsLoading, setAttachTabsLoading] = useState(false);
  const [attachTabs, setAttachTabs] = useState<ExistingSessionTabRecord[]>([]);
  const [attachPageInfoOverride, setAttachPageInfoOverride] =
    useState<ChromeBridgePageInfo | null>(null);
  const [switchingAttachTabId, setSwitchingAttachTabId] = useState<
    string | null
  >(null);

  const activeAttachProfileKey = selectedProfileKey || initialProfileKey || "";
  const currentAttachProfile = useMemo(
    () =>
      attachProfile?.profile_key === activeAttachProfileKey
        ? attachProfile
        : null,
    [activeAttachProfileKey, attachProfile],
  );
  const attachObserver = useMemo(
    () =>
      activeAttachProfileKey
        ? (attachBridgeStatus?.observers.find(
            (observer) => observer.profile_key === activeAttachProfileKey,
          ) ?? null)
        : null,
    [activeAttachProfileKey, attachBridgeStatus],
  );
  const isExistingSessionProfile =
    (currentAttachProfile?.transport_kind ?? "managed_cdp") ===
    "existing_session";
  const shouldShowAttachFallback =
    !sessionState &&
    Boolean(activeAttachProfileKey) &&
    (isExistingSessionProfile || Boolean(attachObserver));
  const shouldUseAttachPresentation =
    !sessionState &&
    Boolean(activeAttachProfileKey) &&
    (shouldShowAttachFallback || attachContextLoading);
  const attachPresentation = useMemo(
    () =>
      buildExistingSessionAttachPresentation(
        {
          loading: attachContextLoading,
          observerConnected: Boolean(attachObserver),
          pageLoading: attachPageLoading,
          tabsLoading: attachTabsLoading,
        },
        copy.presentation,
      ),
    [
      attachContextLoading,
      attachObserver,
      attachPageLoading,
      attachTabsLoading,
      copy.presentation,
    ],
  );
  const attachPageInfo = useMemo(
    () => attachPageInfoOverride ?? attachObserver?.last_page_info ?? null,
    [attachObserver?.last_page_info, attachPageInfoOverride],
  );

  const commitAttachPageInfo = useCallback(
    (nextPageInfo: ChromeBridgePageInfo | null) => {
      setAttachPageInfoOverride((previous) =>
        mergeExistingSessionPageInfo(previous, nextPageInfo),
      );
    },
    [],
  );

  const loadAttachContext = useCallback(
    async (contextOptions?: { quiet?: boolean }) => {
      if (!activeAttachProfileKey) {
        setAttachProfile(null);
        setAttachBridgeStatus(null);
        setAttachPageInfoOverride(null);
        return null;
      }

      setAttachContextLoading(true);
      try {
        const attachContext = await loadExistingSessionAttachContext(
          activeAttachProfileKey,
        );
        const {
          bridgeStatus,
          observer: matchedObserver,
          profile: matchedProfile,
        } = attachContext;

        setAttachProfile(matchedProfile);
        setAttachBridgeStatus(bridgeStatus);
        setAttachPageInfoOverride((previous) => {
          return mergeExistingSessionObserverPageInfo(
            previous,
            matchedObserver,
          );
        });

        return attachContext;
      } catch (error) {
        if (!contextOptions?.quiet) {
          onMessage?.({
            type: "error",
            text: copy.attachStatusLoadFailed(getErrorMessage(error)),
          });
        }
        return null;
      } finally {
        setAttachContextLoading(false);
      }
    },
    [activeAttachProfileKey, copy, onMessage],
  );

  const loadAttachPage = useCallback(
    async (pageOptions?: { quiet?: boolean }) => {
      if (!activeAttachProfileKey || !attachObserver) {
        return null;
      }

      setAttachPageLoading(true);
      try {
        const nextPageInfo = await readExistingSessionPage(
          activeAttachProfileKey,
        );
        commitAttachPageInfo(nextPageInfo);
        await loadAttachContext({ quiet: true });

        if (!pageOptions?.quiet) {
          onMessage?.({
            type: "success",
            text: copy.pageReadSuccess,
          });
        }
        return nextPageInfo;
      } catch (error) {
        if (!pageOptions?.quiet) {
          onMessage?.({
            type: "error",
            text: copy.pageReadFailed(getErrorMessage(error)),
          });
        }
        return null;
      } finally {
        setAttachPageLoading(false);
      }
    },
    [
      activeAttachProfileKey,
      attachObserver,
      commitAttachPageInfo,
      copy,
      loadAttachContext,
      onMessage,
    ],
  );

  const loadAttachTabs = useCallback(
    async (tabsOptions?: { quiet?: boolean }) => {
      if (!activeAttachProfileKey || !attachObserver) {
        return [];
      }

      setAttachTabsLoading(true);
      try {
        const nextTabs = await listExistingSessionTabs(activeAttachProfileKey);
        setAttachTabs(nextTabs);
        return nextTabs;
      } catch (error) {
        if (!tabsOptions?.quiet) {
          onMessage?.({
            type: "error",
            text: copy.tabsLoadFailed(getErrorMessage(error)),
          });
        }
        return [];
      } finally {
        setAttachTabsLoading(false);
      }
    },
    [activeAttachProfileKey, attachObserver, copy, onMessage],
  );

  const handleSwitchAttachTab = useCallback(
    async (tab: ExistingSessionTabRecord) => {
      if (!activeAttachProfileKey || !attachObserver) {
        return;
      }

      setSwitchingAttachTabId(tab.id);
      try {
        const nextPageInfo = await switchExistingSessionTab(
          activeAttachProfileKey,
          tab.id,
        );
        commitAttachPageInfo(nextPageInfo);

        await Promise.all([
          loadAttachContext({ quiet: true }),
          loadAttachTabs({ quiet: true }),
          nextPageInfo
            ? Promise.resolve(nextPageInfo)
            : loadAttachPage({ quiet: true }),
        ]);

        onMessage?.({
          type: "success",
          text: copy.tabSwitchSuccess(getExistingSessionTabLabel(tab)),
        });
      } catch (error) {
        onMessage?.({
          type: "error",
          text: copy.tabSwitchFailed(getErrorMessage(error)),
        });
      } finally {
        setSwitchingAttachTabId(null);
      }
    },
    [
      activeAttachProfileKey,
      attachObserver,
      commitAttachPageInfo,
      copy,
      loadAttachContext,
      loadAttachPage,
      loadAttachTabs,
      onMessage,
    ],
  );

  useEffect(() => {
    setAttachTabs([]);
    setAttachPageInfoOverride(null);
  }, [activeAttachProfileKey]);

  useEffect(() => {
    if (sessionState || !activeAttachProfileKey) {
      return;
    }
    void loadAttachContext({ quiet: true });
  }, [activeAttachProfileKey, loadAttachContext, sessionState]);

  return {
    activeAttachProfileKey,
    attachProfile: currentAttachProfile,
    attachObserver,
    attachContextLoading,
    attachPageLoading,
    attachTabsLoading,
    attachTabs,
    switchingAttachTabId,
    attachPageInfo,
    shouldUseAttachPresentation,
    attachPresentation,
    loadAttachContext,
    loadAttachPage,
    loadAttachTabs,
    handleSwitchAttachTab,
  };
}
