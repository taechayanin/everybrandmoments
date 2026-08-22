import type { Appointment } from "@/lib/types";
import { getRepositories } from "@/lib/infrastructure";
import { CENTERS } from "@/lib/infrastructure/mock/opportunities";

export interface OfflineBookingRow extends Appointment {
  accountName: string;
  consultantName: string;
}

export interface OfflineView {
  bookings: OfflineBookingRow[];
  centers: typeof CENTERS;
  totalExpectedWallet: number;
  avgCloseRate: number;
}

export async function getOfflineView(): Promise<OfflineView> {
  const repos = await getRepositories();
  const [appointments, users] = await Promise.all([
    repos.appointments.listUpcoming(),
    repos.users.listAll(),
  ]);

  const bookings: OfflineBookingRow[] = [];
  for (const a of appointments) {
    const account = await repos.accounts.getById(a.accountId);
    const consultant = users.find((u) => u.id === a.consultantId);
    bookings.push({
      ...a,
      accountName: account?.name ?? a.accountId,
      consultantName: consultant
        ? `${consultant.nickname} (${consultant.name.split(" ")[0]})`
        : a.consultantId,
    });
  }

  return {
    bookings,
    centers: CENTERS,
    totalExpectedWallet: bookings.reduce((s, b) => s + b.expectedWallet, 0),
    avgCloseRate: CENTERS.reduce((s, c) => s + c.closeRate, 0) / CENTERS.length,
  };
}
