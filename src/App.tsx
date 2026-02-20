import { useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { supabase } from "./lib/supabaseClient";
import EpisodesPage from "./pages/EpisodesPage";
import ProgramsPage from "./pages/ProgramsPage";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import type { ToastTone } from "./types";

const primaryButtonClass =
  "rounded-full border border-transparent bg-linear-to-br from-accent to-accent-strong px-6 py-3 font-semibold text-[#111] shadow-primary transition-transform duration-200 hover:-translate-y-0.5 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60";
const ghostButtonClass =
  "rounded-full border border-panel-border bg-transparent px-6 py-3 font-semibold text-ink transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60";
const inputClass =
  "w-full rounded-xl border border-panel-border bg-surface px-3.5 py-3 text-base text-ink focus:border-transparent focus:outline-none focus:ring-4 focus:ring-[rgba(242,201,76,0.25)]";
const labelClass = "grid gap-2 font-semibold";
const labelTextClass = "text-[0.9rem] text-ink-muted";
const errorClass =
  "rounded-[16px] border border-[rgba(255,120,120,0.4)] bg-[rgba(255,120,120,0.18)] p-4 text-[#742b2b]";

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

  const toastToneClass =
    toastTone === "success"
      ? "bg-[rgba(36,92,61,0.95)]"
      : toastTone === "error"
        ? "bg-[rgba(116,43,43,0.95)]"
        : "bg-ink";

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
      <Sidebar />

      <main className="flex flex-col gap-10 px-[clamp(1.5rem,4vw,4.5rem)] pb-16 pt-12">
        <TopBar
          authUserEmail={authUserEmail}
          isAuthBusy={isAuthBusy}
          onLogout={handleSignOut}
          onLogin={() => {
            setAuthError("");
            setShowAuthModal(true);
          }}
        />

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
            className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(9,12,12,0.5)] p-6"
            onClick={() => {
              setAuthError("");
              setShowAuthModal(false);
            }}
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
                  onClick={() => {
                    setAuthError("");
                    setShowAuthModal(false);
                  }}
                  aria-label="닫기"
                >
                  닫기
                </button>
              </div>
              {authError && (
                <div className={`${errorClass} mt-0`}>{authError}</div>
              )}
              {!authUserEmail ? (
                <div className="grid gap-4">
                  <label className={labelClass}>
                    <span className={labelTextClass}>이메일</span>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      placeholder="you@example.com"
                      className={inputClass}
                    />
                  </label>
                  <label className={labelClass}>
                    <span className={labelTextClass}>비밀번호</span>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(event) => setAuthPassword(event.target.value)}
                      placeholder="비밀번호"
                      className={inputClass}
                    />
                  </label>
                  <div className="flex justify-end">
                    <button
                      className={primaryButtonClass}
                      type="button"
                      onClick={handleSignIn}
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
                      className={ghostButtonClass}
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
          <div
            className={`fixed left-1/2 top-6 z-30 -translate-x-1/2 rounded-full px-5 py-3 text-sm font-semibold text-[#f7fbfa] shadow-toast animate-toastIn ${toastToneClass}`}
          >
            {toastMessage}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
