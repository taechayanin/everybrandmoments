import { Card, MomentChip, PageHeader, SectionTitle } from "@/components/ui";

const AUTOMATIONS = [
  {
    name: "Employee Welcome",
    moment: "EBM Welcome",
    trigger: "Start Date − 14 วัน",
    actions: ["Alert Customer Solution", "Suggest Welcome Kit", "Generate Task", "Pre-fill Quote"],
    active: true,
    firedThisMonth: 6,
  },
  {
    name: "Anniversary",
    moment: "EBM Milestone",
    trigger: "Company Anniversary − 60 วัน",
    actions: ["Create EBM Milestone", "Suggest Anniversary Solution", "Assign Account Owner"],
    active: true,
    firedThisMonth: 3,
  },
  {
    name: "Season — ปีใหม่",
    moment: "EBM Season",
    trigger: "New Year − 120 วัน",
    actions: ["Create EBM Season", "Segment by Account Value", "Campaign", "Sales Follow-up"],
    active: true,
    firedThisMonth: 8,
  },
  {
    name: "Recover",
    moment: "EBM Recover",
    trigger: "Complaint Severity = HIGH",
    actions: ["Create Recover Moment", "Assign Customer Success", "Stop Marketing Automation", "Recovery Action"],
    active: true,
    firedThisMonth: 1,
  },
  {
    name: "Return / Win-back",
    moment: "EBM Return",
    trigger: "No Order ≥ 180 วัน",
    actions: ["Create Return Moment", "Summarize History", "Recommend Win-back", "Assign SDR"],
    active: true,
    firedThisMonth: 2,
  },
  {
    name: "Expand Detection",
    moment: "EBM Expand",
    trigger: "branch_count เพิ่มขึ้น / Job Posting ≥ 10 ตำแหน่ง",
    actions: ["Create Expand Moment", "Score + Prioritize", "Alert Customer Solution"],
    active: true,
    firedThisMonth: 4,
  },
];

const RULE_EXAMPLE = `{
  "rule_id": "RULE-RETURN-180",
  "name": "No Order 180 Days",
  "condition": {
    "field": "days_since_last_order",
    "operator": ">=",
    "value": 180
  },
  "moment": "EBM Return",
  "priority": "WARM",
  "action": "Create Moment Event"
}`;

export default function Automation() {
  return (
    <div>
      <PageHeader
        title="Campaign & Automation"
        subtitle="Moment-based Automation — Trigger → Action → Moment Event"
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SectionTitle title="Active Automations" subtitle="Rule-based Trigger (Level 2)" />
          <div className="grid gap-3 md:grid-cols-2">
            {AUTOMATIONS.map((a) => (
              <Card key={a.name} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">{a.name}</p>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <MomentChip code={a.moment} small />
                  <span className="text-[11px] text-slate-400">ทำงาน {a.firedThisMonth} ครั้งเดือนนี้</span>
                </div>
                <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
                  ⚡ Trigger: {a.trigger}
                </p>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
                  {a.actions.map((act) => (
                    <li key={act} className="flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-slate-300" /> {act}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <SectionTitle title="Rule Engine Structure" subtitle="ตัวอย่าง Rule Definition" />
            <Card className="overflow-x-auto bg-slate-900 p-4">
              <pre className="text-[11px] leading-relaxed text-emerald-300">{RULE_EXAMPLE}</pre>
            </Card>
          </div>

          <div>
            <SectionTitle title="Notification Engine" />
            <Card className="divide-y divide-slate-50">
              {[
                ["🔥", "HOT Moment detected", "ABC Clinic — EBM Expand (92)"],
                ["⏰", "SLA approaching", "Urban Fit Gym — เหลือ 45 นาที"],
                ["📅", "Meeting today", "Rung Ruang 15:30 น. ที่พระราม 2"],
                ["📄", "Proposal overdue", "D-Design — ครบกำหนด 26 ส.ค."],
                ["⚠️", "Customer at risk", "CCC Tech — Complaint HIGH"],
                ["🎂", "Anniversary approaching", "Siam Dental ครบ 10 ปี (T-81)"],
              ].map(([icon, title, detail]) => (
                <div key={title} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span>{icon}</span>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{title}</p>
                    <p className="text-[11px] text-slate-500">{detail}</p>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
