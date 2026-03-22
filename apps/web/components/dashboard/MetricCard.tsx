import clsx from "clsx";
import type { ReactNode } from "react";

const toneStyles = {
  default: "bg-slate-900/60 border-slate-800",
  success: "bg-emerald-900/30 border-emerald-800/60",
  warning: "bg-amber-900/30 border-amber-800/60",
  danger: "bg-rose-900/30 border-rose-800/60"
};

type Tone = keyof typeof toneStyles;

type MetricCardProps = {
  title: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  tone?: Tone;
};

export function MetricCard({
  title,
  value,
  description,
  icon,
  tone = "default"
}: MetricCardProps) {
  return (
    <article
      className={clsx(
        "flex flex-col gap-2 rounded-2xl border p-5 shadow-lg",
        toneStyles[tone]
      )}
    >
      <div className="flex items-center gap-3 text-sm font-medium text-slate-300">
        {icon ? <span className="text-lg text-white" aria-hidden>{icon}</span> : null}
        <span className="uppercase tracking-[0.18em] text-xs text-slate-400">{title}</span>
      </div>
      <div className="text-3xl font-semibold text-white sm:text-4xl">{value}</div>
      {description ? (
        <p className="text-sm text-slate-400">{description}</p>
      ) : null}
    </article>
  );
}
