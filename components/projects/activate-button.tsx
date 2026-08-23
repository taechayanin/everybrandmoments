"use client";

// Activate Project (Step 4 §6) — UI hints are ADVISORY; the canonical
// application/domain gate decides, and its errors render verbatim below.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { activateProjectAction } from "@/app/opportunities/actions";
import { Drawer, Field, inputCls } from "@/components/crm/drawer";

const GATE_LABEL_TH: Record<string, string> = {
  account: "ลูกค้า",
  industry: "อุตสาหกรรม",
  moment: "โมเมนต์ธุรกิจ",
  project_type: "ประเภทโปรเจกต์ (ต้องเลือกจากรายการจริง)",
  owner: "ผู้รับผิดชอบ",
  estimated_revenue: "มูลค่าคาดการณ์",
  next_action: "Next Action",
  next_action_date: "วันที่ Next Action",
};

function translateGateError(message: string): string {
  const m = message.match(/(?:activation gate failed|project context invalid): (.+)/);
  if (!m) return message;
  return `ข้อมูลยังไม่ครบ/ไม่ถูกต้อง: ${m[1]
    .split(", ")
    .map((k) => GATE_LABEL_TH[k] ?? k)
    .join(" · ")}`;
}

export function ActivateButton({
  opportunityId,
  missingHints,
  industries,
  projectTypes,
  current,
}: {
  opportunityId: string;
  /** Advisory only — server-computed hint of what looks missing. */
  missingHints: string[];
  industries: { id: string; nameTh: string; parentId: string | null }[];
  projectTypes: { id: string; nameTh: string }[];
  current: {
    industryId: string | null;
    subIndustryId: string | null;
    projectTypeId: string | null;
    nextAction: string;
    nextActionDate: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [industryId, setIndustryId] = useState(current.industryId ?? "");
  const [subIndustryId, setSubIndustryId] = useState(current.subIndustryId ?? "");
  const [projectTypeId, setProjectTypeId] = useState(current.projectTypeId ?? "");
  const [nextAction, setNextAction] = useState(current.nextAction);
  const [nextActionDate, setNextActionDate] = useState(current.nextActionDate ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const groups = industries.filter((i) => i.parentId === null);
  const subs = industries.filter((i) => i.parentId === industryId);

  async function submit() {
    setPending(true);
    setError(null);
    const result = await activateProjectAction({
      opportunityId,
      ...(industryId ? { industryId } : {}),
      ...(subIndustryId ? { subIndustryId } : {}),
      ...(projectTypeId ? { projectTypeId } : {}),
      ...(nextAction.trim() ? { nextAction: nextAction.trim() } : {}),
      ...(nextActionDate ? { nextActionDate } : {}),
      clientRequestId: requestId,
    });
    setPending(false);
    if (result.ok) {
      setRequestId(crypto.randomUUID());
      setOpen(false);
      router.refresh();
    } else {
      setError(translateGateError(result.error));
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700"
      >
        ▶ Activate
      </button>
      <Drawer open={open} title="Activate Project" onClose={() => setOpen(false)}>
        {missingHints.length > 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
            ยังขาด: {missingHints.map((h) => GATE_LABEL_TH[h] ?? h).join(" · ")}
          </p>
        )}
        <div className="space-y-3">
          <Field label="อุตสาหกรรม *">
            <select
              value={industryId}
              onChange={(e) => {
                setIndustryId(e.target.value);
                setSubIndustryId("");
              }}
              className={inputCls}
            >
              <option value="">— เลือก —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.nameTh}</option>
              ))}
            </select>
          </Field>
          <Field label="ประเภทธุรกิจย่อย (ถ้ามี)">
            <select
              value={subIndustryId}
              onChange={(e) => setSubIndustryId(e.target.value)}
              className={inputCls}
              disabled={subs.length === 0}
            >
              <option value="">— ไม่ระบุ —</option>
              {subs.map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.nameTh}</option>
              ))}
            </select>
          </Field>
          <Field label="ประเภทโปรเจกต์ *">
            <select
              value={projectTypeId}
              onChange={(e) => setProjectTypeId(e.target.value)}
              className={inputCls}
            >
              <option value="">— เลือก —</option>
              {projectTypes.map((t) => (
                <option key={t.id} value={t.id}>{t.nameTh}</option>
              ))}
            </select>
          </Field>
          <Field label="Next Action *">
            <input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              className={inputCls}
              placeholder="เช่น โทรนัด discovery"
            />
          </Field>
          <Field label="วันที่ Next Action *">
            <input
              type="date"
              value={nextActionDate}
              onChange={(e) => setNextActionDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{error}</p>
          )}
          <button
            disabled={pending}
            onClick={() => void submit()}
            className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pending ? "กำลัง Activate…" : "Activate → เข้าสู่ Pipeline (บรีฟใหม่)"}
          </button>
        </div>
      </Drawer>
    </>
  );
}
