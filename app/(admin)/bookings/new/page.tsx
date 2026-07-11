import { notFound } from "next/navigation";
import { getRoomTypes } from "@/lib/rooms/data";
import { requireApprovedAdminRole } from "@/lib/auth/admin-role";
import { getReservationGroupById } from "@/lib/groups/data";
import { BookingForm } from "../booking-form";
import { listCompanyRoomRatesForCompanies, listCompanySelectOptions } from "@/lib/companies/data";

export default async function NewBookingPage({
  searchParams
}: {
  searchParams: Promise<{ groupId?: string }>;
}) {
  const session = await requireApprovedAdminRole();
  const params = await searchParams;
  const [rooms, group, companies] = await Promise.all([
    getRoomTypes(),
    params.groupId ? getReservationGroupById(params.groupId) : Promise.resolve(null),
    listCompanySelectOptions()
  ]);
  const rates = await listCompanyRoomRatesForCompanies(companies.map((company) => company.id));

  if (params.groupId && !group) notFound();

  const roomOptions = rooms
    .filter((r) => r.is_published && !r.archived_at)
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      priceUgx: Number(r.price_ugx)
    }));

  return (
    <BookingForm
      mode="create"
      rooms={roomOptions}
      role={session.role}
      companies={companies.map((company) => ({
        id: company.id,
        companyName: company.company_name,
        isActive: company.is_active,
        isSuspended: company.is_suspended,
        creditStatus: company.credit_status,
        availableCreditUgx: company.available_credit_ugx,
        overdueInvoicesUgx: company.overdue_invoices_ugx
      }))}
      corporateRates={rates.filter((rate) => rate.status === "active").map((rate) => ({
        id: rate.id,
        companyAccountId: rate.company_account_id,
        roomTypeSlug: rate.room_type_slug,
        rateUgx: rate.rate_ugx,
        validFrom: rate.valid_from,
        validTo: rate.valid_to
      }))}
      group={
        group
          ? {
              id: group.id,
              reference: group.reference,
              groupName: group.group_name,
              status: group.status,
              companyAccountId: group.company_account_id,
              companyName: group.company_name
            }
          : undefined
      }
    />
  );
}
