export type ExistingSessionAttachStatusInfo = {
  label: string;
  toneClass: string;
  description: string;
};

export type ExistingSessionAttachPresentation = {
  observerConnected: boolean;
  statusInfo: ExistingSessionAttachStatusInfo;
  placeholder: string;
  embeddedActionLabel: string;
  contextActionLabel: string;
  pageActionLabel: string;
  tabsActionLabel: string;
  embeddedControlHint: string;
  liveViewHint: string;
};

export type ExistingSessionAttachPresentationCopy = {
  status: {
    checking: Omit<ExistingSessionAttachStatusInfo, "toneClass">;
    waiting: Omit<ExistingSessionAttachStatusInfo, "toneClass">;
    reading: Omit<ExistingSessionAttachStatusInfo, "toneClass">;
    attached: Omit<ExistingSessionAttachStatusInfo, "toneClass">;
  };
  placeholder: {
    default: string;
    checking: string;
    waiting: string;
    reading: string;
  };
  actions: {
    reading: string;
    checking: string;
    readPage: string;
    refreshBridge: string;
    refreshing: string;
    refreshBridgeStatus: string;
    readCurrentPage: string;
    readTabs: string;
  };
  hint: {
    embedded: {
      connected: string;
      waiting: string;
    };
    live: {
      connected: string;
      waiting: string;
    };
  };
};

export function buildExistingSessionAttachPresentation(
  params: {
    loading: boolean;
    observerConnected: boolean;
    pageLoading: boolean;
    tabsLoading: boolean;
  },
  copy: ExistingSessionAttachPresentationCopy,
): ExistingSessionAttachPresentation {
  const { loading, observerConnected, pageLoading, tabsLoading } = params;

  let statusInfo: ExistingSessionAttachStatusInfo;
  if (loading) {
    statusInfo = {
      ...copy.status.checking,
      toneClass:
        "border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-200",
    };
  } else if (!observerConnected) {
    statusInfo = {
      ...copy.status.waiting,
      toneClass:
        "border-orange-300/70 bg-orange-50 text-orange-800 dark:border-orange-800/70 dark:bg-orange-950/30 dark:text-orange-200",
    };
  } else if (pageLoading) {
    statusInfo = {
      ...copy.status.reading,
      toneClass:
        "border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-800/70 dark:bg-sky-950/30 dark:text-sky-200",
    };
  } else {
    statusInfo = {
      ...copy.status.attached,
      toneClass:
        "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200",
    };
  }

  let placeholder = copy.placeholder.default;
  if (loading) {
    placeholder = copy.placeholder.checking;
  } else if (!observerConnected) {
    placeholder = copy.placeholder.waiting;
  } else if (pageLoading) {
    placeholder = copy.placeholder.reading;
  }

  return {
    observerConnected,
    statusInfo,
    placeholder,
    embeddedActionLabel: pageLoading
      ? copy.actions.reading
      : loading
        ? copy.actions.checking
        : observerConnected
          ? copy.actions.readPage
          : copy.actions.refreshBridge,
    contextActionLabel: loading
      ? copy.actions.refreshing
      : copy.actions.refreshBridgeStatus,
    pageActionLabel: pageLoading
      ? copy.actions.refreshing
      : copy.actions.readCurrentPage,
    tabsActionLabel: tabsLoading
      ? copy.actions.refreshing
      : copy.actions.readTabs,
    embeddedControlHint: observerConnected
      ? copy.hint.embedded.connected
      : copy.hint.embedded.waiting,
    liveViewHint: observerConnected
      ? copy.hint.live.connected
      : copy.hint.live.waiting,
  };
}
