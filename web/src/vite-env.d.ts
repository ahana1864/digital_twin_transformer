/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_USE_MOCK?: string;
  readonly VITE_TWIN_3D?: string;
}

declare module "plotly.js-basic-dist-min";

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
