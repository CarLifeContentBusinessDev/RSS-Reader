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
    <div className="top-bar">
      <div className="top-actions">
        {authUserEmail ? (
          <>
            <span className="user-chip">{authUserEmail}</span>
            <button
              className="ghost"
              type="button"
              onClick={onLogout}
              disabled={isAuthBusy}
            >
              {isAuthBusy ? "로그아웃 중..." : "로그아웃"}
            </button>
          </>
        ) : (
          <button className="primary" type="button" onClick={onLogin}>
            로그인
          </button>
        )}
      </div>
    </div>
  );
};

export default TopBar;
