import type { Metadata, Viewport } from "next";
import { Permanent_Marker, Saira, Tiny5 } from "next/font/google";
import { HelpProvider } from "@/components/help/help";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { APP_NAME, getConfig } from "@/server/queries/config";
import "./globals.css";

// Saira variável com eixo de largura: corpo normal e títulos condensados como no cartaz.
const saira = Saira({ subsets: ["latin"], axes: ["wdth"], variable: "--font-saira", display: "swap" });
// Fonte pixel com espaço para acentos (na Press Start 2P, "NÃO" virava "NAO").
const pixel = Tiny5({ subsets: ["latin"], weight: "400", variable: "--font-pixel", display: "swap" });
const marker = Permanent_Marker({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-marker",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const config = await getConfig();
  const name = config?.name ?? APP_NAME;
  return {
    title: { default: name, template: `%s · ${name}` },
    description: config?.description || `Inscrição e credenciamento da ${name}.`,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#080808",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const config = await getConfig();
  return (
    <html lang="pt-BR" className={cn(saira.variable, pixel.variable, marker.variable)}>
      <body className="min-h-dvh antialiased">
        <Providers>
          {/* WhatsApp de ajuda da organização: disponível em todas as telas, inclusive nas de erro. */}
          <HelpProvider phone={config?.helpWhatsapp ?? null} eventName={config?.name ?? ""}>
            {children}
          </HelpProvider>
        </Providers>
        <Toaster />
      </body>
    </html>
  );
}
