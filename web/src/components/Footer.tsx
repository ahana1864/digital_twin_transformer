import { USE_MOCK } from "../api/client";

export default function Footer() {
  return (
    <footer className="flex h-footer shrink-0 items-center justify-between gap-4 border-t border-border bg-bg px-4 text-[11px] text-muted-2">
      <span className="truncate">3D model: Showdoze (Sketchfab), CC-BY-NC 4.0</span>
      {USE_MOCK && (
        <span className="shrink-0 font-semibold tracking-wide" title="VITE_USE_MOCK=true: values come from the frontend mock, not the server">
          MOCK BACKEND
        </span>
      )}
    </footer>
  );
}
