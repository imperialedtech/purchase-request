import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { entitiesWith } from "@/server/auth/actor";
import { RequestList } from "@/components/requests/request-list";
import { LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "Purchase requests" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const viewAll = entitiesWith(actor, "pr.view_all").length > 0;
  return (
    <>
      <PageHeader
        title="Purchase requests"
        description={viewAll ? "All submitted purchase requests in your entities, plus your own drafts." : "Your requests and those assigned to you for approval."}
        actions={
          entitiesWith(actor, "pr.create").length > 0 ? (
            <LinkButton href="/requests/new">
              <Plus className="h-4 w-4" /> New request
            </LinkButton>
          ) : undefined
        }
      />
      <RequestList actor={actor} sp={sp} basePath="/requests" />
    </>
  );
}
