import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface UseMessageListAutoScrollOptions {
  isRestoringSession: boolean;
  renderedMessageCount: number;
  scrollRef: RefObject<HTMLDivElement | null>;
  shouldAutoScroll: boolean;
  isUserScrolling: boolean;
}

export function useMessageListAutoScroll({
  isRestoringSession,
  isUserScrolling,
  renderedMessageCount,
  scrollRef,
  shouldAutoScroll,
}: UseMessageListAutoScrollOptions) {
  const previousVisibleMessageCountRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const previousVisibleMessageCount = previousVisibleMessageCountRef.current;
    previousVisibleMessageCountRef.current = renderedMessageCount;

    if (!shouldAutoScroll || isUserScrolling || !scrollRef.current) {
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
    isUserScrolling,
    renderedMessageCount,
    scrollRef,
    shouldAutoScroll,
  ]);
}

export function useMessageListScrollController() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

      setIsUserScrolling(true);
      setShouldAutoScroll(isAtBottom);

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setIsUserScrolling(false);
      }, 500);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  const handleStreamingOverlayUpdate = useCallback(() => {
    if (!shouldAutoScroll || isUserScrolling || !scrollRef.current) {
      return;
    }

    const scrollToTail = () => {
      scrollRef.current?.scrollIntoView({
        behavior: "auto",
        block: "end",
      });
    };

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(scrollToTail);
      return;
    }

    scrollToTail();
  }, [isUserScrolling, shouldAutoScroll]);

  return {
    containerRef,
    handleStreamingOverlayUpdate,
    isUserScrolling,
    scrollRef,
    shouldAutoScroll,
  };
}
