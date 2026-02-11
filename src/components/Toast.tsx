type ToastProps = {
  message: string;
  tone: "info" | "success" | "error";
};

const Toast = ({ message, tone }: ToastProps) => {
  return <div className={`toast ${tone}`}>{message}</div>;
};

export default Toast;
