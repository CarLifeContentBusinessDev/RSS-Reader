import { useEffect, useId, useRef, useState } from "react";

type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
};

const SelectField = ({
  label,
  value,
  options,
  onChange,
  className,
}: SelectFieldProps) => {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected =
    options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className={`grid gap-2 font-semibold ${className ?? ""}`}>
      <span id={labelId} className="text-[0.9rem] text-ink-muted">
        {label}
      </span>
      <div className="relative" ref={wrapperRef}>
        <button
          className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-surface px-3.5 py-3 text-base font-semibold text-ink transition focus:border-transparent focus:outline-none focus:ring-4 focus:ring-[rgba(242,201,76,0.25)] ${
            open ? "border-transparent" : "border-panel-border"
          }`}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={labelId}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span>{selected?.label ?? value}</span>
          <span
            className={`h-0 w-0 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent border-t-ink-muted transition-transform ${
              open ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
        {open && (
          <div
            className="absolute left-0 top-[calc(100%+0.6rem)] z-20 grid w-full gap-1 rounded-[14px] border border-panel-border bg-surface p-1.5 shadow-panel max-h-[260px] overflow-y-auto"
            role="listbox"
            onClick={() => setOpen(false)}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`w-full rounded-xl px-3.5 py-2.5 text-left font-semibold ${
                    isSelected
                      ? "bg-accent text-[#111]"
                      : "text-ink hover:bg-[#f6f4ef]"
                  }`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SelectField;
