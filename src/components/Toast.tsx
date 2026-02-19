type ToastProps = {
  message: string;
  tone: "info" | "success" | "error";
};

const Toast = ({ message, tone }: ToastProps) => {
  const toneClass =
    tone === "success"
      ? "bg-[rgba(36,92,61,0.95)]"
      : tone === "error"
        ? "bg-[rgba(116,43,43,0.95)]"
        : "bg-ink";

  return (
    <div
      className={`fixed left-1/2 top-6 z-30 -translate-x-1/2 rounded-full px-5 py-3 text-sm font-semibold text-[#f7fbfa] shadow-toast animate-toastIn ${toneClass}`}
    >
      {message}
    </div>
  );
};

export default Toast;
