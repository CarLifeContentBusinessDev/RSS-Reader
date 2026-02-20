type AuthModalProps = {
  isOpen: boolean;
  authError: string;
  authUserEmail: string | null;
  authEmail: string;
  authPassword: string;
  isAuthBusy: boolean;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSignIn: () => void;
  onSignOut: () => void;
};

const AuthModal = ({
  isOpen,
  authError,
  authUserEmail,
  authEmail,
  authPassword,
  isAuthBusy,
  onClose,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onSignOut,
}: AuthModalProps) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(9,12,12,0.5)] p-6"
      onClick={onClose}
    >
      <div
        className="grid w-full max-w-[420px] gap-4 rounded-[20px] border border-panel-border bg-panel p-6 shadow-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4">
          <h3>Supabase 로그인</h3>
          <button
            className="rounded-full border border-panel-border bg-transparent px-3 py-1.5 text-sm font-semibold text-ink"
            type="button"
            onClick={onClose}
            aria-label="닫기"
          >
            닫기
          </button>
        </div>
        {authError && (
          <div className="rounded-[16px] border border-[rgba(255,120,120,0.4)] bg-[rgba(255,120,120,0.18)] p-4 text-[#742b2b]">
            {authError}
          </div>
        )}
        {!authUserEmail ? (
          <div className="grid gap-4">
            <label className="grid gap-2 font-semibold">
              <span className="text-[0.9rem] text-ink-muted">이메일</span>
              <input
                type="email"
                value={authEmail}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-panel-border bg-surface px-3.5 py-3 text-base text-ink focus:border-transparent focus:outline-none focus:ring-4 focus:ring-[rgba(242,201,76,0.25)]"
              />
            </label>
            <label className="grid gap-2 font-semibold">
              <span className="text-[0.9rem] text-ink-muted">비밀번호</span>
              <input
                type="password"
                value={authPassword}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="비밀번호"
                className="w-full rounded-xl border border-panel-border bg-surface px-3.5 py-3 text-base text-ink focus:border-transparent focus:outline-none focus:ring-4 focus:ring-[rgba(242,201,76,0.25)]"
              />
            </label>
            <div className="flex justify-end">
              <button
                className="rounded-full border border-transparent bg-linear-to-br from-accent to-accent-strong px-6 py-3 font-semibold text-[#111] shadow-primary transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={onSignIn}
                disabled={isAuthBusy}
              >
                {isAuthBusy ? "로그인 중..." : "로그인"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-ink-muted">로그인됨: {authUserEmail}</p>
            <div className="flex justify-end">
              <button
                className="rounded-full border border-panel-border bg-transparent px-6 py-3 font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                onClick={onSignOut}
                disabled={isAuthBusy}
              >
                {isAuthBusy ? "로그아웃 중..." : "로그아웃"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
