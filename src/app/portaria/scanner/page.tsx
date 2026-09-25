import type { Metadata } from "next";
import { ScannerScreen } from "@/components/gate/scanner-screen";
import { requirePageActor } from "@/server/session";

export const metadata: Metadata = { title: "Leitor de QR Code" };

export default async function ScannerPage() {
  await requirePageActor("checkIn");
  return <ScannerScreen />;
}
