type TopBarProps = {
  authUserEmail: string | null;
  isAuthBusy: boolean;
  onLogout: () => void;
  onLogin: () => void;
};

const TopBar = ({
  authUserEmail,
  isAuthBusy,
  onLogout,
  onLogin,
}: TopBarProps) => {
  return (
    <div className="flex justify-end">
      <div className="flex items-center gap-3">
        {authUserEmail ? (
          <>
            <span className="rounded-full border border-panel-border bg-surface px-3 py-1.5 text-[0.85rem] text-ink-muted">
              {authUserEmail}
            </span>
            <button
              className="rounded-full border border-panel-border bg-transparent px-6 py-3 font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={onLogout}
              disabled={isAuthBusy}
            >
              {isAuthBusy ? "로그아웃 중..." : "로그아웃"}
            </button>
          </>
        ) : (
          <button
            className="rounded-full border border-transparent bg-gradient-to-br from-accent to-accent-strong px-6 py-3 font-semibold text-[#111] shadow-primary transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01]"
            type="button"
            onClick={onLogin}
          >
            로그인
          </button>
        )}
      </div>
    </div>
  );
};

export default TopBar;
