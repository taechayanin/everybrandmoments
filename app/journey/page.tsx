import { PageHeader } from "@/components/ui";
import {
  getAccountJourney,
  getJourneyView,
  getRevenueJourney,
} from "@/lib/application/moments/get-journey";
import { isAccountId } from "@/lib/domain/ids";
import { JourneyClient } from "./journey-client";

export const dynamic = "force-dynamic";

export default async function JourneyPage({
  searchParams,
}: PageProps<"/journey">) {
  const sp = await searchParams;
  const mode =
    sp.mode === "account" || sp.mode === "revenue" ? sp.mode : "master";
  const requested = typeof sp.account === "string" ? sp.account : undefined;

  const view = await getJourneyView();
  const accountId =
    requested && isAccountId(requested)
      ? requested
      : view.accountOptions[0]?.id;

  const [accountJourney, revenueRows] = await Promise.all([
    mode === "account" && accountId ? getAccountJourney(accountId) : null,
    mode === "revenue" ? getRevenueJourney() : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader
        title="Journey Map"
        subtitle="Visual-first: 7 Lifecycle Phases × 4 Stakeholder Swimlanes"
      />
      <JourneyClient
        mode={mode}
        masterMoments={view.masterMoments}
        accountOptions={view.accountOptions}
        accountJourney={accountJourney}
        revenueRows={revenueRows}
      />
    </div>
  );
}
