import type { Priority, ScoreBreakdown } from "@/lib/types";

export function totalScore(s: ScoreBreakdown): number {
  return s.businessFit + s.intent + s.timing + s.wallet + s.relationship;
}

export function priorityOf(score: number): Priority {
  if (score >= 85) return "HOT";
  if (score >= 70) return "WARM";
  if (score >= 50) return "NURTURE";
  return "WATCH";
}

export const PRIORITY_STYLE: Record<
  Priority,
  { label: string; badge: string; dot: string; emoji: string }
> = {
  HOT: { label: "HOT", badge: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500", emoji: "🔥" },
  WARM: { label: "WARM", badge: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500", emoji: "⚡" },
  NURTURE: { label: "NURTURE", badge: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500", emoji: "🌱" },
  WATCH: { label: "WATCH", badge: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400", emoji: "👀" },
};

export const SLA_BY_PRIORITY: Record<Priority, string> = {
  HOT: "ติดต่อภายใน 2 ชั่วโมง",
  WARM: "ติดต่อภายใน 24 ชั่วโมง",
  NURTURE: "Automation + Follow-up",
  WATCH: "Monitor เท่านั้น",
};

export function baht(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `฿${m % 1 === 0 ? m.toFixed(0) : m.toFixed(2)}M`;
  }
  if (n >= 1_000) return `฿${Math.round(n / 1_000)}K`;
  return `฿${n.toLocaleString("th-TH")}`;
}

export function bahtFull(n: number): string {
  return `฿${n.toLocaleString("th-TH")}`;
}

export function walletRange(min: number, max: number): string {
  return `${baht(min)}–${baht(max)}`;
}

const TH_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function thDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}

export function monthYear(iso: string): string {
  const d = new Date(iso);
  return `${TH_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// "Today" is fixed for the mock dataset so the demo is deterministic.
export const TODAY = "2026-08-22";

export function daysUntil(iso: string): number {
  const a = new Date(TODAY).getTime();
  const b = new Date(iso).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function initials(name: string): string {
  const words = name.replace(/[^A-Za-zก-๙ .]/g, "").split(/[\s.]+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const AVATAR_COLORS = [
  "bg-cyan-600", "bg-blue-600", "bg-indigo-600", "bg-violet-600",
  "bg-emerald-600", "bg-teal-600", "bg-amber-600", "bg-rose-600",
  "bg-sky-600", "bg-fuchsia-600",
];

export function avatarColor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
