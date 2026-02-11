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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Supabase 로그인</h3>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="닫기"
          >
            닫기
          </button>
        </div>
        {authError && <div className="error auth-error">{authError}</div>}
        {!authUserEmail ? (
          <div className="modal-body">
            <label className="field">
              <span>이메일</span>
              <input
                type="email"
                value={authEmail}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label className="field">
              <span>비밀번호</span>
              <input
                type="password"
                value={authPassword}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="비밀번호"
              />
            </label>
            <div className="modal-actions">
              <button
                className="primary"
                type="button"
                onClick={onSignIn}
                disabled={isAuthBusy}
              >
                {isAuthBusy ? "로그인 중..." : "로그인"}
              </button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <p className="muted">로그인됨: {authUserEmail}</p>
            <div className="modal-actions">
              <button
                className="ghost"
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
