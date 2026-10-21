/**
 * Os mesmos testes de ponta a ponta na festa das servidoras e servidores (o
 * build e o servidor de teste sobem nessa edição). Funciona no Windows, onde o
 * terminal não aceita "VARIAVEL=valor comando".
 *
 *   npm run test:e2e:servidores
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

const cli = join(process.cwd(), "node_modules", "@playwright", "test", "cli.js");
const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_FESTA_EDICAO: "servidores" },
});
child.on("exit", (code) => process.exit(code ?? 1));
