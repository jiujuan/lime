import { useCallback, useEffect, useRef, useState } from "react";

export type AutoDismissMessage = {
  type: "success" | "error";
  text: string;
} | null;

export function useAutoDismissMessage(timeoutMs = 3000): {
  message: AutoDismissMessage;
  showMessage: (type: "success" | "error", text: string) => void;
} {
  const [message, setMessage] = useState<AutoDismissMessage>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (timeoutRef.current === null) {
      return;
    }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  useEffect(() => clearDismissTimer, [clearDismissTimer]);

  const showMessage = useCallback(
    (type: "success" | "error", text: string) => {
      clearDismissTimer();
      setMessage({ type, text });
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setMessage(null);
      }, timeoutMs);
    },
    [clearDismissTimer, timeoutMs],
  );

  return { message, showMessage };
}
