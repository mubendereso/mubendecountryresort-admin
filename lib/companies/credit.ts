import "server-only";

import { recordAuditLog } from "@/lib/audit/log";
import type { AdminRole } from "@/lib/auth/session";
import { getCompanyCreditAssessment } from "./data";
import type { CompanyCreditAssessment } from "./types";

export type CreditControlSession = {
  userId: string;
  email: string | null;
  role: AdminRole;
};

export type CreditControlResult =
  | { ok: true; assessment: CompanyCreditAssessment; overrideUsed: boolean }
  | { ok: false; error: string; assessment: CompanyCreditAssessment | null };

export async function enforceCompanyCreditControl(input: {
  companyId: string;
  projectedAdditionalUgx?: number;
  overrideReason?: string | null;
  session: CreditControlSession;
  relatedEntityType: "booking" | "reservation_group" | "invoice";
  relatedEntityId?: string | null;
  relatedReference?: string | null;
}): Promise<CreditControlResult> {
  const assessment = await getCompanyCreditAssessment(input.companyId);
  if (!assessment) return { ok: false, error: "Company account not found.", assessment: null };
  if (!assessment.is_active) {
    return { ok: false, error: "Inactive company accounts cannot receive new company-billed business.", assessment };
  }
  if (assessment.is_suspended) {
    return { ok: false, error: "This company account is suspended. A superadmin must reactivate it first.", assessment };
  }

  const projectedAdditional = Math.max(0, Math.round(input.projectedAdditionalUgx ?? 0));
  const projectedExposure = assessment.total_credit_exposure_ugx + projectedAdditional;
  const overLimit = projectedExposure > assessment.credit_limit_ugx;
  const overdue = assessment.overdue_invoices_ugx > 0;
  if (!overLimit && !overdue) return { ok: true, assessment, overrideUsed: false };

  const reason = input.overrideReason?.trim() ?? "";
  if (input.session.role === "staff") {
    return {
      ok: false,
      error: overdue
        ? "This company has overdue invoices. An admin or superadmin must approve an override."
        : "This booking would exceed the company credit limit. An admin or superadmin must approve an override.",
      assessment
    };
  }
  if (reason.length < 5) {
    return { ok: false, error: "Enter an override reason of at least 5 characters.", assessment };
  }
  if (reason.length > 500) {
    return { ok: false, error: "Credit override reason is too long.", assessment };
  }

  await recordAuditLog({
    actorId: input.session.userId,
    actorEmail: input.session.email,
    action: "company_account.credit_override",
    entityType: "company_account",
    entityId: input.companyId,
    summary: `Approved company credit override for ${input.relatedReference ?? input.relatedEntityType}.`,
    context: {
      companyId: input.companyId,
      reason,
      role: input.session.role,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId ?? null,
      relatedReference: input.relatedReference ?? null,
      exposureUgx: assessment.total_credit_exposure_ugx,
      projectedAdditionalUgx: projectedAdditional,
      projectedExposureUgx: projectedExposure,
      creditLimitUgx: assessment.credit_limit_ugx,
      overdueInvoicesUgx: assessment.overdue_invoices_ugx,
      overLimit,
      overdue
    }
  });

  return { ok: true, assessment, overrideUsed: true };
}
