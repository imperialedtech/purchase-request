import { requireAdmin } from "@/server/admin-guard";
import { isAdmin } from "@/server/auth/actor";
import { db } from "@/server/db";
import { EntityEditor } from "@/components/admin/config-editors";

export const metadata = { title: "Entities" };

export default async function EntitiesPage() {
  const { actor, entityIds } = await requireAdmin("admin.entities");
  const entities = await db.entity.findMany({ where: { id: { in: entityIds } }, orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      {entities.map((e) => (
        <EntityEditor
          key={e.id}
          initial={{
            id: e.id,
            code: e.code,
            name: e.name,
            legalName: e.legalName ?? "",
            address: e.address ?? "",
            prNumberFormat: e.prNumberFormat,
            sequencePadding: e.sequencePadding,
            currencyMode: e.currencyMode,
            defaultCurrency: e.defaultCurrency,
            allowedCurrencies: e.allowedCurrencies,
            allowSelfApproval: e.allowSelfApproval,
            emailNotifications: e.emailNotifications,
            pdfFooterText: e.pdfFooterText ?? "",
            isActive: e.isActive,
            isConfigured: e.isConfigured,
            hasLogo: !!e.logoKey,
          }}
        />
      ))}
      {isAdmin(actor) && (
        <details className="rounded-lg border border-dashed border-slate-300 p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">Add another entity</summary>
          <div className="mt-4">
            <EntityEditor
              initial={{
                id: null,
                code: "",
                name: "",
                legalName: "",
                address: "",
                prNumberFormat: "{CODE}-PR-{YEAR}-{SEQ}",
                sequencePadding: 4,
                currencyMode: "SINGLE",
                defaultCurrency: "NGN",
                allowedCurrencies: ["NGN", "USD", "EUR", "GBP"],
                allowSelfApproval: false,
                emailNotifications: true,
                pdfFooterText: "",
                isActive: true,
                isConfigured: false,
              }}
            />
          </div>
        </details>
      )}
    </div>
  );
}
