import { Outlet } from "react-router";
import Footer from "../components/Footer";
import DemoBanner from "../components/DemoBanner";
import ModeNote from "../components/ModeNote";
import OfflineBanner from "../components/OfflineBanner";
import SimulatedBanner from "../components/SimulatedBanner";
import NavRail from "./NavRail";
import ScrubBar from "./ScrubBar";
import { useReplayClock } from "./useReplayClock";
import TopBar from "./TopBar";

// Shared shell (FRONTEND_HANDOFF §15.1): header, banners and replay controls on every page.
export default function AppShell() {
  useReplayClock();

  return (
    <div className="flex h-full min-w-[1024px] overflow-hidden">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <OfflineBanner />
        <DemoBanner />
        <SimulatedBanner />
        <ModeNote />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
        <ScrubBar />
        <Footer />
      </div>
    </div>
  );
}
