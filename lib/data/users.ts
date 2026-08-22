import type { User } from "@/lib/types";

export const USERS: User[] = [
  { id: "USR-001", name: "ณัฐพล วงศ์สุวรรณ", nickname: "นัท", role: "Management" },
  { id: "USR-002", name: "พิมพ์ชนก ศรีสมบูรณ์", nickname: "พิม", role: "Growth" },
  { id: "USR-003", name: "ธนกร เจริญกิจ", nickname: "เต้", role: "SDR" },
  { id: "USR-004", name: "อรวรรณ ตั้งใจดี", nickname: "ออม", role: "SDR" },
  { id: "USR-010", name: "ศุภกิตติ์ พงษ์ไพบูลย์", nickname: "บอส", role: "Customer Solution", center: "EBM Business Center — พระราม 2" },
  { id: "USR-011", name: "กานดา รักเรียน", nickname: "แก้ม", role: "Customer Solution", center: "EBM Business Center — ลาดพร้าว" },
  { id: "USR-012", name: "วีรภัทร สุขสันต์", nickname: "วิน", role: "Customer Solution", center: "EBM Studio — สยาม" },
  { id: "USR-020", name: "ชลธิชา แสงทอง", nickname: "ฝน", role: "Solution Factory" },
  { id: "USR-030", name: "ปวีณา ใจงาม", nickname: "ปุ้ย", role: "Customer Success" },
  { id: "USR-031", name: "อนุชา มั่นคง", nickname: "โอ๊ต", role: "Customer Success" },
];

export const userById = new Map(USERS.map((u) => [u.id, u]));

export function userName(id: string): string {
  const u = userById.get(id);
  return u ? `${u.nickname} (${u.name.split(" ")[0]})` : id;
}
