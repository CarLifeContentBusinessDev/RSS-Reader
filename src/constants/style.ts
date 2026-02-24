// 공통 스타일 및 상수, 타입 정의 (리팩토링용)
export const panelClass =
  "rounded-[26px] border border-panel-border bg-panel p-6 shadow-panel md:p-9";
export const formClass = "grid gap-6";
export const fieldClass = "grid gap-2 font-semibold";
export const fieldLabelClass = "text-[0.9rem] text-ink-muted";
export const inputClass =
  "w-full rounded-xl border border-panel-border bg-surface px-3.5 py-3 text-base text-ink focus:border-transparent focus:outline-none focus:ring-4 focus:ring-[rgba(242,201,76,0.25)]";
export const primaryButtonClass =
  "rounded-full border border-transparent bg-linear-to-br from-accent to-accent-strong px-6 py-3 font-semibold text-[#111] shadow-primary transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60";
export const ghostButtonClass =
  "rounded-full border border-panel-border bg-transparent px-6 py-3 font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60";
export const textButtonClass =
  "text-[0.9rem] font-semibold text-accent-strong transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";
export const linkButtonClass =
  "text-[0.9rem] font-semibold text-accent-strong transition hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";
