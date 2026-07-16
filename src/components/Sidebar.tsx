import { NavLink } from "react-router-dom";

const MENU_LINK = [
  { name: "프로그램", href: "/" },
  { name: "에피소드", href: "/episodes" },
  { name: "프로그램 일괄 추가", href: "/programs-bulk" },
  { name: "에피소드 일괄 추가", href: "/episodes-bulk" },
  { name: "오디오파일 재매핑", href: "/audio-remapping" },
  { name: "오디오파일 변환", href: "/audio-convert" },
  { name: "카테고리 매핑 수정", href: "/categories-remapping" },
  { name: "프로그램 언어 매핑", href: "/language-mapping" },
];

const NAV_LINK = [
  {
    name: "Supabase",
    href: "https://supabase.com/dashboard/project/newreozzmyijevbnjwul",
  },
  {
    name: "R2 object storage",
    href: "https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo",
  },
];

const Sidebar = () => {
  return (
    <aside className="border-b border-panel-border bg-white/60 px-6 py-10 backdrop-blur-md md:sticky md:top-0 md:h-screen md:self-start md:border-b-0 md:border-r">
      <div className="flex h-full flex-col">
        <div className="grid gap-1.5 text-ink">
          <span className="mb-3 text-[0.85rem] uppercase tracking-[0.26em] text-ink-muted">
            RSS → SQL
          </span>
          <strong className="text-[1.2rem]">Builder</strong>
        </div>
        <nav className="mt-8 grid gap-2">
          {MENU_LINK.map(({ name, href }) => (
            <NavLink
              key={href}
              to={href}
              className={({ isActive }) =>
                `rounded-xl border px-3.5 py-2.5 font-semibold text-ink transition ${
                  isActive
                    ? "border-panel-border bg-surface shadow-panel"
                    : "border-transparent"
                }`
              }
            >
              {name}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto grid gap-2 pt-8">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
            바로가기
          </span>
          {NAV_LINK.map(({ name, href }) => (
            <a
              key={href}
              className="text-sm font-semibold text-accent-strong transition hover:text-accent "
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {name}{" "}
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
