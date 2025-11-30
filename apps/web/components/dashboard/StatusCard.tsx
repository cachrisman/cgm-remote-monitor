interface StatusCardProps {
  title: string;
  value: string;
  description?: string;
  tone?: "default" | "success" | "warning" | "danger";
}

const toneStyles: Record<NonNullable<StatusCardProps["tone"]>, string> = {
  default: "bg-slate-900 border-slate-800 text-slate-100",
  success: "bg-emerald-900/40 border-emerald-600/40 text-emerald-200",
  warning: "bg-amber-900/40 border-amber-600/40 text-amber-100",
  danger: "bg-rose-900/40 border-rose-600/40 text-rose-100"
};

export function StatusCard({
  title,
  value,
  description,
  tone = "default"
}: StatusCardProps) {
  return (
    <section
      className={`flex flex-col gap-2 rounded-2xl border p-5 shadow-sm transition-colors ${toneStyles[tone]}`}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h2>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      {description ? (
        <p className="text-sm text-slate-400">{description}</p>
      ) : null}
    </section>
  );
}
