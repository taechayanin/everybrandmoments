import type { UserId } from "./ids";

export type Role =
  | "Growth"
  | "SDR"
  | "Customer Solution"
  | "Solution Factory"
  | "Customer Success"
  | "Management";

export interface User {
  id: UserId;
  name: string;
  nickname: string;
  role: Role;
  center?: string;
}
