import { NavLink } from "react-router-dom";

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
        <div className="mt-auto grid gap-2 pt-8">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">
            바로가기
          </span>
          <a
            className="text-sm font-semibold text-accent-strong transition hover:text-accent "
            href="https://bigconvert.11zon.com/ko/png-to-webp"
            target="_blank"
            rel="noreferrer"
          >
            webp 변환
          </a>
          <a
            className="text-sm font-semibold text-accent-strong transition hover:text-accent "
            href="https://imagecompressor.11zon.com/ko/compress-webp"
            target="_blank"
            rel="noreferrer"
          >
            webp 압축
          </a>
          <a
            className="text-sm font-semibold text-accent-strong transition hover:text-accent "
            href="https://freecompress.com/ko/compress-mp3"
            target="_blank"
            rel="noreferrer"
          >
            mp3 압축
          </a>
          <a
            className="text-sm font-semibold text-accent-strong transition hover:text-accent "
            href="https://dash.cloudflare.com/194031f1919f524b4ecbf1ad3c5f60f9/r2/default/buckets/pickle-demo"
            target="_blank"
            rel="noreferrer"
          >
            R2 object storage
          </a>
          <a
            className="text-sm font-semibold text-accent-strong transition hover:text-accent "
            href="https://supabase.com/dashboard/project/newreozzmyijevbnjwul"
            target="_blank"
            rel="noreferrer"
          >
            Supabase
          </a>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
