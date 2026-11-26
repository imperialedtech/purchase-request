import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { getFormOptions, getRequestForActor } from "@/server/services/requests";
import { RequestForm } from "@/components/requests/request-form";
import { PageHeader } from "@/components/ui";
import { MAX_UPLOAD_BYTES } from "@/server/services/attachments";
import { AppError } from "@/server/errors";

export const metadata = { title: "Edit purchase request" };

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  let data;
  try {
    data = await getRequestForActor(db, actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { pr, caps } = data;
  if (!caps.canEdit) redirect(`/requests/${id}`);
  const entities = await getFormOptions(db, actor);
  const lastReturn = [...pr.approvals].reverse().find((a) => a.decision === "CLARIFICATION_REQUESTED");
  const isDraft = pr.status === "DRAFT";
  return (
    <>
      <PageHeader
        title={pr.prNumber ? `Edit ${pr.prNumber}` : "Edit draft"}
        description={pr.status === "RETURNED" ? "This request was returned for clarification. Update it and resubmit." : "Continue your draft and submit when ready."}
      />
      <RequestForm
        entities={entities}
        maxUploadMb={Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}
        initiator={{
          name: isDraft ? actor.name : pr.requesterName,
          jobTitle: isDraft ? actor.jobTitle : pr.requesterJobTitle,
          department: isDraft ? actor.departmentName : pr.departmentName,
          canEditProfile: actor.canEditProfile,
        }}
        existing={{
          id: pr.id,
          prNumber: pr.prNumber,
          status: pr.status,
          entityId: pr.entityId,
          categoryId: pr.categoryId,
          title: pr.title,
          comments: pr.comments,
          paymentDetails: pr.paymentDetails,
          createdAt: pr.createdAt.toISOString(),
          items: pr.items.map((i) => ({ description: i.description, specifications: i.specifications, quantity: i.quantity.toString(), currency: i.currency, unitPrice: i.unitPrice.toFixed(2) })),
          attachments: pr.attachments.map((a) => ({ id: a.id, fileName: a.fileName, sizeBytes: a.sizeBytes, mimeType: a.mimeType })),
          clarification:
            pr.status === "RETURNED" && lastReturn
              ? { by: lastReturn.actorName, stage: lastReturn.stageName, comment: lastReturn.comment ?? "", at: lastReturn.createdAt.toISOString() }
              : null,
        }}
      />
    </>
  );
}
