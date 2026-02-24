export function GuidePanel({
  guide_steps,
}: {
  guide_steps: { step: string; text: string; details?: string[] }[];
}) {
  return (
    <div className="flex-1">
      <div className="bg-panel rounded-[22px] p-[1.9rem] grid gap-4 border border-panel-border shadow-panel animate-[floatIn_0.8s_ease-out]">
        {guide_steps.map(({ step, text, details }) => (
          <div key={step} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-strong text-[0.7rem] font-bold text-[#111]">
              {step}
            </span>
            <div className="grid gap-1.5">
              <p className="m-0 text-[0.85rem] leading-relaxed text-ink-muted">
                {text}
              </p>
              {details && (
                <ul className="m-0 grid gap-1 pl-0">
                  {details.map((d) => (
                    <li
                      key={d}
                      className="flex items-start gap-2 text-[0.8rem] leading-relaxed text-ink-muted/70"
                    >
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-muted/40" />
                      {d}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
