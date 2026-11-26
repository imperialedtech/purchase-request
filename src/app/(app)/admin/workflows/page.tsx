import { requireAdmin } from "@/server/admin-guard";
import { db } from "@/server/db";
import { WorkflowEditor } from "@/components/admin/config-editors";

export const metadata = { title: "Approval workflows" };

export default async function WorkflowsPage() {
  const { entityIds } = await requireAdmin("admin.workflows");
  const [entities, roles] = await Promise.all([
    db.entity.findMany({
      where: { id: { in: entityIds } },
      orderBy: { name: "asc" },
      include: { workflows: { orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }], take: 1, include: { stages: { orderBy: { stageOrder: "asc" } } } } },
    }),
    db.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Approval stages run strictly in order. When a request is submitted, the workflow is copied onto it, so editing a workflow never changes requests already in progress or their history.
      </p>
      {await Promise.all(
        entities.map(async (e) => {
          const users = await db.user.findMany({ where: { isActive: true, entities: { some: { entityId: e.id } } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
          const wf = e.workflows[0];
          return (
            <WorkflowEditor
              key={e.id}
              entity={{ id: e.id, name: e.name, isConfigured: e.isConfigured }}
              roles={roles}
              users={users}
              workflow={
                wf
                  ? {
                      id: wf.id,
                      name: wf.name,
                      resubmitRule: wf.resubmitRule,
                      isActive: wf.isActive,
                      version: wf.version,
                      stages: wf.stages.map((s) => ({
                        name: s.name,
                        statusKey: s.statusKey as "PENDING_LEVEL1",
                        approverType: s.approverType,
                        roleId: s.roleId,
                        userId: s.userId,
                        requireCommentOnApprove: s.requireCommentOnApprove,
                        escalationHours: s.escalationHours,
                      })),
                    }
                  : null
              }
            />
          );
        }),
      )}
    </div>
  );
}
