import { momentColor } from "@/lib/data/moments";
import {
  PRIORITY_STYLE,
  avatarColor,
  initials,
  priorityOf,
} from "@/lib/format";
import type { MomentEventStatus, Priority } from "@/lib/types";

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function PriorityBadge({ score }: { score: number }) {
  const p = priorityOf(score);
  const s = PRIORITY_STYLE[p];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.badge}`}
    >
      {s.emoji} {score} · {s.label}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: Priority }) {
  const s = PRIORITY_STYLE[priority];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.badge}`}
    >
      {s.emoji} {s.label}
    </span>
  );
}

export function MomentChip({ code, small = false }: { code: string; small?: boolean }) {
  const color = momentColor(code);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
      style={{ backgroundColor: `${color}18`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {code}
    </span>
  );
}

const STATUS_STYLE: Partial<Record<MomentEventStatus, string>> = {
  Detected: "bg-slate-100 text-slate-600",
  Review: "bg-slate-100 text-slate-700",
  Contacted: "bg-sky-50 text-sky-700",
  Qualified: "bg-blue-50 text-blue-700",
  "Meeting Booked": "bg-indigo-50 text-indigo-700",
  "Discovery Completed": "bg-violet-50 text-violet-700",
  "Solution Design": "bg-purple-50 text-purple-700",
  Proposal: "bg-amber-50 text-amber-700",
  Negotiation: "bg-orange-50 text-orange-700",
  Won: "bg-emerald-50 text-emerald-700",
  Lost: "bg-slate-100 text-slate-500 line-through",
  Delivery: "bg-teal-50 text-teal-700",
  "Next Moment": "bg-cyan-50 text-cyan-700",
};

export function StatusBadge({ status }: { status: MomentEventStatus }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600"}`}
    >
      {status}
    </span>
  );
}

export function Avatar({ name, id, size = 9 }: { name: string; id: string; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${avatarColor(id)}`}
      style={{ width: size * 4, height: size * 4 }}
    >
      {initials(name)}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent = "text-slate-900",
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </Card>
  );
}

export function ScoreBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold text-slate-700">
          {value}/{max}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full bg-indigo-500"
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}
