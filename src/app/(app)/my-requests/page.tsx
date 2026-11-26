import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/session";
import { RequestList } from "@/components/requests/request-list";
import { LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "My requests" };

export default async function MyRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  return (
    <>
      <PageHeader
        title="My requests"
        description="Drafts, submitted and completed purchase requests you have raised."
        actions={
          <LinkButton href="/requests/new">
            <Plus className="h-4 w-4" /> New request
          </LinkButton>
        }
      />
      <RequestList actor={actor} sp={sp} basePath="/my-requests" mine />
    </>
  );
}
