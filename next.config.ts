import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// CSP sem dependências externas: fontes são servidas pelo próprio Next (next/font).
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Mapa do local (Google Maps embutido, carregado só quando a pessoa pede).
  "frame-src https://www.google.com https://maps.google.com",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "media-src 'self' blob: mediastream:",
  "worker-src 'self' blob:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // A câmera é usada apenas pelo leitor de QR da portaria.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/*
 * Documentos da ficha (RG e contracheque): o PDF abre no visualizador do
 * navegador, que o Chrome bloqueia com "object-src 'none'". Esta rota só serve
 * arquivos (foto ou PDF) e ganha uma política própria, sem scripts.
 */
const documentHeaders = [
  {
    key: "Content-Security-Policy",
    value: "default-src 'none'; object-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'none'",
  },
  ...securityHeaders.filter((header) => header.key !== "Content-Security-Policy"),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // O selo "N" do modo de desenvolvimento cobria o rodapé do menu do painel.
  devIndicators: false,
  // Quem pede /favicon.ico direto (favoritos, leitores de link) recebe o ícone atual do site.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icone?s=48" }];
  },
  async headers() {
    return [
      { source: "/:path((?!api/documentos/).*)", headers: securityHeaders },
      { source: "/api/documentos/:id", headers: documentHeaders },
    ];
  },
};

export default nextConfig;
