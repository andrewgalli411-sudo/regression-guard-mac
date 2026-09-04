"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BoltIcon, CarIcon, GaugeIcon, MapIcon, UsersIcon } from "./icons";

const NAV = [
  { href: "/", label: "Command Center", Icon: GaugeIcon },
  { href: "/vehicles", label: "Vehicles", Icon: CarIcon },
  { href: "/drivers", label: "Drivers", Icon: UsersIcon },
  { href: "/map", label: "Live Map", Icon: MapIcon },
  { href: "/charging", label: "Charging", Icon: BoltIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface/70 px-4 py-5 lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-3 px-2">
        <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-black ring-1 ring-line">
          <Image src="/mark.png" alt="" width={40} height={40} priority />
        </span>
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-[0.14em] text-ink">
            CABBAGE <span className="text-brand">OS</span>
          </span>
          <span className="block text-2xs tracking-wide text-ink-mute">Fleet profit engine</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-brand/10 font-medium text-brand ring-1 ring-brand/25"
                  : "text-ink-soft hover:bg-raised hover:text-ink"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-line bg-raised p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/15 text-sm font-semibold text-brand">
            AG
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-medium text-ink">Allegheny Mobility</span>
            <span className="block text-2xs text-ink-mute">Fleet owner · 24 cars</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
