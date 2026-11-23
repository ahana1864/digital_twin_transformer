import { NavLink } from "react-router";
import { useDataset } from "../context/DatasetContext";
import { NAV_ITEMS } from "../nav";

export default function NavRail() {
  const { dataset } = useDataset();
  const items = NAV_ITEMS.filter((item) => !item.snapshotOnly || dataset?.mode === "snapshot");

  return (
    <nav
      aria-label="Pages"
      className="z-30 flex w-rail shrink-0 flex-col items-center gap-1 border-r border-border bg-panel py-2"
    >
      {items.map(({ path, label, Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === "/"}
          aria-label={label}
          className={({ isActive }) =>
            `group relative flex h-10 w-10 items-center justify-center rounded-control transition-colors duration-200 ${
              isActive ? "bg-text text-panel" : "text-muted-2 hover:bg-bg hover:text-text"
            }`
          }
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden />
          <span
            role="tooltip"
            className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-control bg-text px-2 py-1 text-xs font-medium text-panel opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {label}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
