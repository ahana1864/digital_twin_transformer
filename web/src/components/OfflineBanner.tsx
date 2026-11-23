import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCw, WifiOff } from "lucide-react";
import { useHealth } from "../api/client";

/** Red banner while GET /health fails (FRONTEND_HANDOFF §10). */
export default function OfflineBanner() {
  const health = useHealth();
  const qc = useQueryClient();
  const offline = health.isError;

  // When the backend comes back, reload whatever failed while it was down.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (wasOffline.current && !offline) {
      void qc.invalidateQueries({ predicate: (q) => q.state.status === "error" });
    }
    wasOffline.current = offline;
  }, [offline, qc]);

  if (!offline) return null;
  return (
    <div
      role="alert"
      className="flex h-banner shrink-0 items-center gap-2 bg-health-red px-4 text-xs font-medium text-panel"
    >
      <WifiOff size={14} aria-hidden />
      <span>Backend offline — start the server</span>
      <button
        type="button"
        onClick={() => void health.refetch()}
        disabled={health.isFetching}
        className="ml-2 flex items-center gap-1 rounded-control border border-panel/60 px-2 py-px font-semibold hover:bg-panel/15 disabled:opacity-70"
      >
        <RotateCw size={12} aria-hidden className={health.isFetching ? "animate-spin" : ""} />
        Retry
      </button>
    </div>
  );
}
