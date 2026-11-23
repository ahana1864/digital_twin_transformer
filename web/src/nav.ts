import {
  Activity,
  Box,
  ClipboardCheck,
  Database,
  FileText,
  FlaskConical,
  Info,
  Layers,
  Table,
  TriangleAlert,
  Upload,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  path: string;
  label: string;
  Icon: LucideIcon;
  /** Only shown when the selected dataset is in snapshot mode (§6.9) */
  snapshotOnly?: boolean;
}

// Pages in the order of FRONTEND_HANDOFF §6.
export const NAV_ITEMS: NavItem[] = [
  { path: "/import", label: "Import", Icon: Upload },
  { path: "/data-health", label: "Data Health", Icon: ClipboardCheck },
  { path: "/", label: "Overview", Icon: Box },
  { path: "/temps", label: "Loading & Temperatures", Icon: Activity },
  { path: "/modules", label: "Failure Modules", Icon: Layers },
  { path: "/alerts", label: "Alerts & Maintenance", Icon: TriangleAlert },
  { path: "/field-data", label: "Real Field Data", Icon: Database },
  { path: "/self-test", label: "Self-Test", Icon: FlaskConical },
  { path: "/snapshot", label: "Snapshot records", Icon: Table, snapshotOnly: true },
  { path: "/reports", label: "Reports", Icon: FileText },
  { path: "/about", label: "About", Icon: Info },
];
