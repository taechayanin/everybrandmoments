import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getWorkspaceView } from "@/lib/application/workspace/get-workspace-view";
import { isAccountId, isMomentEventId } from "@/lib/domain/ids";
import type { AccountId } from "@/lib/types";
import { WorkspaceClient } from "./workspace-client";

export const dynamic = "force-dynamic";

const DEFAULT_ACCOUNT: AccountId = "ACC-001";

export default async function WorkspacePage({
  searchParams,
}: PageProps<"/workspace">) {
  const sp = await searchParams;
  const accountParam = typeof sp.account === "string" ? sp.account : undefined;
  const eventParam = typeof sp.event === "string" ? sp.event : undefined;

  const accountId =
    accountParam && isAccountId(accountParam) ? accountParam : DEFAULT_ACCOUNT;
  const view = await getWorkspaceView(accountId);

  if (!view) {
    return (
      <div>
        <PageHeader title="Customer Solution Workspace" />
        <p className="text-sm text-slate-500">
          ไม่พบ Account —{" "}
          <Link href="/accounts" className="text-indigo-600 hover:underline">
            กลับไปหน้า Business Accounts
          </Link>
        </p>
      </div>
    );
  }

  const initialEventId =
    eventParam &&
    isMomentEventId(eventParam) &&
    view.events.some((e) => e.event.id === eventParam)
      ? eventParam
      : view.events[0]?.event.id;

  return (
    <div>
      <PageHeader
        title="Customer Solution Workspace"
        subtitle="Select Account → Confirm Moment → Discovery → Solution → Route → Create Opportunity"
      />
      {/* key remounts the state machine when the account changes */}
      <WorkspaceClient key={view.account.id} view={view} initialEventId={initialEventId} />
    </div>
  );
}
