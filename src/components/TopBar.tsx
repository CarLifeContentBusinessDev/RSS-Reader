type TopBarProps = {
  authUserEmail: string | null;
  isAuthBusy: boolean;
  onLogout: () => void;
  onLogin: () => void;
};

function TopBar({ authUserEmail, isAuthBusy, onLogout, onLogin }: TopBarProps) {
  return (
    <header className="flex items-center justify-end py-2">
      {authUserEmail ? (
        <div className="flex items-center gap-4">
          <span className="text-ink-muted text-sm">{authUserEmail}</span>
          <button
            className="rounded-full border border-panel-border bg-transparent px-6 py-3 font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={onLogout}
            disabled={isAuthBusy}
          >
            {isAuthBusy ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      ) : (
        <button
          className="rounded-full border border-transparent bg-linear-to-br from-accent to-accent-strong px-6 py-3 font-semibold text-[#111] shadow-primary transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={onLogin}
        >
          로그인
        </button>
      )}
    </header>
  );
}

export default TopBar;
