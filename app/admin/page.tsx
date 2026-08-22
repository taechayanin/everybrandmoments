import { Card, MomentChip, PageHeader, SectionTitle } from "@/components/ui";
import { LIFECYCLE_PHASES, MASTER_MOMENTS } from "@/lib/data/moments";
import { SOLUTIONS } from "@/lib/data/solutions";

const ROLES = [
  { role: "Growth", can: ["View Leads", "Add Signals", "Campaign", "Moment Detection"], cannot: ["Approve Pricing"] },
  { role: "SDR / BDR", can: ["Review Moment", "Contact", "Qualify", "Book Meeting"], cannot: [] },
  { role: "Customer Solution", can: ["Account 360", "Discovery", "Solution Recommendation", "Opportunity", "Proposal Request", "Offline Booking"], cannot: [] },
  { role: "Solution Factory", can: ["Receive Brief", "Product", "Brand", "UX/UI", "Pricing", "Solution Design"], cannot: [] },
  { role: "Customer Success", can: ["Delivery Follow-up", "Repeat", "Renewal", "Recover", "Next Moment"], cannot: [] },
  { role: "Management", can: ["Dashboard", "Funnel", "Revenue", "Performance", "Configuration"], cannot: [] },
];

const SCORE_FORMULA = [
  { label: "Business Fit", points: 30, detail: "Industry Match / Employee Size / Revenue Potential / Geography / Strategic Account" },
  { label: "Intent / Signal", points: 25, detail: "Explicit inquiry / Public announcement / Meeting note / Website / Social" },
  { label: "Timing", points: 20, detail: "<30 วัน = สูงสุด · 30–60 · 60–90 · >90 วัน" },
  { label: "Wallet Potential", points: 15, detail: "<฿50K → >฿1M" },
  { label: "Relationship", points: 10, detail: "Existing / Repeat / Strategic / Referral / New" },
];

export default function Admin() {
  return (
    <div>
      <PageHeader title="Admin / Moment Library" subtitle="มาตรฐานกลาง: 20 Master Moments · Score Formula · Roles & Permissions" />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionTitle title="20 Master Moments" subtitle="แบ่งตาม 7 Lifecycle Phases" />
          <div className="space-y-4">
            {LIFECYCLE_PHASES.map((p) => {
              const moments = MASTER_MOMENTS.filter((m) => m.phase === p.key);
              if (moments.length === 0) return null;
              return (
                <div key={p.key}>
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {p.no} · {p.label}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {moments.map((m) => {
                      const solCount = SOLUTIONS.filter((s) => s.moment === m.code).length;
                      return (
                        <Card key={m.code} className="p-3.5" >
                          <div className="flex items-center justify-between gap-2">
                            <MomentChip code={m.code} small />
                            <span className="text-[10px] font-bold text-slate-300">
                              {String(m.no).padStart(2, "0")}
                            </span>
                          </div>
                          <p className="mt-1.5 text-[11px] text-slate-600">{m.description}</p>
                          <p className="mt-1.5 text-[10px] text-slate-400">
                            {solCount} Solutions · Next: {m.nextMoments.join(" / ")}
                          </p>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <SectionTitle title="Moment Score Formula" subtitle="รวม 100 คะแนน" />
            <Card className="divide-y divide-slate-50">
              {SCORE_FORMULA.map((f) => (
                <div key={f.label} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800">{f.label}</p>
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                      {f.points}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{f.detail}</p>
                </div>
              ))}
              <div className="bg-slate-50 px-4 py-2.5 text-[11px] text-slate-600">
                85–100 🔥 HOT · 70–84 WARM · 50–69 NURTURE · &lt;50 WATCH
              </div>
            </Card>
          </div>

          <div>
            <SectionTitle title="Roles & Permissions" />
            <div className="space-y-2.5">
              {ROLES.map((r) => (
                <Card key={r.role} className="p-3.5">
                  <p className="text-xs font-bold text-slate-800">{r.role}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    <span className="font-semibold text-emerald-600">Can:</span> {r.can.join(" · ")}
                  </p>
                  {r.cannot.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      <span className="font-semibold text-red-500">Cannot:</span> {r.cannot.join(" · ")}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle title="Integration Keys" subtitle="Master Account Key Mapping" />
            <Card className="p-4 text-center text-xs font-semibold text-slate-600">
              Moment OS Account ID ↕ CRM Account ID ↕ ERP Customer Code
              <p className="mt-1.5 text-[11px] font-normal text-slate-400">
                ห้ามสร้าง Account ซ้ำ — Phase 2: CRM Sync / ERP Sync
              </p>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
