import Link from "next/link";

const OPTIONS = [7, 30, 90];

export default function PeriodTabs({ days, base = "/" }: { days: number; base?: string }) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
      {OPTIONS.map((d) => (
        <Link
          key={d}
          href={`${base}?days=${d}`}
          scroll={false}
          className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
            d === days
              ? "bg-brand/15 font-medium text-brand"
              : "text-ink-soft hover:text-ink"
          }`}
        >
          {d} days
        </Link>
      ))}
    </div>
  );
}

export function readDays(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return OPTIONS.includes(n) ? n : 30;
}
