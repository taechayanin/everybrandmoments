import type { MomentSignal } from "@/lib/types";

// Evidence signals behind a few detected moments so the evidence UI works in
// mock mode. In D1 mode these rows live in moment_signals (written by
// /api/signals and the jobs worker).
export const MOCK_SIGNALS: MomentSignal[] = [
  {
    id: "SIG-mock-0001",
    accountId: "ACC-001",
    momentEventId: "ME-2026-000001",
    sourceType: "Social Signal",
    sourceRef: "facebook:abcclinic",
    sourceUrl: "https://facebook.com/abcclinic/posts/1234567890",
    rawText:
      "Coming Soon! 🎉 ABC Clinic สาขาใหม่ บางแค เปิดตัวเร็วๆ นี้ ตุลาคมนี้ พบกันแน่นอน",
    confidence: 0.92,
    detectedAt: "2026-08-20T09:14:00Z",
    modelName: "RULE-KEYWORD-L2",
    modelVersion: "1.0.0",
  },
  {
    id: "SIG-mock-0002",
    accountId: "ACC-001",
    momentEventId: "ME-2026-000001",
    sourceType: "Job Posting",
    sourceRef: "jobsdb:abc-clinic",
    sourceUrl: "https://th.jobsdb.com/company/abc-clinic",
    rawText:
      "ABC Clinic รับสมัครพยาบาลวิชาชีพ 8 ตำแหน่ง, ผู้ช่วยแพทย์ 6 ตำแหน่ง, ประชาสัมพันธ์ 4 ตำแหน่ง ประจำสาขาใหม่ (บางแค)",
    confidence: 0.88,
    detectedAt: "2026-08-20T11:30:00Z",
    modelName: "RULE-KEYWORD-L2",
    modelVersion: "1.0.0",
  },
  {
    id: "SIG-mock-0003",
    accountId: "ACC-003",
    momentEventId: "ME-2026-000003",
    sourceType: "Complaint",
    sourceRef: "ticket:CS-4471",
    rawText:
      "ลูกค้าร้องเรียน: Townhall Kit ส่งช้ากว่ากำหนด 3 วัน ทำให้ต้องเลื่อนแจกของในงาน — HR Director ไม่พอใจมาก ขอให้ติดต่อกลับด่วน",
    confidence: 0.95,
    detectedAt: "2026-08-21T08:05:00Z",
    modelName: "RULE-KEYWORD-L2",
    modelVersion: "1.0.0",
  },
  {
    id: "SIG-mock-0004",
    accountId: "ACC-010",
    momentEventId: "ME-2026-000004",
    sourceType: "Job Posting",
    sourceRef: "jobsdb:rungruang",
    sourceUrl: "https://th.jobsdb.com/company/rungruang-logistics",
    rawText:
      "Rung Ruang Logistics เปิดรับพนักงานขับรถ 50 อัตรา, พนักงานคลังสินค้า 25 อัตรา, ธุรการ 5 อัตรา ประจำ Hub ใหม่ จ.ขอนแก่น เริ่มงานตุลาคม 2569",
    confidence: 0.88,
    detectedAt: "2026-08-15T10:00:00Z",
    modelName: "RULE-KEYWORD-L2",
    modelVersion: "1.0.0",
  },
  {
    id: "SIG-mock-0005",
    accountId: "ACC-017",
    momentEventId: "ME-2026-000005",
    sourceType: "Social Signal",
    sourceRef: "instagram:urbanfitgym",
    sourceUrl: "https://instagram.com/p/urbanfit-chaengwattana",
    rawText: "Urban Fit สาขาใหม่ แจ้งวัฒนะ 'Opening Soon' 💪 ใครอยู่โซนนั้นเตรียมตัว!",
    confidence: 0.8,
    detectedAt: "2026-08-19T14:22:00Z",
    modelName: "RULE-KEYWORD-L2",
    modelVersion: "1.0.0",
  },
];
