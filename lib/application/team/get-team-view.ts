import type { User } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";

export async function getTeamMembers(): Promise<User[]> {
  const repos = await getRepositories();
  return repos.users.listAll();
}
