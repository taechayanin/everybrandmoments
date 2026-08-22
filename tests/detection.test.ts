import { describe, expect, it } from "vitest";
import { detect } from "@/workers/jobs/src/detection";
import { JobSchema } from "@/lib/jobs/contracts";

describe("Level 2 keyword detection", () => {
  it("detects EBM Expand from branch signals", () => {
    const r = detect(["Facebook post: Coming Soon — สาขาใหม่ เซ็นทรัลลาดพร้าว"]);
    expect(r.momentCode).toBe("EBM Expand");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.reason).toContain("EBM Expand");
  });

  it("detects EBM Recover from complaints with highest precedence", () => {
    const r = detect(["ลูกค้าร้องเรียนว่างานส่งล่าช้า 3 วัน"]);
    expect(r.momentCode).toBe("EBM Recover");
  });

  it("detects EBM Hire from job postings", () => {
    const r = detect(["ประกาศรับสมัครพนักงาน 15 ตำแหน่ง"]);
    expect(r.momentCode).toBe("EBM Hire");
  });

  it("multiple matched rules raise confidence", () => {
    const single = detect(["เปิดตัวสินค้าใหม่"]);
    const multi = detect(["เปิดตัวสาขาใหม่ พร้อมรับสมัครพนักงาน 10 ตำแหน่ง"]);
    expect(multi.confidence).toBeGreaterThan(single.confidence);
  });

  it("falls back to low-confidence EBM Engage when nothing matches", () => {
    const r = detect(["สวัสดีครับ สนใจสอบถามข้อมูลทั่วไป"]);
    expect(r.momentCode).toBe("EBM Engage");
    expect(r.confidence).toBeLessThan(0.5);
  });
});

describe("Job contracts", () => {
  it("accepts a valid DETECT_MOMENT job", () => {
    expect(
      JobSchema.safeParse({
        jobType: "DETECT_MOMENT",
        organizationId: "ORG-001",
        accountId: "ACC-001",
        signalIds: ["SIG-abc"],
      }).success,
    ).toBe(true);
  });

  it("rejects unknown job types and malformed ids", () => {
    expect(JobSchema.safeParse({ jobType: "HACK", organizationId: "ORG-001" }).success).toBe(false);
    expect(
      JobSchema.safeParse({
        jobType: "DETECT_MOMENT",
        organizationId: "ORG-001",
        accountId: "not-an-account",
        signalIds: ["SIG-abc"],
      }).success,
    ).toBe(false);
  });
});
