"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface Point {
  date: string;
  revenue: number;
  cost: number;
}

const PAD = { top: 18, right: 62, bottom: 26, left: 52 };

const usd = (n: number, cents = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(n);

const shortUsd = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${Math.round(n)}`);

const label = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/**
 * Revenue vs cost on one shared dollar axis — never a second y-scale.
 * Cost is dashed as well as differently hued so the two series stay separable
 * for red/green-blind readers and in print.
 */
export default function TimeSeries({
  data,
  height = 260,
  revenueLabel = "Owner revenue",
  costLabel = "Operating cost",
}: {
  data: Point[];
  height?: number;
  revenueLabel?: string;
  costLabel?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(760);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const geom = useMemo(() => {
    const innerW = Math.max(240, width - PAD.left - PAD.right);
    const innerH = height - PAD.top - PAD.bottom;
    const max = Math.max(...data.flatMap((d) => [d.revenue, d.cost]), 1);
    // A fixed $500 step flattens a single vehicle's chart to a line on the floor.
    const mag = Math.pow(10, Math.floor(Math.log10(max)));
    const top = ([1, 1.5, 2, 2.5, 3, 4, 5, 7.5].find((m) => max <= m * mag) ?? 10) * mag;
    const x = (i: number) => PAD.left + (i / Math.max(1, data.length - 1)) * innerW;
    const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
    const line = (key: "revenue" | "cost") =>
      data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join(" ");
    const area =
      data.length > 1
        ? `${line("revenue")} L${x(data.length - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`
        : "";
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: top * f, y: y(top * f) }));
    const xTicks = data
      .map((d, i) => ({ i, d }))
      .filter((_, i) => i % Math.max(1, Math.round(data.length / 6)) === 0);
    return { innerW, innerH, top, x, y, line, area, ticks, xTicks };
  }, [data, width, height]);

  const last = data[data.length - 1];
  const idx = hover ?? data.length - 1;
  const active = data[idx];

  // Keep the two end labels from printing on top of each other.
  let revLabelY = geom.y(last.revenue);
  let costLabelY = geom.y(last.cost);
  if (Math.abs(revLabelY - costLabelY) < 13) {
    const mid = (revLabelY + costLabelY) / 2;
    const above = last.revenue >= last.cost;
    revLabelY = above ? mid - 7 : mid + 7;
    costLabelY = above ? mid + 7 : mid - 7;
  }

  return (
    <div ref={wrap} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`${revenueLabel} and ${costLabel} per day`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const rel = e.clientX - rect.left - PAD.left;
          const i = Math.round((rel / geom.innerW) * (data.length - 1));
          setHover(Math.min(data.length - 1, Math.max(0, i)));
        }}
      >
        {geom.ticks.map((t) => (
          <g key={t.v}>
            <line
              x1={PAD.left}
              x2={PAD.left + geom.innerW}
              y1={t.y}
              y2={t.y}
              stroke="var(--grid)"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 10}
              y={t.y + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--text-muted)"
              className="num"
            >
              {shortUsd(t.v)}
            </text>
          </g>
        ))}

        {geom.xTicks.map(({ i, d }) => (
          <text
            key={d.date}
            x={geom.x(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize="11"
            fill="var(--text-muted)"
          >
            {label(d.date)}
          </text>
        ))}

        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-revenue)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--series-revenue)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <path d={geom.area} fill="url(#revFill)" />
        <path
          d={geom.line("revenue")}
          fill="none"
          stroke="var(--series-revenue)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={geom.line("cost")}
          fill="none"
          stroke="var(--series-cost)"
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Direct labels at the series ends — identity is never color-alone. */}
        <text
          x={PAD.left + geom.innerW + 8}
          y={revLabelY + 4}
          fontSize="11"
          fill="var(--series-revenue)"
          className="num"
        >
          {shortUsd(last.revenue)}
        </text>
        <text
          x={PAD.left + geom.innerW + 8}
          y={costLabelY + 4}
          fontSize="11"
          fill="var(--series-cost)"
          className="num"
        >
          {shortUsd(last.cost)}
        </text>

        {hover !== null && (
          <g>
            <line
              x1={geom.x(idx)}
              x2={geom.x(idx)}
              y1={PAD.top}
              y2={PAD.top + geom.innerH}
              stroke="var(--text-muted)"
              strokeWidth="1"
            />
            <circle
              cx={geom.x(idx)}
              cy={geom.y(active.revenue)}
              r="4.5"
              fill="var(--series-revenue)"
              stroke="var(--surface-1)"
              strokeWidth="2"
            />
            <circle
              cx={geom.x(idx)}
              cy={geom.y(active.cost)}
              r="4.5"
              fill="var(--series-cost)"
              stroke="var(--surface-1)"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute z-10 min-w-[168px] rounded-lg border border-line bg-raised px-3 py-2 text-xs shadow-xl"
          style={{
            left: Math.min(Math.max(geom.x(idx) - 84, 0), Math.max(0, width - 176)),
            top: 4,
          }}
        >
          <p className="mb-1.5 font-medium text-ink">{label(active.date)}</p>
          <Row color="var(--series-revenue)" name={revenueLabel} value={usd(active.revenue)} />
          <Row color="var(--series-cost)" name={costLabel} value={usd(active.cost)} dashed />
          <div className="mt-1.5 flex justify-between border-t border-line pt-1.5">
            <span className="text-ink-soft">Net</span>
            <span
              className={`num font-medium ${
                active.revenue - active.cost >= 0 ? "text-state-good" : "text-state-bad"
              }`}
            >
              {usd(active.revenue - active.cost)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-1 flex items-center gap-4 pl-[52px] text-2xs text-ink-soft">
        <LegendKey color="var(--series-revenue)" label={revenueLabel} />
        <LegendKey color="var(--series-cost)" label={costLabel} dashed />
      </div>
    </div>
  );
}

function Row({
  color,
  name,
  value,
  dashed,
}: {
  color: string;
  name: string;
  value: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-1.5 text-ink-soft">
        <Swatch color={color} dashed={dashed} />
        {name}
      </span>
      <span className="num text-ink">{value}</span>
    </div>
  );
}

function Swatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="14" height="8" aria-hidden>
      <line
        x1="0"
        y1="4"
        x2="14"
        y2="4"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={dashed ? "4 3" : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <Swatch color={color} dashed={dashed} />
      {label}
    </span>
  );
}
