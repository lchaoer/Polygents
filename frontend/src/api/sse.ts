import { useEffect, useRef } from "react";
import type { RunEvent } from "../types";

export function useRunEvents(runId: string | undefined, onEvent: (e: RunEvent) => void) {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!runId) return;
    let es: EventSource | null = null;
    let closed = false;

    const open = () => {
      if (closed || es) return;
      const src = new EventSource(`/api/runs/${runId}/events`);
      es = src;
      src.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data && typeof data === "object" && "type" in data) {
            onEventRef.current(data as RunEvent);
          }
        } catch {
          // ignore
        }
      };
      src.addEventListener("end", () => {
        src.close();
        if (es === src) es = null;
      });
      src.onerror = () => {
        // Browser auto-reconnects EventSource; explicit close on hidden
        // pages is handled by visibilitychange below.
      };
    };

    const close = () => {
      if (es) {
        es.close();
        es = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        // Force a fresh connection on visibility return — recovers from
        // long-paused or stale sockets.
        close();
        open();
      } else {
        close();
      }
    };

    open();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      close();
    };
  }, [runId]);
}
