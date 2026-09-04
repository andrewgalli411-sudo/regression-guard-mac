import Link from "next/link";
import type { ReactNode } from "react";
import type { VehicleStatus } from "@/lib/types";
import { ArrowIcon } from "./icons";

export function Card({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-surface ${className}`}
      style={{ background: "var(--surface-1)" }}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-mute">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
  hero = false,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: "neutral" | "good" | "bad";
  hero?: boolean;
}) {
  const toneClass =
    tone === "good" ? "text-state-good" : tone === "bad" ? "text-state-bad" : "text-ink";
  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        hero ? "border-brand/30 bg-brand/[0.06]" : "border-line"
      }`}
      style={hero ? undefined : { background: "var(--surface-1)" }}
    >
      <p className="text-2xs uppercase tracking-[0.11em] text-ink-mute">{label}</p>
      <p
        className={`num mt-2 font-semibold ${toneClass} ${
          hero ? "text-[34px] leading-9" : "text-[26px] leading-8"
        }`}
      >
        {value}
      </p>
      {sub && <div className="mt-1.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}

export function Delta({ value, suffix = "vs prior period" }: { value: number; suffix?: string }) {
  const up = value >= 0;
  return (
    <span className={up ? "text-state-good" : "text-state-bad"}>
      <span className="num">
        {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
      </span>{" "}
      <span className="text-ink-mute">{suffix}</span>
    </span>
  );
}

const STATUS: Record<VehicleStatus, { label: string; dot: string; text: string; glyph: string }> = {
  earning: { label: "Earning", dot: "bg-state-good", text: "text-state-good", glyph: "●" },
  idle: { label: "Idle", dot: "bg-state-info", text: "text-state-info", glyph: "◐" },
  charging: { label: "Charging", dot: "bg-state-warn", text: "text-state-warn", glyph: "◆" },
  shop: { label: "In shop", dot: "bg-state-bad", text: "text-state-bad", glyph: "▲" },
};

export function StatusPill({ status }: { status: VehicleStatus }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2 py-0.5 text-2xs">
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      <span className={s.text}>{s.label}</span>
    </span>
  );
}

export const statusMeta = STATUS;

export function Money({
  value,
  className = "",
  signed = false,
}: {
  value: number;
  className?: string;
  signed?: boolean;
}) {
  const neg = value < 0;
  const text = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  return (
    <span className={`num ${className}`}>
      {neg ? "−" : signed ? "+" : ""}
      {text}
    </span>
  );
}

export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-brand hover:underline"
    >
      {children}
      <ArrowIcon className="h-3.5 w-3.5" />
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
      </div>
      {right}
    </header>
  );
}
