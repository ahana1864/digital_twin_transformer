import { useEffect, useMemo } from "react";
import { Download } from "lucide-react";
import { errorDetail, useReport } from "../api/client";
import { useDataset } from "../context/DatasetContext";

const base =
  "inline-flex h-9 items-center gap-2 rounded-control border border-border px-3 text-sm font-medium";

/** GET /runs/{id}/report.pdf. While it is a stub the button is disabled and says so (§10). */
export default function DownloadReport() {
  const { run } = useDataset();
  const report = useReport(run?.dataset.id ?? null);
  const url = useMemo(() => (report.data ? URL.createObjectURL(report.data) : null), [report.data]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);

  if (url) {
    return (
      <a href={url} download={`report-${run?.dataset.id}.pdf`} className={`${base} bg-text text-panel`}>
        <Download size={16} aria-hidden />
        Download report
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled
      className={`${base} bg-panel-2 text-muted-2 disabled:cursor-not-allowed`}
      title={report.isError ? errorDetail(report.error) : "Checking whether the report is ready"}
    >
      <Download size={16} aria-hidden />
      {report.isError ? "Report: coming soon" : "Checking report…"}
    </button>
  );
}
