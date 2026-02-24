import React from "react";

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

const Panel: React.FC<PanelProps> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <section
      className={`rounded-[26px] border border-panel-border bg-panel p-6 shadow-panel md:p-9 ${className}`}
      {...props}
    >
      {children}
    </section>
  );
};

export default Panel;
