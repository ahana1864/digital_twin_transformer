import OverviewCards from "../components/cards/OverviewCards";

/**
 * Right-hand panel of the Overview: health ring, part status and the readings cards. Always open,
 * about 40 % of the width next to the 3D view (380 to 560 px); below 1280 px wide it sits under the
 * 3D view instead.
 */
export default function Drawer() {
  return (
    <aside
      aria-label="Overview cards"
      className="relative shrink-0 border-t border-border bg-bg xl:w-[40%] xl:min-w-[380px] xl:max-w-[560px] xl:border-l xl:border-t-0"
    >
      <div id="drawer-panel" className="h-full overflow-y-auto p-3">
        <OverviewCards layout="stack" />
      </div>
    </aside>
  );
}
