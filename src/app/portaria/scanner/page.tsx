import type { Metadata } from "next";
import { ScannerScreen } from "@/components/gate/scanner-screen";
import { requireGateActor } from "@/server/session";

export const metadata: Metadata = { title: "Leitor de QR Code" };

export default async function ScannerPage() {
  await requireGateActor("viewGate");
  return <ScannerScreen />;
}
