/**
 * The 3D twin is the Overview's centrepiece, but it can be cut (FRONTEND_HANDOFF §12, §16.3):
 * `VITE_TWIN_3D=false` renders the fallback layout, with the four cards in a row above the chart.
 */
export const TWIN_3D: boolean = import.meta.env.VITE_TWIN_3D !== "false";
