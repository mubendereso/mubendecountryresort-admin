import { listContactSubmissions } from "@/lib/contacts/data";
import { InboxClient } from "./inbox-client";

export default async function InboxPage() {
  const contacts = await listContactSubmissions();
  return <InboxClient initialContacts={contacts} />;
}
