import type { ToastTone } from "../types";

interface UseAuthGuardOptions {
  authUserEmail: string | null;
  onRequireLogin: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
}

export function useAuthGuard({
  authUserEmail,
  onRequireLogin,
  showToast,
}: UseAuthGuardOptions) {
  const guard = (message: string, callback: () => void) => {
    if (!authUserEmail) {
      showToast(message, "error");
      onRequireLogin();
      return;
    }
    callback();
  };

  return { guard };
}
