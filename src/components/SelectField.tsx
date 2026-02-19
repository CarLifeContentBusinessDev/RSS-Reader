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
};

const SelectField = ({ label, value, options, onChange }: SelectFieldProps) => {
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
    <div className="field">
      <span id={labelId}>{label}</span>
      <div className={`select ${open ? "open" : ""}`} ref={wrapperRef}>
        <button
          className="select-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={labelId}
          onClick={() => setOpen((prev) => !prev)}
        >
          <span>{selected?.label ?? value}</span>
          <span className="select-caret" aria-hidden="true" />
        </button>
        {open && (
          <div
            className="select-menu"
            role="listbox"
            onClick={() => setOpen(false)}
          >
            {options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`select-option ${isSelected ? "selected" : ""}`}
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
