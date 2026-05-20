import { getFrontDeskData } from "@/lib/front-desk/data";
import { FrontDeskClient } from "./front-desk-client";

export default async function FrontDeskPage() {
  const data = await getFrontDeskData();
  return <FrontDeskClient initialData={data} />;
}
