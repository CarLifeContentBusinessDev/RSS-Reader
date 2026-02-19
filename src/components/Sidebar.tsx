import { NavLink } from "react-router-dom";

const Sidebar = () => {
  return (
    <aside className="border-b border-panel-border bg-white/60 px-6 py-10 backdrop-blur-md md:sticky md:top-0 md:h-screen md:self-start md:border-b-0 md:border-r">
      <div className="grid gap-1.5 text-ink">
        <span className="mb-3 text-[0.85rem] uppercase tracking-[0.26em] text-ink-muted">
          RSS → SQL
        </span>
        <strong className="text-[1.2rem]">Builder</strong>
      </div>
      <nav className="mt-8 grid gap-2">
        <NavLink
          to="/programs"
          className={({ isActive }) =>
            `rounded-xl border px-3.5 py-2.5 font-semibold text-ink transition ${
              isActive
                ? "border-panel-border bg-surface shadow-panel"
                : "border-transparent"
            }`
          }
        >
          프로그램
        </NavLink>
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `rounded-xl border px-3.5 py-2.5 font-semibold text-ink transition ${
              isActive
                ? "border-panel-border bg-surface shadow-panel"
                : "border-transparent"
            }`
          }
        >
          에피소드
        </NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
