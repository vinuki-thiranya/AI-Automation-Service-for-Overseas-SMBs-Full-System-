"use client";

import { useEffect, useId, useRef, useState } from "react";

// Same format as usd() in content/packages.ts, inlined so the package content stays out of this client bundle.
const usd = (n: number) => `USD ${n.toLocaleString("en-US")}`;

const CURRENCY: Record<string, { code: string; locale: string; defaultValue: number }> = {
  "en-au": { code: "AUD", locale: "en-AU", defaultValue: 280 },
  "en-gb": { code: "GBP", locale: "en-GB", defaultValue: 150 },
  "en-us": { code: "USD", locale: "en-US", defaultValue: 200 },
};

// Every number here is the visitor's own: no industry statistics. The defaults are a starting point
// (the AU default is the demo clinic's new-patient exam price) and the result is labelled as an estimate.
export function MissedCallsCalculator({ locale, setupUsd, carePlanUsd }: { locale: string; setupUsd: number; carePlanUsd: number }) {
  const cur = CURRENCY[locale] ?? CURRENCY["en-au"]!;
  const [missed, setMissed] = useState(10);
  const [share, setShare] = useState(30);
  const [value, setValue] = useState(cur.defaultValue);
  const ids = { missed: useId(), share: useId(), value: useId(), result: useId() };

  const patientsPerMonth = (missed * (share / 100) * 52) / 12;
  const revenuePerMonth = patientsPerMonth * value;
  const shown = useCountUp(revenuePerMonth);
  const money = (n: number) => new Intl.NumberFormat(cur.locale, { style: "currency", currency: cur.code, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="grid gap-8 rounded-2xl border border-rule bg-surface p-5 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-7">
        <Field id={ids.missed} label="Calls and messages you miss in a week" hint="Calls that ring out, voicemails, messages after close." value={missed} min={0} max={60} step={1} onChange={setMissed} />
        <Field id={ids.share} label="How many of those would have booked" hint="Your guess, as a percentage." value={share} min={0} max={100} step={5} suffix="%" onChange={setShare} />
        <Field id={ids.value} label={`What a new patient is worth to you (${cur.code})`} hint="Their first visit, or a year of visits if you prefer." value={value} min={0} max={5000} step={10} onChange={setValue} />
      </div>
      <div className="after-hours flex flex-col justify-center rounded-xl p-6" aria-labelledby={ids.result}>
        <p id={ids.result} className="text-ink-muted">Estimated revenue missed each month</p>
        <p className="font-display tabular mt-1 text-5xl font-bold tracking-[-0.03em]" aria-hidden="true">{money(shown)}</p>
        <p className="sr-only" aria-live="polite">{money(revenuePerMonth)} a month</p>
        <p className="mt-2 text-ink-muted">
          About <span className="tabular font-semibold text-ink">{patientsPerMonth.toFixed(patientsPerMonth < 10 ? 1 : 0)}</span> new patients a month.
        </p>
        <hr className="my-5 border-rule" />
        <p className="text-ink-muted">
          For comparison: the AI Receptionist is <span className="font-semibold text-ink">{usd(setupUsd)}</span> once, then a care plan from <span className="font-semibold text-ink">{usd(carePlanUsd)}</span> a month.
        </p>
        <p className="mt-3 text-sm text-ink-muted">An estimate from your numbers, not a promise. We&apos;ll check it with you on the call.</p>
      </div>
    </div>
  );
}

function Field({ id, label, hint, value, min, max, step, suffix, onChange }: {
  id: string; label: string; hint: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <label htmlFor={id} className="font-semibold">{label}</label>
        <span className="flex items-center gap-1">
          <input type="number" inputMode="numeric" aria-label={`${label}, exact value`} value={value} min={min} max={max} step={step}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
            className="tabular h-11 w-24 rounded-md border border-rule bg-paper px-2 text-right font-semibold" />
          {suffix && <span className="text-ink-muted">{suffix}</span>}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">{hint}</p>
      <input id={id} type="range" value={value} min={min} max={Math.min(max, step === 10 ? 1000 : max)} step={step}
        onChange={(e) => onChange(clamp(Number(e.target.value)))} className="range mt-3 w-full" />
    </div>
  );
}

/** Tweens to the new value in 300 ms (instantly with reduced motion), so changes are easy to follow. */
function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 300);
      const eased = 1 - (1 - t) ** 3;
      const v = begin + (target - begin) * eased;
      setShown(v);
      from.current = v;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}
