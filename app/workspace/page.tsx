import { Suspense } from "react";
import { WorkspaceClient } from "./workspace-client";

export default async function WorkspacePage({
  searchParams,
}: PageProps<"/workspace">) {
  const sp = await searchParams;
  const eventId = typeof sp.event === "string" ? sp.event : undefined;
  return (
    <Suspense>
      <WorkspaceClient initialEventId={eventId} />
    </Suspense>
  );
}
