import { Check, CircleHelp, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { Band } from "../api/types";

export type Status = Band | "grey";

// Never colour alone (FRONTEND_HANDOFF §9, §15.4): every status carries an icon and a word.
export const STATUS_META: Record<Status, { word: string; colour: string; Icon: LucideIcon }> = {
  green: { word: "NORMAL", colour: "var(--health-green)", Icon: Check },
  yellow: { word: "WATCH", colour: "var(--health-yellow)", Icon: TriangleAlert },
  red: { word: "CRITICAL", colour: "var(--health-red)", Icon: X },
  grey: { word: "NO DATA", colour: "var(--health-grey)", Icon: CircleHelp },
};
