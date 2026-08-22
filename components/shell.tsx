"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  Compass,
  Gauge,
  Home,
  Library,
  ListTodo,
  MapPin,
  Megaphone,
  Radar,
  Route,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

const NAV = [
  { group: "หน้าหลัก", items: [
    { href: "/", label: "01 · Command Center", icon: Home },
    { href: "/radar", label: "02 · Moment Radar", icon: Radar },
    { href: "/journey", label: "03 · Journey Map", icon: Route },
  ]},
  { group: "ทำงานกับลูกค้า", items: [
    { href: "/accounts", label: "04 · Business Accounts", icon: Building2 },
    { href: "/workspace", label: "05 · Solution Workspace", icon: Sparkles },
    { href: "/opportunities", label: "06 · Opportunity Queue", icon: Briefcase },
    { href: "/solutions", label: "07 · Solution Library", icon: Library },
  ]},
  { group: "Operations", items: [
    { href: "/offline", label: "08 · Offline Center", icon: MapPin },
    { href: "/success", label: "09 · Customer Success", icon: Activity },
    { href: "/automation", label: "10 · Campaign & Automation", icon: Megaphone },
  ]},
  { group: "Management", items: [
    { href: "/analytics", label: "11 · Analytics", icon: BarChart3 },
    { href: "/performance", label: "12 · Team Performance", icon: Gauge },
    { href: "/admin", label: "13 · Admin / Moment Library", icon: Settings },
  ]},
];

const MOBILE_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/radar", label: "Radar", icon: Radar },
  { href: "/workspace", label: "Workspace", icon: Sparkles },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/opportunities", label: "Tasks", icon: ListTodo },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 text-white">
          <Compass size={20} />
        </span>
        <div>
          <p className="text-sm font-extrabold tracking-tight text-slate-900">MOMENT OS</p>
          <p className="text-[10px] font-medium text-slate-400">Every Brand Moments</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {g.group}
            </p>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Icon size={16} className={active ? "text-indigo-600" : "text-slate-400"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-100 p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
            บ
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-800">บอส ศุภกิตติ์</p>
            <p className="text-[10px] text-slate-400">Customer Solution</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur lg:h-16 lg:px-8">
      <div className="flex items-center gap-2 lg:hidden">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-cyan-500 text-white">
          <Compass size={16} />
        </span>
        <span className="text-sm font-extrabold text-slate-900">MOMENT OS</span>
      </div>
      <div className="hidden items-center gap-2 text-xs text-slate-400 lg:flex">
        <Users size={14} />
        <span>วันเสาร์ที่ 22 สิงหาคม 2569 · Mock Data Mode (MVP)</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          placeholder="ค้นหา Account / Moment…"
          className="hidden w-64 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white md:block"
        />
        <span className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500">
          <Megaphone size={15} />
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
            5
          </span>
        </span>
      </div>
    </header>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden">
      {MOBILE_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
              active ? "text-indigo-600" : "text-slate-400"
            }`}
          >
            <Icon size={18} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
