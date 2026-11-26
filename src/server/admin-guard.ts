import "server-only";
import { redirect } from "next/navigation";
import { requireActor } from "./auth/session";
import { entitiesWith, type Actor } from "./auth/actor";
import type { PermissionKey } from "./auth/permissions";

/** Page-level guard for administration screens. Services re-check every mutation. */
export async function requireAdmin(perm: PermissionKey): Promise<{ actor: Actor; entityIds: string[] }> {
  const actor = await requireActor();
  const entityIds = entitiesWith(actor, perm);
  if (entityIds.length === 0) redirect("/admin");
  return { actor, entityIds };
}
