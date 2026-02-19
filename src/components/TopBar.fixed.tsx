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
            className="rounded-full border border-panel-border bg-transparent px-3 py-1.5 text-sm font-semibold text-ink hover:bg-panel-border/20 transition-colors"
            type="button"
            onClick={onLogout}
            disabled={isAuthBusy}
          >
            {isAuthBusy ? "로그아웃 중..." : "로그아웃"}
          </button>
        </div>
      ) : (
        <button
          className="rounded-full border border-panel-border bg-transparent px-3 py-1.5 text-sm font-semibold text-ink hover:bg-panel-border/20 transition-colors"
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
