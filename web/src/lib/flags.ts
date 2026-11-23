// DATA_INGESTION_SPEC §2.8: what each data-quality flag means. Unknown codes just show the code.
const FLAG_TEXT: Record<string, string> = {
  DUP_IDENT: "Duplicate timestamp, identical values",
  DUP_CONFLICT: "Duplicate timestamp, conflicting values",
  GAP: "Gap longer than 3 × the interval",
  JUMP_OTI: "Top-oil changed faster than is physically possible",
  JUMP_WTI: "Winding temperature changed faster than is physically possible",
  MERGE_CONFLICT: "Files disagreed when merged",
  ATI_MISMATCH: "Ambient reading differs from the weather record",
};
export const flagText = (code: string) =>
  FLAG_TEXT[code] ??
  (code.startsWith("RANGE_") ? "Value outside the physical range" : code.startsWith("STUCK_") ? "Sensor stuck while load changes" : "");
