import type { Metadata } from "next";
import { OfflineSnapshotClient } from "./offline-snapshot-client";

export const metadata: Metadata = {
  title: "Offline"
};

export default function OfflinePage() {
  return <OfflineSnapshotClient />;
}
