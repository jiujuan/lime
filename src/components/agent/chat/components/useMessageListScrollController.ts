import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 64;
const USER_SCROLL_IDLE_MS = 500;

interface UseMessageListAutoScrollOptions {
  isRestoringSession: boolean;
  renderedMessageCount: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  shouldAutoScroll: boolean;
}

export function useMessageListAutoScroll({
  isRestoringSession,
  renderedMessageCount,
  scrollRef,
  shouldAutoScroll,
}: UseMessageListAutoScrollOptions) {
  const previousVisibleMessageCountRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const previousVisibleMessageCount = previousVisibleMessageCountRef.current;
    previousVisibleMessageCountRef.current = renderedMessageCount;

    if (!shouldAutoScroll || !scrollRef.current) {
      return;
    }

    const shouldAnimateScroll =
      !isRestoringSession &&
      previousVisibleMessageCount !== null &&
      previousVisibleMessageCount > 0 &&
      renderedMessageCount <= previousVisibleMessageCount + 1;

    scrollRef.current.scrollIntoView({
      behavior: shouldAnimateScroll ? "smooth" : "auto",
      block: "end",
    });
  }, [
    isRestoringSession,
    renderedMessageCount,
    scrollRef,
    shouldAutoScroll,
  ]);
}

function isNearScrollBottom(container: HTMLDivElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = container;
  return (
    scrollHeight - scrollTop - clientHeight <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX
  );
}

export function useMessageListScrollController() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markUserScrolling = useCallback(() => {
    setIsUserScrolling(true);

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
      scrollTimeoutRef.current = null;
    }, USER_SCROLL_IDLE_MS);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      markUserScrolling();
      setShouldAutoScroll(isNearScrollBottom(container));
    };

    const handleWheel = (event: WheelEvent) => {
      markUserScrolling();

      if (event.deltaY < 0) {
        setShouldAutoScroll(false);
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("wheel", handleWheel);

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [markUserScrolling]);

  const scrollToTail = useCallback((behavior: "auto" | "smooth") => {
    scrollRef.current?.scrollIntoView({
      behavior,
      block: "end",
    });
  }, []);

  const jumpToLatest = useCallback(() => {
    setShouldAutoScroll(true);
    setIsUserScrolling(false);

    const run = () => scrollToTail("smooth");
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(run);
      return;
    }

    run();
  }, [scrollToTail]);

  const handleStreamingOverlayUpdate = useCallback(() => {
    if (!shouldAutoScroll || !scrollRef.current) {
      return;
    }

    const run = () => scrollToTail("auto");

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(run);
      return;
    }

    run();
  }, [scrollToTail, shouldAutoScroll]);

  return {
    containerRef,
    handleStreamingOverlayUpdate,
    isUserScrolling,
    jumpToLatest,
    scrollRef,
    shouldAutoScroll,
  };
}
