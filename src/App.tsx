import { useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import { supabase } from "./lib/supabaseClient";
import EpisodesPage from "./pages/EpisodesPage";
import ProgramsPage from "./pages/ProgramsPage";
import Sidebar from "./components/Sidebar";
import type { ToastTone } from "./types";

function App() {
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [isAuthBusy, setIsAuthBusy] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastTone, setToastTone] = useState<ToastTone>("info");
  const toastTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) return;
      if (!isMounted) return;
      setAuthUserEmail(data.session?.user.email ?? null);
    };

    loadSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        setAuthUserEmail(session?.user.email ?? null);
      },
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const showToast = (message: string, tone: ToastTone = "info") => {
    setToastMessage(message);
    setToastTone(tone);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage("");
    }, 2200);
  };

  const handleSignIn = async () => {
    if (!authEmail || !authPassword) {
      setAuthError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    setAuthError("");
    setIsAuthBusy(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      setAuthPassword("");
      setShowAuthModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setAuthError(`로그인 실패 : ${message}`);
    } finally {
      setIsAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError("");
    setIsAuthBusy(true);

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setShowAuthModal(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      setAuthError(`로그아웃 실패: ${message}`);
    } finally {
      setIsAuthBusy(false);
    }
  };

  return (
    <div className="shell">
      <Sidebar />

      <main className="app">
        <div className="top-bar">
          <div className="top-actions">
            {authUserEmail ? (
              <>
                <span className="user-chip">{authUserEmail}</span>
                <button
                  className="ghost"
                  type="button"
                  onClick={handleSignOut}
                  disabled={isAuthBusy}
                >
                  {isAuthBusy ? "로그아웃 중..." : "로그아웃"}
                </button>
              </>
            ) : (
              <button
                className="primary"
                type="button"
                onClick={() => {
                  setAuthError("");
                  setShowAuthModal(true);
                }}
              >
                로그인
              </button>
            )}
          </div>
        </div>

        <Routes>
          <Route
            path="/"
            element={
              <EpisodesPage
                authUserEmail={authUserEmail}
                onRequireLogin={() => {
                  setAuthError("");
                  setShowAuthModal(true);
                }}
                showToast={showToast}
                status=""
                setStatus={() => {}}
              />
            }
          />
          <Route
            path="/programs"
            element={
              <ProgramsPage
                authUserEmail={authUserEmail}
                onRequireLogin={() => {
                  setAuthError("");
                  setShowAuthModal(true);
                }}
                showToast={showToast}
              />
            }
          />
        </Routes>

        {showAuthModal && (
          <div
            className="modal-backdrop"
            onClick={() => {
              setAuthError("");
              setShowAuthModal(false);
            }}
          >
            <div
              className="modal-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Supabase 로그인</h3>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    setAuthError("");
                    setShowAuthModal(false);
                  }}
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
                      onChange={(event) => setAuthEmail(event.target.value)}
                      placeholder="you@example.com"
                    />
                  </label>
                  <label className="field">
                    <span>비밀번호</span>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      placeholder="비밀번호"
                    />
                  </label>
                  <div className="modal-actions">
                    <button
                      className="primary"
                      type="button"
                      onClick={handleSignIn}
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
                      onClick={handleSignOut}
                      disabled={isAuthBusy}
                    >
                      {isAuthBusy ? "로그아웃 중..." : "로그아웃"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {toastMessage && (
          <div className={`toast ${toastTone}`}>{toastMessage}</div>
        )}
      </main>
    </div>
  );
}

export default App;
