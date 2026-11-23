import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Fonts are bundled locally (offline rule): no CDN, no Google Fonts.
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles/tokens.css";

import App from "./App";
import { ApiError } from "./api/client";
import PartStatusProvider from "./components/twin/PartStatusProvider";
import { DatasetProvider } from "./context/DatasetContext";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A loaded run does not change; the offline banner handles reloading after an outage.
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // Retry once on network/server errors; a 4xx will not get better.
      retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DatasetProvider>
        <PartStatusProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </PartStatusProvider>
      </DatasetProvider>
    </QueryClientProvider>
  </StrictMode>,
);
