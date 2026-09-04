"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Vehicle, VehicleStatus } from "@/lib/types";

const W = 1000;
const H = 600;
const CENTER = { lat: 40.4406, lng: -79.9959 };
const SPAN = { lat: 0.13, lng: 0.19 };

const project = (v: { lat: number; lng: number }) => ({
  x: ((v.lng - (CENTER.lng - SPAN.lng / 2)) / SPAN.lng) * W,
  y: (1 - (v.lat - (CENTER.lat - SPAN.lat / 2)) / SPAN.lat) * H,
});

// Status is carried by hue AND glyph AND the labelled legend — never color alone.
const STATE: Record<VehicleStatus, { color: string; label: string; glyph: string }> = {
  earning: { color: "var(--series-revenue)", label: "Earning", glyph: "$" },
  idle: { color: "var(--series-home)", label: "Idle", glyph: "‖" },
  charging: { color: "var(--series-super)", label: "Charging", glyph: "⚡" },
  shop: { color: "#e66767", label: "In shop", glyph: "!" },
};

const ROADS = [
  "M0,232 C180,208 340,268 520,246 C700,224 860,272 1000,250",
  "M0,392 C200,372 360,420 560,404 C740,390 880,424 1000,410",
  "M172,0 C196,140 160,300 196,440 C222,540 206,570 214,600",
  "M470,0 C486,120 452,260 492,390 C520,486 506,556 512,600",
  "M760,0 C776,150 742,290 782,420 C806,506 792,558 798,600",
  "M0,110 L1000,86",
  "M0,520 L1000,548",
  "M60,600 C180,470 300,420 470,392",
  "M940,0 C860,140 800,220 782,300",
];

const RIVER =
  "M0,300 C150,286 250,330 380,336 L520,342 C640,348 700,392 820,404 C900,412 950,404 1000,396 L1000,436 C940,446 880,450 800,442 C670,428 610,386 500,380 L370,374 C240,368 140,326 0,340 Z";

const RIVER_N = "M470,338 C500,270 520,190 500,60 L556,60 C574,196 556,282 524,344 Z";

export default function FleetMap({
  vehicles,
  drivers,
  height = 520,
}: {
  vehicles: Vehicle[];
  drivers: { id: string; name: string }[];
  height?: number;
}) {
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  // Motion starts only after mount, so the first paint matches the server render.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1800);
    return () => clearInterval(id);
  }, []);

  const driverName = (id: string | null) =>
    drivers.find((d) => d.id === id)?.name ?? "Unassigned";
  const active = vehicles.find((v) => v.id === selected) ?? null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ height, width: "100%" }}
        role="img"
        aria-label="Fleet positions across the metro"
        className="rounded-xl bg-[#0a100d]"
      >
        <rect width={W} height={H} fill="#0a100d" />
        {[...Array(13)].map((_, i) => (
          <line
            key={`h${i}`}
            x1="0"
            x2={W}
            y1={(i * H) / 12}
            y2={(i * H) / 12}
            stroke="#111a16"
            strokeWidth="1"
          />
        ))}
        {[...Array(19)].map((_, i) => (
          <line
            key={`v${i}`}
            y1="0"
            y2={H}
            x1={(i * W) / 18}
            x2={(i * W) / 18}
            stroke="#111a16"
            strokeWidth="1"
          />
        ))}

        <path d={RIVER} fill="#0e2130" />
        <path d={RIVER_N} fill="#0e2130" />

        {ROADS.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={i < 5 ? "#243029" : "#1a231e"} strokeWidth={i < 5 ? 3.5 : 1.6} />
        ))}

        {/* Demand zone the fleet clusters around. */}
        <circle cx="806" cy="150" r="86" fill="var(--series-super)" opacity="0.07" />
        <circle cx="806" cy="150" r="86" fill="none" stroke="var(--series-super)" strokeWidth="1" opacity="0.28" strokeDasharray="4 5" />
        <text x="806" y="150" textAnchor="middle" fontSize="13" fill="var(--series-super)" opacity="0.85">
          Airport zone
        </text>
        <text x="806" y="168" textAnchor="middle" fontSize="11" fill="var(--text-muted)">
          surge 1.6× · 4–7 PM
        </text>

        <text x="286" y="268" fontSize="12" fill="#385746">
          Downtown
        </text>
        <text x="96" y="512" fontSize="12" fill="#385746">
          South Hills
        </text>
        <text x="600" y="546" fontSize="12" fill="#385746">
          Depot · Hazelwood
        </text>
        <rect x="576" y="534" width="12" height="12" rx="3" fill="var(--series-revenue)" opacity="0.6" />

        {vehicles.map((v, i) => {
          const base = project(v);
          const drift = v.status === "earning" ? 1 : 0;
          const phase = (tick + i * 3) * 0.7;
          const x = base.x + drift * Math.cos(phase + i) * 13;
          const y = base.y + drift * Math.sin(phase * 0.8 + i) * 9;
          const s = STATE[v.status];
          const isSel = selected === v.id;
          return (
            <g
              key={v.id}
              transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
              onClick={() => setSelected(isSel ? null : v.id)}
              className="cursor-pointer"
              style={{ transition: "transform 1.6s linear" }}
            >
              {v.status === "earning" && (
                <circle r="11" fill={s.color} opacity="0.35" className="pin-pulse" />
              )}
              {/* Hit target larger than the mark. */}
              <circle r="18" fill="transparent" />
              <circle
                r="11"
                fill={s.color}
                stroke={isSel ? "#ffffff" : "var(--surface-1)"}
                strokeWidth="2"
              />
              <text
                y="4"
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill="#0a100d"
                pointerEvents="none"
              >
                {s.glyph}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-ink-soft">
        {(Object.keys(STATE) as VehicleStatus[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span
              className="grid h-4 w-4 place-items-center rounded-full text-[9px] font-bold text-[#0a100d]"
              style={{ background: STATE[k].color }}
              aria-hidden
            >
              {STATE[k].glyph}
            </span>
            {STATE[k].label}
            <span className="num text-ink-mute">
              ({vehicles.filter((v) => v.status === k).length})
            </span>
          </span>
        ))}
        <span className="ml-auto text-ink-mute">Click a pin for vehicle detail</span>
      </div>

      {active && (
        <div className="absolute right-4 top-4 w-[248px] rounded-xl border border-line bg-raised/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">{active.id}</p>
              <p className="text-2xs text-ink-mute">
                {active.year} {active.make} {active.model}
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-ink-mute hover:text-ink"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <dl className="mt-3 space-y-1.5 text-xs">
            <Row k="Status" v={STATE[active.status].label} />
            <Row k="Driver" v={driverName(active.driverId)} />
            <Row k="Battery" v={`${active.batteryPct}%`} />
            <Row k="Deal" v={active.revenueModel === "rental" ? "Flat rental" : "Revenue split"} />
          </dl>
          <Link
            href={`/vehicles/${active.id}`}
            className="mt-3 block rounded-lg bg-brand/15 px-3 py-2 text-center text-xs font-medium text-brand ring-1 ring-brand/25 hover:bg-brand/25"
          >
            Open P&amp;L
          </Link>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-mute">{k}</dt>
      <dd className="num text-ink">{v}</dd>
    </div>
  );
}
