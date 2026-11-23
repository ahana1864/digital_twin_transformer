import type {
  DatasetListItem,
  HealthCheck,
  ImportLoadRequest,
  ImportLoadResponse,
  InspectProposal,
  Run,
  RunParams,
  RunState,
  SelfTest,
  SendAlertResponse,
  SnapshotRecord,
} from "./types";

/** HTTP 4xx/5xx with `{ detail }` (FRONTEND_HANDOFF §4). Show `detail` to the user. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** One method per endpoint in FRONTEND_HANDOFF §4. Implemented by the real client and the mock. */
export interface Backend {
  health(): Promise<HealthCheck>;
  datasets(): Promise<DatasetListItem[]>;
  importInspect(files: File[]): Promise<InspectProposal>;
  importLoad(req: ImportLoadRequest): Promise<ImportLoadResponse>;
  run(id: string, params?: RunParams): Promise<Run>;
  runState(id: string, t: string): Promise<RunState>;
  snapshotTable(id: string): Promise<SnapshotRecord[]>;
  reportPdf(id: string): Promise<Blob>;
  selfTest(): Promise<SelfTest>;
  sendAlert(body: { dataset_id?: string; message?: string }): Promise<SendAlertResponse>;
}
