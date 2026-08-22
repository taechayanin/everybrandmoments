import { PageHeader } from "@/components/ui";
import { listSolutions } from "@/lib/application/solutions/list-solutions";
import { MASTER_MOMENTS } from "@/lib/domain/master-moments";
import { SolutionsClient } from "./solutions-client";

export const dynamic = "force-dynamic";

export default async function SolutionLibraryPage() {
  const solutions = await listSolutions();
  return (
    <div>
      <PageHeader
        title="Solution Library"
        subtitle={`${solutions.length} Solutions — ทุก Solution ผูกกับ Moment และ Stakeholder`}
      />
      <SolutionsClient
        solutions={solutions}
        momentCodes={MASTER_MOMENTS.map((m) => m.code)}
      />
    </div>
  );
}
