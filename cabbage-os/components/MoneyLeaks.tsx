import Link from "next/link";
import type { Leak } from "@/lib/pnl";
import { AlertIcon, ArrowIcon, IdleIcon, WrenchIcon } from "./icons";

const TONE = {
  critical: { ring: "ring-state-bad/30", bg: "bg-state-bad/10", text: "text-state-bad", Icon: AlertIcon, word: "Critical" },
  serious: { ring: "ring-state-warn/30", bg: "bg-state-warn/10", text: "text-state-warn", Icon: WrenchIcon, word: "Serious" },
  warning: { ring: "ring-state-info/30", bg: "bg-state-info/10", text: "text-state-info", Icon: IdleIcon, word: "Watch" },
} as const;

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(n));

/**
 * Every row is denominated in dollars and links to the rows that prove it.
 * An "insight" you can't act on is decoration.
 */
export default function MoneyLeaks({ leaks }: { leaks: Leak[] }) {
  if (!leaks.length) {
    return (
      <p className="px-5 py-8 text-center text-sm text-ink-mute">
        Nothing bleeding this period. Every vehicle is above water.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {leaks.map((leak) => {
        const t = TONE[leak.severity];
        return (
          <li key={leak.id}>
            <Link
              href={leak.href}
              className="group flex gap-3 px-5 py-4 transition-colors hover:bg-raised/60"
            >
              <span
                className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${t.bg} ${t.ring} ${t.text}`}
              >
                <t.Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-ink">{leak.title}</span>
                  <span className={`num shrink-0 text-sm font-semibold ${t.text}`}>
                    {leak.amount < 0 ? "−" : "+"}
                    {usd(leak.amount)}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-soft">
                  {leak.detail}
                </span>
                <span className="mt-2 inline-flex items-center gap-1.5 text-2xs font-medium text-brand">
                  {leak.cta}
                  <ArrowIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
