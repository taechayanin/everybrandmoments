import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  ExternalLink,
  FileText,
  Sparkles,
} from "lucide-react";
import {
  Avatar,
  Card,
  MomentChip,
  PriorityBadge,
  ScoreBar,
  SectionTitle,
  StatusBadge,
} from "@/components/ui";
import { getMomentEvidence } from "@/lib/application/moments/get-moment-evidence";
import { generateSalesBrief } from "@/lib/application/moments/generate-sales-brief";
import { isMomentEventId } from "@/lib/domain/ids";
import { totalScore } from "@/lib/domain/score";
import { SLA_BY_PRIORITY, baht, priorityOf, shortDate, walletRange } from "@/lib/format";
import { VerifyButtons } from "./verify-buttons";

export const dynamic = "force-dynamic";

export default async function MomentDetail({
  params,
}: PageProps<"/radar/[eventId]">) {
  const { eventId } = await params;
  if (!isMomentEventId(eventId)) notFound();

  const [view, brief] = await Promise.all([
    getMomentEvidence(eventId),
    generateSalesBrief(eventId),
  ]);
  if (!view) notFound();

  const { event: e, account: acc, signals, solutions, ownerName, verifierName } = view;
  const score = totalScore(e.score);

  return (
    <div>
      <Link href="/radar" className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600">
        <ArrowLeft size={13} /> Moment Radar
      </Link>

      {/* Header — Moment + Score */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar name={acc.name} id={acc.id} size={11} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/accounts/${acc.id}`} className="text-lg font-bold text-slate-900 hover:text-indigo-600">
                  {acc.name}
                </Link>
                <MomentChip code={e.momentType} />
                <StatusBadge status={e.status} />
              </div>
              <p className="mt-0.5 text-sm text-slate-600">{e.subMoment}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                Owner: {ownerName} · คาดว่าเกิด {shortDate(e.expectedEventDate)} ·{" "}
                {SLA_BY_PRIORITY[priorityOf(score)]}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <PriorityBadge score={score} />
            <span className="text-xs font-bold text-slate-700">
              Wallet {walletRange(e.potentialWalletMin, e.potentialWalletMax)}
            </span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-5">
          <ScoreBar label="Business Fit" value={e.score.businessFit} max={30} />
          <ScoreBar label="Intent / Signal" value={e.score.intent} max={25} />
          <ScoreBar label="Timing" value={e.score.timing} max={20} />
          <ScoreBar label="Wallet" value={e.score.wallet} max={15} />
          <ScoreBar label="Relationship" value={e.score.relationship} max={10} />
        </div>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Why detected + Evidence */}
          <div>
            <SectionTitle
              title="ทำไมระบบตรวจพบ Moment นี้?"
              subtitle="Detection provenance + Evidence (ทีมต้องตอบคำถามนี้ได้เสมอ)"
            />
            <Card className="p-4">
              <div className="flex items-start gap-2.5 rounded-lg bg-slate-50 p-3">
                <Bot size={16} className="mt-0.5 shrink-0 text-indigo-500" />
                <div className="text-xs text-slate-700">
                  <p className="font-semibold">
                    {e.triggerSource}: {e.triggerDetail}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    ตรวจพบเมื่อ {shortDate(e.detectedAt)}
                    {e.detectedBy && ` · Detector: ${e.detectedBy}`}
                    {e.detectionConfidence !== undefined &&
                      ` · Confidence ${Math.round(e.detectionConfidence * 100)}%`}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {signals.length === 0 ? (
                  <p className="px-1 text-[11px] text-slate-400">
                    ไม่มี Signal evidence แนบกับ Moment นี้ (สร้างแบบ Manual หรือมาจากข้อมูลเริ่มต้น)
                  </p>
                ) : (
                  signals.map((s) => (
                    <div key={s.id} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                          {s.sourceType}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {shortDate(s.detectedAt)}
                          {s.confidence !== undefined && ` · ${Math.round(s.confidence * 100)}%`}
                          {s.modelName && ` · ${s.modelName}`}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-700">“{s.rawText}”</p>
                      {s.sourceUrl && (
                        <a
                          href={s.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline"
                        >
                          <ExternalLink size={10} /> ดูแหล่งที่มา
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          {/* Sales Brief */}
          {brief && (
            <div>
              <SectionTitle title="Sales Brief" subtitle="เตรียมก่อนโทร — Why Now / What to Ask / What to Sell (PRD §46)" />
              <Card className="p-5">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <FileText size={15} className="text-indigo-600" />
                  <p className="text-sm font-bold text-slate-900">{brief.accountName}</p>
                  <span className="text-xs text-slate-500">{brief.momentLine}</span>
                  <span className="ml-auto text-xs font-bold text-indigo-600">{brief.scoreLine}</span>
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <BriefSection title="WHY NOW">
                    <ul className="space-y-1">
                      {brief.whyNow.map((w, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-indigo-400">•</span> {w}
                        </li>
                      ))}
                    </ul>
                  </BriefSection>
                  <BriefSection title="DISCOVERY QUESTIONS">
                    <ol className="list-inside list-decimal space-y-1">
                      {brief.discoveryQuestions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ol>
                  </BriefSection>
                  <BriefSection title="RECOMMENDED SOLUTIONS">
                    <ol className="list-inside list-decimal space-y-1">
                      {brief.solutions.length > 0
                        ? brief.solutions.map((s) => <li key={s}>{s}</li>)
                        : [<li key="none">รอ Solution recommendation</li>]}
                    </ol>
                  </BriefSection>
                  <BriefSection title="TIMING & WALLET">
                    <p>คาดว่าเกิด: {brief.expectedDate}</p>
                    <p className="mt-1">Potential Wallet: {brief.wallet}</p>
                  </BriefSection>
                </div>
                <div className="mt-4 rounded-lg bg-indigo-50 p-3 text-xs">
                  <p className="font-bold text-indigo-800">ACTION: {brief.action}</p>
                  <p className="mt-0.5 text-indigo-600">NEXT MOMENT: {brief.nextMoment}</p>
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Right rail — verification + solutions */}
        <div className="space-y-6">
          <div>
            <SectionTitle title="Human Verification" subtitle="ไม่เชื่อ AI 100% — SOP Step 3" />
            <Card className="p-4">
              {e.verifiedBy ? (
                <div className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                  <BadgeCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-bold">
                      {e.status === "Lost" ? "ถูกปฏิเสธ (ไม่ใช่ Moment จริง)" : "ยืนยันแล้ว"}
                    </p>
                    <p className="mt-0.5">
                      โดย {verifierName}
                      {e.verifiedAt && ` · ${shortDate(e.verifiedAt)}`}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mb-3 text-[11px] text-slate-500">
                    Moment นี้ถูกตรวจพบโดย{" "}
                    {e.detectedBy ? `ระบบ (${e.detectedBy})` : "การบันทึกข้อมูล"} — Customer
                    Solution ต้องยืนยันก่อนทำงานต่อ
                  </p>
                  <VerifyButtons eventId={e.id} />
                </>
              )}
            </Card>
          </div>

          <div>
            <SectionTitle title="Recommended Solutions" />
            <div className="space-y-2">
              {solutions.map((s) => (
                <Card key={s.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-800">{s.name}</p>
                    <span className="text-[11px] font-semibold text-indigo-600">
                      {baht(s.averageWallet)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    เริ่มต้น {baht(s.startingPrice)} · Lead time {s.leadTimeDays} วัน
                  </p>
                </Card>
              ))}
              {solutions.length === 0 && (
                <Card className="p-3 text-[11px] text-slate-400">ยังไม่มี Solution ผูกกับ Moment นี้</Card>
              )}
            </div>
          </div>

          <div>
            <SectionTitle title="Next Action" />
            <Card className="p-4">
              <p className="text-xs font-medium text-indigo-700">→ {e.recommendedAction}</p>
              <Link
                href={`/workspace?account=${acc.id}&event=${e.id}`}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2.5 text-xs font-bold text-white hover:bg-indigo-700"
              >
                <Sparkles size={13} /> เปิดใน Solution Workspace
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function BriefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      <div className="text-xs leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}
