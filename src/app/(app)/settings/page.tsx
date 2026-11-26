import { requireActor } from "@/server/auth/session";
import { db } from "@/server/db";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { PasswordForm, ProfileForm } from "@/components/settings-forms";
import { emailConfigured } from "@/server/email";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireActor();
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id }, include: { entities: { include: { entity: true } } } });
  return (
    <>
      <PageHeader title="Settings" description="Your profile, password and access." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile" description="Used to fill the Initiator section of your purchase requests." />
            <div className="p-5">
              <ProfileForm name={user.name} jobTitle={user.jobTitle ?? ""} phone={user.phone ?? ""} canEdit={user.canEditProfile} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Password" />
            <div className="p-5">
              <PasswordForm />
            </div>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Your access" />
          <dl className="space-y-4 p-5 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Department</dt>
              <dd className="font-medium">{actor.departmentName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Entities</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {user.entities.map((e) => (
                  <Badge key={e.entityId}>{e.entity.name}</Badge>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Roles</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {actor.grants.map((g, i) => (
                  <Badge key={i} tone="blue">
                    {g.roleName}
                  </Badge>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Email notifications</dt>
              <dd className="font-medium">{emailConfigured() ? "Enabled" : "Not configured — in-app notifications only"}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
