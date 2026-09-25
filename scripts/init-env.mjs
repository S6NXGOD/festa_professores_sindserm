// Gera (ou completa) o .env.local com segredos aleatórios.
// Uso: npm run env:init            -> cria .env.local a partir do .env.example
//      DATABASE_URL="..." npm run env:init  -> já grava a URL informada
//      npm run env:secrets         -> só mostra segredos novos (para colar no Railway)
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";

const target = ".env.local";

const generated = {
  BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
  DATA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  SETUP_TOKEN: randomBytes(18).toString("base64url"),
};

if (process.argv.includes("--print")) {
  // Segredos novos para a hospedagem (não grava nada). Guarde o DATA_ENCRYPTION_KEY:
  // trocar depois invalida os links dos vouchers e os documentos já enviados.
  console.log("Cole em Variables (Raw Editor) do serviço no Railway:\n");
  for (const [key, value] of Object.entries(generated)) console.log(`${key}="${value}"`);
  process.exit(0);
}

const example = readFileSync(".env.example", "utf8");

const alreadyExists = existsSync(target);
const current = alreadyExists ? parseEnv(readFileSync(target, "utf8")) : {};
const lines = [];
const added = [];

for (const line of example.split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=/.exec(line);
  if (!match) {
    lines.push(line);
    continue;
  }
  const key = match[1];
  let value = current[key];
  if (value === undefined || value === "") {
    if (key === "DATABASE_URL" && process.env.DATABASE_URL) value = process.env.DATABASE_URL;
    else if (key in generated) value = generated[key];
    else value = parseEnv(line)[key] ?? "";
    added.push(key);
  }
  lines.push(`${key}="${value}"`);
}

// Mantém variáveis extras que já existiam no arquivo
for (const [key, value] of Object.entries(current)) {
  if (!lines.some((l) => l.startsWith(`${key}=`))) lines.push(`${key}="${value}"`);
}

writeFileSync(target, lines.join("\n"));
console.log(`.env.local ${alreadyExists ? "atualizado" : "criado"}.`);
if (added.length) console.log(`Variáveis definidas agora: ${added.join(", ")}`);
if ((parseEnv(lines.join("\n")).DATABASE_URL ?? "").includes("USUARIO:SENHA")) {
  console.log("Atenção: edite DATABASE_URL no .env.local com as credenciais do seu PostgreSQL.");
}
const finalEnv = parseEnv(lines.join("\n"));
console.log(`SETUP_TOKEN (necessário para criar o primeiro admin em /setup): ${finalEnv.SETUP_TOKEN}`);
