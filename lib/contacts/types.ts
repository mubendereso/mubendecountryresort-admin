export type ContactStatus = "new" | "read" | "archived";

export type ContactSubmission = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  status: ContactStatus;
  notes: string | null;
  created_at: string; // ISO 8601 UTC string
};
