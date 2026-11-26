import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getFormOptions } from "@/server/services/requests";
import { RequestForm } from "@/components/requests/request-form";
import { Alert, PageHeader } from "@/components/ui";
import { MAX_UPLOAD_BYTES } from "@/server/services/attachments";

export const metadata = { title: "New purchase request" };

export default async function NewRequestPage() {
  const actor = await requireActor();
  const entities = await getFormOptions(db, actor);
  return (
    <>
      <PageHeader title="New purchase request" description="Complete each section, save as a draft at any time, then submit for approval." />
      {entities.length === 0 ? (
        <Alert tone="amber">You do not have permission to raise purchase requests. Contact your administrator.</Alert>
      ) : (
        <RequestForm
          entities={entities}
          maxUploadMb={Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}
          initiator={{ name: actor.name, jobTitle: actor.jobTitle, department: actor.departmentName, canEditProfile: actor.canEditProfile }}
        />
      )}
    </>
  );
}
