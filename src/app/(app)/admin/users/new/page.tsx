import { requireAdmin } from "@/server/admin-guard";
import { userEditorOptions } from "@/server/admin-options";
import { UserEditor } from "@/components/admin/user-editor";

export const metadata = { title: "Invite user" };

export default async function NewUserPage() {
  const { entityIds } = await requireAdmin("admin.users");
  const opts = await userEditorOptions(entityIds);
  return (
    <>
      <h2 className="mb-4 text-base font-semibold text-slate-900">Invite a new user</h2>
      <UserEditor {...opts} isSelf={false} />
    </>
  );
}
