import { chromium, devices, expect, type Page, test } from "@playwright/test";
import sharp from "sharp";
import { E2E } from "./env";
import { writeQrVideo } from "./helpers/qr-video";

/**
 * Fluxos essenciais de ponta a ponta (rodam em sequência no mesmo banco):
 * 1. configurar (festa + local com foto) → inscrição de professor(a) com Player 2
 *    sem CPF → conferir filiação → escanear QR (câmera) → entrada (o kit sai junto).
 * 2. não filiado(a) preenche a ficha online (com RG e contracheque) → assina na recepção → entra (pelo aviso "já pode entrar").
 * 3. WhatsApp de ajuda → estoque dos funcionários → funcionária com convidado (e lista colada) → vouchers →
 *    convidado chega antes (kit espera) → funcionária chega (2 kits) → estoque acaba e o kit sai pelo botão.
 * 4. Perfis de acesso (visitante, Segurança, Atendimento, Administrador) e /api/health.
 */

const ADMIN = { name: "Ana Administradora Lima", email: "admin@e2e.test", password: "senha-admin-123" };
const ATTENDANT = { name: "Paulo Atendente Rocha", email: "atendimento@e2e.test", password: "senha-atend-123" };
const SECURITY = { name: "Sergio Seguranca Alves", email: "seguranca@e2e.test", password: "senha-segur-123" };

const MEMBER = {
  name: "Maria Aparecida Souza",
  cpf: "52998224725",
  whatsapp: "86999998888",
  registrationNumber: "12345-6",
  workplace: "Escola Municipal Centro",
};
/** Convidada criança, sem CPF (o CPF do convidado é opcional). */
const GUEST = { name: "Luiza Souza Lima", minor: true };
const VENUE = {
  name: "Clube dos Servidores Municipais",
  address: "Av. Frei Serafim, 2280 — Centro, Teresina",
  maps: "https://www.google.com/maps/place/Teresina/@-5.0892,-42.8016,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-5.0892!4d-42.8016",
};

const NEW_MEMBER = {
  name: "Beatriz Nova Filiada",
  cpf: "11144477735",
  rg: "1234567",
  birthDate: "1990-05-10",
  mother: "Ana Maria Souza",
  whatsapp: "86988887777",
  email: "beatriz@exemplo.com",
  address: "Rua das Flores",
  number: "100",
  neighborhood: "Centro",
  workplace: "Escola Municipal Norte",
  registrationNumber: "77777-1",
  job: "Professora",
  admission: "2015-03-01",
};

/** Funcionária do SINDSERM liberada para a festa, com o convidado dela. */
const STAFF = { name: "Rosa Financeiro Lima", job: "Financeiro", guest: "Caio Convidado Lima" };
/** Número de ajuda passado pela organização (fixo, 8 dígitos depois do DDD). */
const HELP_WHATSAPP = "8695361455";
/** PDF mínimo (o servidor só confere o cabeçalho). */
const TEST_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");

/** Data/hora local de São Paulo no formato de <input type="datetime-local">. */
function localInput(date: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto("/entrar");
  await page.fill("#email", user.email);
  await page.fill("#password", user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/entrar"));
  await page.waitForLoadState("networkidle");
  if (new URL(page.url()).pathname === "/conta") {
    // Senha provisória (usuário criado pelo administrador): cria a própria para seguir.
    const own = `${user.password}-propria`;
    await expect(page.getByTestId("forced-password-notice")).toBeVisible();
    await page.fill("#current-password", user.password);
    await page.fill("#new-password", own);
    await page.fill("#confirm-password", own);
    await page.getByTestId("change-password-submit").click();
    await page.waitForURL((url) => url.pathname !== "/conta");
    user.password = own;
  }
}

/** A festa do teste é daqui a 20 dias: a portaria vê o aviso e confirma a entrada antecipada. */
async function confirmEarlyEntry(page: Page) {
  const dialog = page.getByTestId("early-entry-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("A festa ainda não começou");
  await dialog.getByTestId("early-entry-confirm").click();
}

async function createStaffUser(admin: Page, user: typeof ATTENDANT, roleLabel: RegExp) {
  await admin.getByRole("button", { name: "Novo usuário" }).click();
  await admin.fill("#user-name", user.name);
  await admin.fill("#user-email", user.email);
  await admin.fill("#user-password", user.password);
  await admin.getByRole("radio", { name: roleLabel }).click();
  await admin.getByRole("button", { name: "Criar usuário" }).click();
  await expect(admin.getByText(user.email)).toBeVisible();
}

async function openPersonAtGate(page: Page, query: string, expectedName: string) {
  await page.goto("/portaria");
  await page.getByTestId("gate-search-input").fill(query);
  await page.getByTestId("gate-search-result").filter({ hasText: expectedName }).first().click();
  await expect(page.getByTestId("gate-person-name")).toHaveText(expectedName);
}

test.describe.serial("festa das professoras e professores", () => {
  test("configurar → inscrever → conferir → escanear → entrada com kit", async ({ browser }, testInfo) => {
    test.setTimeout(300_000);
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    const tokens: string[] = [];

    await test.step("bootstrap seguro do primeiro administrador", async () => {
      await admin.goto("/");
      await expect(admin.getByRole("heading", { name: "Inscrições em breve" })).toBeVisible();
      await admin.goto("/setup");
      await admin.fill("#setupToken", "token-errado-123456");
      await admin.fill("#name", ADMIN.name);
      await admin.fill("#email", ADMIN.email);
      await admin.fill("#password", ADMIN.password);
      await admin.fill("#passwordConfirmation", ADMIN.password);
      await admin.getByRole("button", { name: "Criar administrador" }).click();
      await expect(admin.getByText("Token inválido")).toBeVisible();
      await admin.fill("#setupToken", E2E.setupToken);
      await admin.getByRole("button", { name: "Criar administrador" }).click();
      await admin.waitForURL("**/setup/evento");
    });

    await test.step("wizard de configuração da festa (com horário limite dos kits)", async () => {
      const eventDay = new Date(Date.now() + 20 * 86_400_000);
      await admin.fill("#event-name", "Festa das Professoras e Professores – SINDSERMTHE E2E");
      // Prévia do topo: o que vem depois do travessão vira a chamada.
      await expect(admin.getByTestId("event-name-preview")).toContainText("SINDSERMTHE E2E");
      await admin.fill("#event-description", "Evento de teste automatizado.");
      await admin.fill("#event-date", localInput(eventDay).slice(0, 10));
      await admin.fill("#event-start", "19:00");
      await admin.fill("#event-end", "23:00");
      await admin.getByTestId("setup-next").click();
      await admin.fill("#reg-opens", localInput(new Date(Date.now() - 86_400_000)));
      await admin.fill("#reg-closes", localInput(new Date(Date.now() + 10 * 86_400_000)));
      await admin.getByTestId("setup-next").click();
      await admin.fill("#stock-all", "150");
      await expect(admin.locator("#stock-threshold")).toHaveValue("15");
      await admin.fill("#kit-deadline", "22:30");
      await admin.getByTestId("setup-next").click();
      await expect(admin.getByText("Festa das Professoras e Professores – SINDSERMTHE E2E")).toBeVisible();
      await expect(admin.getByText("22h30")).toBeVisible();
      await admin.getByTestId("finish-setup").click();
      await admin.waitForURL("**/painel");
      await expect(admin.getByTestId("stat-kits-available")).toHaveText("150");
    });

    await test.step("administrador cria usuários de atendimento e segurança", async () => {
      await admin.goto("/painel/usuarios");
      await createStaffUser(admin, ATTENDANT, /^Atendimento/);
      await createStaffUser(admin, SECURITY, /^Segurança/);
    });

    await test.step("local da festa: dados, link do Maps e foto", async () => {
      await admin.goto("/painel/configuracoes");
      await admin.fill("#venue-name", VENUE.name);
      await admin.fill("#venue-address", VENUE.address);
      await admin.fill("#venue-description", "Estacionamento gratuito.\nEntrada acessível pela lateral.");
      await admin.fill("#venue-maps", "https://exemplo.com/nao-e-maps");
      await admin.getByTestId("save-venue").click();
      await expect(admin.getByText("Cole um link do Google Maps")).toBeVisible();
      await admin.fill("#venue-maps", VENUE.maps);
      await admin.getByTestId("save-venue").click();
      await expect(admin.getByText("Local da festa salvo.")).toBeVisible();
      const photo = await sharp({ create: { width: 2000, height: 1250, channels: 3, background: "#e3000f" } }).jpeg().toBuffer();
      await admin.getByTestId("venue-photo-input").setInputFiles({ name: "local.jpg", mimeType: "image/jpeg", buffer: photo });
      await expect(admin.getByText("Foto do local atualizada.")).toBeVisible();

      const visitor = await browser.newContext({ ...devices["Pixel 7"] });
      const page = await visitor.newPage();
      await page.goto("/");
      const section = page.getByTestId("venue-section");
      await expect(section).toContainText(VENUE.name);
      await expect(section).toContainText(VENUE.address);
      await expect(page.getByTestId("venue-open-maps")).toHaveAttribute("href", /google\.com\/maps/);
      // A foto chega reduzida (no máximo 1600 px) e em WEBP.
      const img = section.locator("img").first();
      await expect(img).toHaveAttribute("width", "1600");
      const photoResponse = await page.request.get((await img.getAttribute("src"))!);
      expect(photoResponse.headers()["content-type"]).toBe("image/webp");
      await page.goto("/inscricao");
      await expect(page.getByTestId("venue-compact")).toContainText(VENUE.name);
      await visitor.close();
    });

    await test.step("ícone do site: troca em Configurações e volta ao emblema da festa", async () => {
      await admin.goto("/painel/configuracoes");
      const favicon = admin.locator('link[rel="icon"][sizes="32x32"]');
      const standard = (await favicon.getAttribute("href"))!;
      expect(standard).toMatch(/\/icone\?s=32&v=/);
      await expect(admin.getByTestId("site-icon-default")).toBeVisible();

      const square = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#0a84ff" } }).png().toBuffer();
      await admin.getByTestId("site-icon-input").setInputFiles({ name: "icone.png", mimeType: "image/png", buffer: square });
      await expect(admin.getByText("Ícone do site trocado.")).toBeVisible();
      await expect(admin.getByTestId("site-icon-reset")).toBeVisible();
      await expect(favicon).not.toHaveAttribute("href", standard);
      const href = (await favicon.getAttribute("href"))!;
      const icon = await admin.request.get(href);
      expect(icon.headers()["content-type"]).toBe("image/png");
      expect(icon.headers()["cache-control"]).toContain("immutable");
      // A marca do painel (ao lado do nome da festa) usa o mesmo ícone.
      const version = new URL(href, "http://localhost").searchParams.get("v")!;
      await expect(admin.locator(`aside img[src*="v=${version}"]`)).toBeVisible();

      await admin.getByTestId("site-icon-reset").click();
      await admin.getByRole("button", { name: "Voltar ao emblema", exact: true }).click();
      await expect(admin.getByText("Ícone voltou a ser o emblema da festa.")).toBeVisible();
      await expect(admin.getByTestId("site-icon-default")).toBeVisible();
      await expect(favicon).toHaveAttribute("href", standard);
    });

    await test.step("inscrição pública de professor(a) com o seu Player 2", async () => {
      const context = await browser.newContext({ ...devices["Pixel 7"] });
      const page = await context.newPage();
      await page.goto("/");
      await page.getByTestId("cta-inscricao").click();
      await page.getByTestId("answer-member-no").click();
      await expect(page.getByRole("heading", { name: "Bora entrar para o time?" })).toBeVisible();
      await page.getByRole("button", { name: "Voltar" }).click();
      await page.getByTestId("answer-member-yes").click();

      await page.fill("#member-name", MEMBER.name);
      await page.fill("#member-cpf", MEMBER.cpf);
      await page.fill("#member-whatsapp", MEMBER.whatsapp);
      await page.fill("#member-registration", MEMBER.registrationNumber);
      await page.fill("#member-workplace", MEMBER.workplace);
      // Kit e convidado são só para professoras e professores: a pergunta é obrigatória.
      await page.getByTestId("wizard-next").click();
      await expect(page.getByText("Responda se você é professor(a)")).toBeVisible();
      // Só quem se declara professor(a) é avisado de que isso é conferido na portaria.
      await expect(page.getByTestId("teacher-check-notice")).toHaveCount(0);
      await page.getByTestId("teacher-yes").click();
      await expect(page.getByTestId("teacher-check-notice")).toContainText("na portaria, a equipe confere se você é professor(a)");
      await page.getByTestId("teacher-no").click();
      await expect(page.getByTestId("teacher-check-notice")).toHaveCount(0);
      await page.getByTestId("teacher-yes").click();
      await expect(page.getByTestId("teacher-check-notice")).toBeVisible();
      await page.getByTestId("wizard-next").click();

      await page.getByTestId("guest-yes").click();
      // Nome incompleto: a mensagem aparece no campo (antes o botão não avançava e nada aparecia).
      await page.getByTestId("guest-name").fill("Luiza");
      await page.getByTestId("wizard-next").click();
      await expect(page.getByText("Informe nome e sobrenome")).toBeVisible();
      await page.getByTestId("guest-name").fill(GUEST.name);
      await expect(page.getByText("Informe nome e sobrenome")).toHaveCount(0);
      if (GUEST.minor) await page.locator("label[for=guest-minor]").click();
      // Sem CPF: é opcional para o convidado.
      await page.getByTestId("wizard-next").click();
      await expect(page.getByText("Não informado")).toBeVisible();

      await expect(page.getByTestId("kit-summary")).toContainText(GUEST.name);
      await page.getByTestId("submit-registration").click();
      await expect(page.getByText("É necessário concordar com o aviso de privacidade")).toBeVisible();
      await page.locator("label[for=privacy-consent]").click();
      await page.getByTestId("submit-registration").click();

      await page.waitForURL("**/vouchers/**");
      await expect(page.getByRole("heading", { name: "Você está na pista!" })).toBeVisible();
      await expect(page.getByTestId("voucher-card")).toHaveCount(2);
      await expect(page.getByTestId("voucher-name")).toHaveText([MEMBER.name, GUEST.name]);
      await expect(page.getByTestId("voucher-kits")).toContainText("2 kits de consumação");
      await expect(page.getByTestId("voucher-guest-name")).toHaveText(GUEST.name);
      await expect(page.getByTestId("voucher-guest-kit")).toContainText(`Ele é entregue na recepção depois que ${MEMBER.name} chegar`);
      await expect(page.getByTestId("voucher-kits")).toContainText("o do convidado, depois que você chegar");

      // Logo depois da inscrição, o aviso para salvar os vouchers; baixar o próprio marca 1 de 2 na missão.
      const mission = page.getByTestId("save-mission");
      await expect(mission).toContainText("Agora salve os vouchers no celular");
      const reminder = page.getByTestId("voucher-reminder");
      await expect(reminder).toBeVisible();
      await expect(reminder).toContainText("Não esqueça: salve os vouchers");
      await reminder.getByTestId("reminder-download-member").click();
      await reminder.getByTestId("reminder-later").click();
      await expect(reminder).toHaveCount(0);
      await expect(mission).toContainText("1/2");

      const hrefs = await page.getByTestId("voucher-save").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
      for (const href of hrefs) tokens.push(/\/v\/([0-9A-Z]{32})\/imagem/.exec(href)?.[1] ?? "");
      expect(tokens.filter(Boolean)).toHaveLength(2);

      // O QR não contém dados pessoais: somente o prefixo e o token aleatório.
      const svg = await page.getByTestId("voucher-card").first().locator("svg").first().innerHTML();
      expect(svg).not.toContain(MEMBER.cpf);

      const image = await page.request.get(`/v/${tokens[0]}/imagem`);
      expect(image.headers()["content-type"]).toContain("image/png");
      await context.close();
    });

    await test.step("atendimento confirma a filiação na fila de conferência (em Inscrições)", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, ATTENDANT);
      // O menu mostra a fila em Inscrições, e a página abre direto nela quando há o que conferir.
      await expect(page.getByTestId("nav-badge-pending").first()).toHaveText("1");
      await page.goto("/painel/inscricoes");
      await expect(page.getByTestId("chip-conferir")).toHaveAttribute("aria-current", "page");
      const item = page.getByTestId("queue-item").filter({ hasText: MEMBER.name });
      await expect(item).toContainText("529.982.247-25");
      await item.getByTestId("queue-confirm").click();
      await page.getByTestId("confirm-dialog-action").click();
      await expect(page.getByText(`Filiação de ${MEMBER.name} confirmada.`)).toBeVisible();
      await expect(page.getByTestId("queue-item")).toHaveCount(0);
      await expect(page.getByText("Fila zerada")).toBeVisible();
      await expect(page.getByTestId("nav-badge-pending")).toHaveCount(0);
      // O endereço antigo da conferência continua levando à fila.
      await page.goto("/painel/conferencia");
      await expect(page).toHaveURL(/\/painel\/inscricoes\?filtro=conferir$/);
      await context.close();
    });

    await test.step("convidada chega antes da professora: entra, mas o kit dela espera", async () => {
      const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
      const page = await context.newPage();
      await login(page, ATTENDANT);
      await openPersonAtGate(page, "Luiza", GUEST.name);
      // Decisão rápida: quem convidou, o que acontece com o kit e o botão fixo no pé da tela.
      await expect(page.getByTestId("gate-person-role")).toHaveText(`Convidado(a) de ${MEMBER.name}`);
      await expect(page.getByTestId("kit-on-entry")).toContainText("Fica para depois");
      await expect(page.getByTestId("kit-on-entry")).toContainText(`O kit deste convidado sai quando ${MEMBER.name} chegar.`);
      await expect(page.getByTestId("gate-details").getByRole("button", { name: /Detalhes/ })).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByTestId("confirm-entry")).toBeInViewport();
      await expect(page.getByTestId("confirm-entry")).not.toContainText("kit");
      await page.getByTestId("confirm-entry").click();
      await confirmEarlyEntry(page);
      await expect(page.getByTestId("gate-status-title")).toHaveText("ENTRADA CONFIRMADA");
      const banner = page.getByTestId("entry-kit-result");
      await expect(banner).toContainText("Kit fica para depois");
      await expect(banner).toContainText(`Sai quando ${MEMBER.name} chegar.`);
      await context.close();
    });

    await test.step("segurança lê o QR pela câmera: a professora entra e saem os 2 kits", async () => {
      const video = testInfo.outputPath("qr-professora.y4m");
      writeQrVideo(video, `SFP1:${tokens[0]}`);
      const cameraBrowser = await chromium.launch({
        args: [
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
          `--use-file-for-fake-video-capture=${video}`,
        ],
      });
      try {
        const context = await cameraBrowser.newContext({
          baseURL: E2E.baseURL,
          permissions: ["camera"],
          viewport: { width: 412, height: 915 },
          locale: "pt-BR",
          timezoneId: "America/Sao_Paulo",
        });
        const page = await context.newPage();
        await login(page, SECURITY);
        await expect(page).toHaveURL(/\/portaria$/);
        await page.getByTestId("open-scanner").click();

        // A leitura apenas identifica a pessoa; a entrada exige confirmação.
        await expect(page.getByTestId("gate-status-title")).toHaveText("LIBERADO PARA ENTRADA", { timeout: 45_000 });
        await expect(page.getByTestId("gate-person-name")).toHaveText(MEMBER.name);
        // Professor(a) é autodeclarado(a): a portaria é lembrada de conferir.
        await expect(page.getByTestId("teacher-check-reminder")).toBeVisible();
        // A convidada já está lá dentro: o kit dela sai junto com a chegada da professora.
        const kitTile = page.getByTestId("kit-on-entry");
        await expect(kitTile).toContainText("Entregue 2 kits");
        await expect(kitTile).toContainText(`O de Maria e o do convidado ${GUEST.name}, que já entrou`);
        // O botão de confirmar já aparece na tela, sem rolar (barra fixa no pé).
        await expect(page.getByTestId("confirm-entry")).toBeInViewport();
        await expect(page.getByTestId("deliver-member-kit")).toHaveCount(0);
        await expect(page.getByTestId("confirm-entry")).toHaveText(/Confirmar entrada \+ 2 kits/);
        await page.getByTestId("confirm-entry").click();
        await confirmEarlyEntry(page);
        await expect(page.getByTestId("gate-status-title")).toHaveText("ENTRADA CONFIRMADA");
        const banner = page.getByTestId("entry-kit-result");
        await expect(banner).toContainText("Entregue 2 kits!");
        await expect(banner).toContainText(`Kit do convidado ${GUEST.name}, que já entrou`);
        await expect(page.getByTestId("scanner-combo")).toHaveText("COMBO x1");

        // Sem tocar em nada, o leitor reabre sozinho; o mesmo QR lido de novo não registra uma segunda entrada.
        await expect(page.getByTestId("auto-next-hint")).toBeVisible();
        await expect(page.getByTestId("gate-status-title")).toHaveText("ENTRADA JÁ REGISTRADA", { timeout: 45_000 });
        await expect(page.getByTestId("confirm-entry")).toHaveCount(0);
        await expect(page.getByTestId("auto-next-hint")).toHaveCount(0);
        await context.close();
      } finally {
        await cameraBrowser.close();
      }
    });

    await test.step("no cadastro da professora, os dois kits aparecem entregues", async () => {
      const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
      const page = await context.newPage();
      await login(page, ATTENDANT);

      await openPersonAtGate(page, "Maria Aparecida", MEMBER.name);
      await expect(page.getByTestId("gate-status-title")).toHaveText("ENTRADA JÁ REGISTRADA");
      await expect(page.getByText("Kits até 22:30")).toBeVisible();
      const gateResult = page.getByTestId("gate-result");
      await expect(gateResult.getByText(/Seu kit: Entregue/)).toBeVisible();
      await expect(gateResult.getByText(/Kit do convidado \(Luiza Souza Lima\): Entregue/)).toBeVisible();
      await expect(page.getByTestId("deliver-member-kit")).toHaveCount(0);
      await expect(page.getByTestId("deliver-guest-kit")).toHaveCount(0);

      await openPersonAtGate(page, "Luiza", GUEST.name);
      await expect(page.getByTestId("gate-result")).toContainText("Kit de consumação do convidado");
      await expect(page.getByTestId("gate-result").getByText(/^Entregue /)).toBeVisible();

      // Da portaria, um toque volta ao painel.
      await page.getByTestId("back-to-panel").click();
      await expect(page).toHaveURL(/\/painel$/);
      await context.close();
    });

    await test.step("placar reflete presença, entregas e estoque", async () => {
      await admin.goto("/painel");
      await expect(admin.getByTestId("stat-present")).toHaveText("2");
      await expect(admin.getByTestId("stat-kits-delivered")).toHaveText("2");
      await expect(admin.getByTestId("stat-kits-available")).toHaveText("148");
      await expect(admin.getByTestId("stat-confirmed")).toHaveText("1");
      await expect(admin.getByTestId("stat-teachers")).toHaveText("1");
      await expect(admin.getByTestId("stat-kits-owed")).toHaveText("0");
      await expect(admin.getByTestId("stock-forecast-all")).toContainText("Previsão com os inscritos: 2 kits");
      // Vouchers do grupo (professora + convidada) numa folha só, para imprimir.
      await admin.goto("/painel/inscricoes");
      await admin.getByTestId("registration-row").filter({ hasText: MEMBER.name }).first().click();
      await admin.getByTestId("print-group-vouchers").click();
      await expect(admin.getByTestId("registration-vouchers").getByTestId("voucher-card")).toHaveCount(2);
      await admin.goto("/painel/auditoria");
      const auditEntries = (label: string) => admin.locator("summary").filter({ has: admin.getByText(label, { exact: true }) });
      await expect(auditEntries("Kit entregue")).toHaveCount(2);
      await expect(auditEntries("Entrada registrada")).toHaveCount(2);
      // A entrada registra também os kits que saíram com ela.
      await expect(auditEntries("Entrada registrada").filter({ hasText: "O kit fica para a chegada de" })).toHaveCount(1);
      await expect(auditEntries("Entrada registrada").filter({ hasText: "com kit entregue" })).toHaveCount(1);
      await expect(auditEntries("Entrada registrada").filter({ hasText: `Kit do convidado ${GUEST.name} entregue junto` })).toHaveCount(1);
    });

    await adminContext.close();
  });

  test("ficha de filiação online → assinatura na recepção → entrada", async ({ browser }) => {
    test.setTimeout(240_000);

    await test.step("não filiado(a) preenche a ficha antes da festa", async () => {
      const context = await browser.newContext({ ...devices["Pixel 7"] });
      const page = await context.newPage();
      await page.goto("/inscricao");
      await page.getByTestId("answer-member-no").click();
      await page.getByTestId("choose-ficha").click();

      await page.fill("#f-name", NEW_MEMBER.name);
      await page.fill("#f-cpf", NEW_MEMBER.cpf);
      await page.fill("#f-rg", NEW_MEMBER.rg);
      await page.fill("#f-birth", NEW_MEMBER.birthDate);
      await page.fill("#f-mother", NEW_MEMBER.mother);
      await page.fill("#f-whatsapp", NEW_MEMBER.whatsapp);
      await page.fill("#f-email", NEW_MEMBER.email);
      await page.getByTestId("wizard-next").click();

      await page.fill("#f-address", NEW_MEMBER.address);
      await page.fill("#f-number", NEW_MEMBER.number);
      await page.fill("#f-neighborhood", NEW_MEMBER.neighborhood);
      await page.fill("#f-workplace", NEW_MEMBER.workplace);
      // Mesma matrícula da professora do outro fluxo, digitada sem pontuação: deve ser recusada.
      await page.fill("#f-registration", MEMBER.registrationNumber.replace(/\D/g, ""));
      await page.fill("#f-job", NEW_MEMBER.job);
      await page.fill("#f-admission", NEW_MEMBER.admission);
      await page.getByTestId("teacher-yes").click();
      await page.getByTestId("wizard-next").click();

      await page.locator("label[for=authorization]").click();
      await page.getByTestId("wizard-next").click();
      await page.getByTestId("guest-no").click();
      await page.getByTestId("wizard-next").click();

      // Documentos: sem a cópia do RG e do contracheque, a ficha não avança.
      await expect(page.getByTestId("doc-rg")).toBeVisible();
      await page.getByTestId("wizard-next").click();
      await expect(page.getByText("Anexe a foto do RG (frente e verso)")).toBeVisible();
      await expect(page.getByText("Anexe o contracheque")).toBeVisible();
      const side = (background: string) => sharp({ create: { width: 1600, height: 1000, channels: 3, background } }).jpeg().toBuffer();
      await page.getByTestId("doc-rg-input").setInputFiles([
        { name: "rg-frente.jpg", mimeType: "image/jpeg", buffer: await side("#1d4ed8") },
        { name: "rg-verso.jpg", mimeType: "image/jpeg", buffer: await side("#15803d") },
      ]);
      await expect(page.getByTestId("doc-rg").getByRole("img", { name: /^RG \d$/ })).toHaveCount(2);
      await page.getByTestId("doc-payslip-input").setInputFiles({ name: "contracheque.pdf", mimeType: "application/pdf", buffer: TEST_PDF });
      await expect(page.getByTestId("doc-payslip")).not.toContainText("Falta");
      await expect(page.getByText("Anexe o contracheque")).toHaveCount(0);
      await page.getByTestId("wizard-next").click();

      await page.locator("label[for=privacy-consent]").click();
      await page.getByTestId("submit-registration").click();

      // Volta para a etapa do trabalho com o erro no campo da matrícula; os documentos continuam anexados.
      await expect(page.getByText("Matrícula já cadastrada para outra pessoa.").first()).toBeVisible();
      await expect(page.locator("#f-registration")).toBeVisible();
      await page.fill("#f-registration", NEW_MEMBER.registrationNumber);
      await page.getByTestId("wizard-next").click();
      await expect(page.getByTestId("authorization-accept")).toBeVisible();
      await page.getByTestId("wizard-next").click();
      await expect(page.getByTestId("guest-no")).toBeVisible();
      await page.getByTestId("wizard-next").click();
      await expect(page.getByTestId("doc-rg").getByRole("img", { name: /^RG \d$/ })).toHaveCount(2);
      await page.getByTestId("wizard-next").click();
      await expect(page.getByTestId("signature-summary")).toBeVisible();
      await page.getByTestId("submit-registration").click();

      await page.waitForURL("**/vouchers/**");
      await expect(page.getByRole("heading", { name: "Ficha gravada!" })).toBeVisible();
      await expect(page.getByTestId("awaiting-signature-note")).toContainText("Te esperamos na festa!");
      await expect(page.getByTestId("voucher-card")).toHaveCount(1);
      await expect(page.getByTestId("voucher-signature")).toBeVisible();
      await context.close();
    });

    await test.step("na recepção: ficha assinada e entrada liberada", async () => {
      const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
      const page = await context.newPage();
      await login(page, ATTENDANT);

      // A ficha do site entra na fila de assinatura de Fichas de filiação, com os documentos em dia.
      await page.goto("/painel/filiacoes");
      await expect(page.getByTestId("chip-assinar")).toHaveAttribute("aria-current", "page");
      const signatureItem = page.getByTestId("signature-item").filter({ hasText: NEW_MEMBER.name });
      await expect(signatureItem.getByTestId("signature-documents")).toContainText("RG");
      await expect(signatureItem.getByTestId("signature-documents")).toContainText("Contracheque");
      await expect(signatureItem.getByTestId("queue-signature")).toBeVisible();
      await expect(signatureItem.getByTestId("queue-attach")).toHaveCount(0);

      await openPersonAtGate(page, "Beatriz", NEW_MEMBER.name);
      await expect(page.getByTestId("gate-status-title")).toHaveText("FALTA ASSINAR A FICHA DE FILIAÇÃO");
      await expect(page.getByTestId("confirm-entry")).toHaveCount(0);

      // O RG e o contracheque enviados pelo site aparecem na tela da assinatura (só para a equipe).
      await expect(page.getByTestId("gate-missing-documents")).toHaveCount(0);
      const rgThumb = page.getByTestId("form-doc-rg").locator("img").first();
      await expect(rgThumb).toBeVisible();
      await expect.poll(() => rgThumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(page.getByTestId("form-doc-payslip")).toContainText("PDF");
      const anonymous = await browser.newContext();
      const denied = await anonymous.request.get(new URL((await rgThumb.getAttribute("src"))!, E2E.baseURL).toString());
      expect(denied.ok()).toBe(false);
      expect(denied.headers()["content-type"] ?? "").not.toContain("image/");
      await anonymous.close();

      await page.getByTestId("confirm-signature").click();
      await page.getByTestId("confirm-dialog-action").click();
      await expect(page.getByText("Filiação registrada. Bem-vindo(a) ao SINDSERM!")).toBeVisible();
      await expect(page.getByTestId("gate-status-title")).toHaveText("LIBERADO PARA ENTRADA");
      // Assinou: a tela já puxa o registro da entrada, para ninguém esquecer.
      const prompt = page.getByTestId("entry-prompt");
      await expect(prompt).toContainText("Beatriz já pode entrar!");
      await expect(prompt.getByTestId("prompt-kit")).toContainText("Entregue 1 kit");
      await prompt.getByTestId("prompt-confirm-entry").click();
      await confirmEarlyEntry(page);
      await expect(prompt).toHaveCount(0);
      await expect(page.getByTestId("gate-status-title")).toHaveText("ENTRADA CONFIRMADA");
      await expect(page.getByTestId("entry-kit-result")).toContainText("Entregue 1 kit!");

      await page.goto("/painel");
      await expect(page.getByTestId("stat-joined")).toHaveText("1");
      await expect(page.getByTestId("stat-signature")).toHaveText("0");
      await expect(page.getByTestId("stat-present")).toHaveText("3");
      await expect(page.getByTestId("stat-kits-delivered")).toHaveText("3");
      await context.close();
    });
  });

  test("funcionários do SINDSERM: voucher próprio, convidado e kits do estoque dos funcionários; WhatsApp de ajuda", async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
    const admin = await context.newPage();
    await login(admin, ADMIN);

    await test.step("WhatsApp de ajuda: configurado no painel, aparece na inscrição", async () => {
      await admin.goto("/painel/configuracoes");
      await admin.fill("#help-whatsapp", HELP_WHATSAPP);
      await admin.getByTestId("save-help").click();
      await expect(admin.getByText("WhatsApp de ajuda salvo.")).toBeVisible();

      const visitor = await browser.newContext({ ...devices["Pixel 7"] });
      const page = await visitor.newPage();
      await page.goto("/inscricao");
      const help = page.getByTestId("help-button");
      await expect(help).toBeVisible();
      await expect(help).toHaveAttribute("href", /^https:\/\/wa\.me\/558695361455\?text=Ol%C3%A1!/);
      await expect(page.getByTestId("help-line").first()).toContainText("(86) 9536-1455");
      await visitor.close();
    });

    const setEmployeeStock = async (total: string) => {
      await admin.goto("/painel/kits");
      await admin.fill("#stock-employee", total);
      await admin.getByRole("button", { name: "Salvar estoque" }).click();
      await expect(admin.getByText("Estoque atualizado.")).toBeVisible();
    };

    await test.step("estoque de kits separado para os funcionários", async () => {
      await setEmployeeStock("5");
    });

    await test.step("administrador libera funcionários (com convidado) um a um e colando a lista", async () => {
      await admin.goto("/painel/colaboradores");
      await admin.getByTestId("add-employee").click();
      await admin.fill("#employee-name", STAFF.name);
      await admin.fill("#employee-job", STAFF.job);
      await admin.getByTestId("employee-guest-toggle").click();
      await admin.getByTestId("employee-guest-name").fill(STAFF.guest);
      await admin.getByTestId("save-employee").click();
      const row = admin.getByTestId("employee-row").filter({ hasText: STAFF.name });
      await expect(row).toBeVisible();
      await expect(row.getByTestId("employee-guest")).toContainText(STAFF.guest);

      await admin.getByTestId("bulk-employees").click();
      // A lista colada inteira é de prestadores de serviço (mesma regra, voucher com a categoria).
      await admin.getByTestId("category-CONTRACTOR").click();
      await admin.getByTestId("bulk-employees-text").fill("1. Bruno Financeiro Costa; Financeiro; Beto Costa Filho\n2. Clara Juridico Dias - Jurídico");
      await expect(admin.getByTestId("bulk-preview")).toContainText("convidado: Beto Costa Filho");
      await admin.getByTestId("save-bulk-employees").click();
      await expect(admin.getByTestId("employee-row")).toHaveCount(3);
      await expect(admin.getByTestId("employee-row").filter({ hasText: "Bruno Financeiro Costa" })).toContainText("Prestador(a) de serviço");
      await expect(admin.getByTestId("employee-row").filter({ hasText: STAFF.name })).toContainText("Funcionário(a)");
      await admin.getByTestId("category-filter").getByText("Prestador(a) de serviço").click();
      await expect(admin.getByTestId("employee-row")).toHaveCount(2);
      await admin.getByTestId("category-filter").getByText("Todas as categorias").click();
      await expect(admin.getByTestId("employee-row")).toHaveCount(3);
      await expect(admin.getByTestId("stat-employees")).toHaveText("3");
      await expect(admin.getByTestId("stat-employee-guests")).toHaveText("2");
      await expect(admin.getByTestId("stat-employee-stock")).toHaveText("5");
    });

    await test.step("voucher do funcionário (dourado) e o do convidado, para mandar numa mensagem só", async () => {
      await admin.getByRole("link", { name: `Vouchers de ${STAFF.name}` }).click();
      const cards = admin.getByTestId("voucher-card");
      await expect(cards).toHaveCount(2);
      await expect(cards.first()).toHaveAttribute("data-kind", "employee");
      await expect(admin.getByTestId("voucher-job")).toContainText(`Funcionário(a) do SINDSERM · ${STAFF.job}`);
      await expect(admin.getByTestId("voucher-employee-kit")).toContainText("2 kits de consumação");
      await expect(cards.nth(1)).not.toHaveAttribute("data-kind", "employee");
      await expect(cards.nth(1)).toContainText(`Convidado(a) de ${STAFF.name}`);
      await expect(admin.getByTestId("send-group-vouchers")).toBeVisible();
    });

    await test.step("o convidado chega antes: entra e o kit espera; a funcionária chega e saem 2 kits", async () => {
      await openPersonAtGate(admin, "Caio Convidado", STAFF.guest);
      await expect(admin.getByTestId("gate-result")).toContainText(`Convidado(a) de ${STAFF.name} (funcionário(a) do SINDSERM)`);
      await expect(admin.getByTestId("kit-on-entry")).toContainText(`O kit deste convidado sai quando ${STAFF.name} chegar.`);
      await admin.getByTestId("confirm-entry").click();
      await confirmEarlyEntry(admin);
      await expect(admin.getByTestId("entry-kit-result")).toContainText("Kit fica para depois");

      await openPersonAtGate(admin, "Rosa Financeiro", STAFF.name);
      await expect(admin.getByTestId("gate-status-title")).toHaveText("LIBERADO PARA ENTRADA");
      await expect(admin.getByTestId("gate-result")).toContainText(`Funcionário(a) do SINDSERM · ${STAFF.job}`);
      await expect(admin.getByTestId("confirm-entry")).toHaveText(/Confirmar entrada \+ 2 kits/);
      await admin.getByTestId("confirm-entry").click();
      await confirmEarlyEntry(admin);
      await expect(admin.getByTestId("gate-status-title")).toHaveText("ENTRADA CONFIRMADA");
      const banner = admin.getByTestId("entry-kit-result");
      await expect(banner).toContainText("Entregue 2 kits!");
      await expect(banner).toContainText("estoque dos colaboradores");
      await expect(banner).toContainText(`Kit do convidado ${STAFF.guest}, que já entrou`);

      await admin.goto("/painel/colaboradores");
      await expect(admin.getByTestId("stat-employees-present")).toHaveText("1");
      await expect(admin.getByTestId("stat-employee-stock")).toHaveText("3");
    });

    await test.step("estoque dos funcionários acabou: entra sem kit; reposto, o kit sai pelo botão", async () => {
      await setEmployeeStock("2");
      await openPersonAtGate(admin, "Bruno Financeiro", "Bruno Financeiro Costa");
      await expect(admin.getByTestId("confirm-entry")).toHaveText(/^\s*Confirmar entrada\s*$/);
      await admin.getByTestId("confirm-entry").click();
      await confirmEarlyEntry(admin);
      await expect(admin.getByTestId("gate-status-title")).toHaveText("ENTRADA CONFIRMADA");
      await expect(admin.getByTestId("entry-kit-result")).toContainText("estoque acabou");

      await setEmployeeStock("6");
      await openPersonAtGate(admin, "Bruno Financeiro", "Bruno Financeiro Costa");
      await admin.getByTestId("deliver-employee-kit").click();
      await admin.getByTestId("confirm-dialog-action").click();
      await expect(admin.getByText("Entrega registrada.")).toBeVisible();
      await expect(admin.getByTestId("deliver-employee-kit")).toHaveCount(0);
      await admin.goto("/painel/colaboradores");
      await expect(admin.getByTestId("stat-employee-stock")).toHaveText("3");
    });

    await context.close();
  });

  test("perfis de acesso: cada um só chega aonde pode; verificação de saúde", async ({ browser }) => {
    test.setTimeout(120_000);

    await test.step("visitante sem login vai para o login", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/painel");
      await expect(page).toHaveURL(/\/entrar\?next=%2Fpainel$/);
      const health = await page.request.get("/api/health");
      expect(health.status()).toBe(200);
      expect(await health.json()).toEqual({ ok: true });
      await context.close();
    });

    await test.step("Segurança/Recepção: só a portaria", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, SECURITY);
      await expect(page).toHaveURL(/\/portaria$/);
      for (const path of ["/painel", "/painel/usuarios", "/painel/kits", "/painel/colaboradores", "/painel/funcionarios"]) {
        await page.goto(path);
        await expect(page, `Segurança não entra em ${path}`).toHaveURL(/\/portaria$/);
      }
      await context.close();
    });

    await test.step("Atendimento: painel sem as áreas do administrador", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, ATTENDANT);
      await expect(page).toHaveURL(/\/painel$/);
      const nav = page.getByTestId("panel-nav").first();
      await expect(nav).toContainText("Na festa");
      await expect(nav).toContainText("Pessoas");
      await expect(nav).not.toContainText("Administração");
      await expect(nav).not.toContainText("Colaboradores SINDSERM");
      for (const path of ["/painel/usuarios", "/painel/configuracoes", "/painel/auditoria", "/painel/colaboradores"]) {
        await page.goto(path);
        await expect(page, `Atendimento não entra em ${path}`).toHaveURL(/\/painel$/);
      }
      await page.goto("/painel/kits");
      await expect(page).toHaveURL(/\/painel\/kits$/);
      // Vê o estoque, mas não muda as quantidades (só o administrador).
      await expect(page.getByRole("button", { name: "Salvar estoque" })).toHaveCount(0);
      await context.close();
    });

    await test.step("Administrador: menu completo, em blocos", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, ADMIN);
      const nav = page.getByTestId("panel-nav").first();
      await expect(nav).toContainText("Administração");
      await expect(nav).toContainText("Colaboradores SINDSERM");
      await expect(nav).toContainText("Acesso ao sistema");
      await context.close();
    });

    await test.step("permissões personalizadas: Segurança ganha o Placar (só ver) e o menu acompanha", async () => {
      const adminContext = await browser.newContext();
      const admin = await adminContext.newPage();
      await login(admin, ADMIN);
      await admin.goto("/painel/usuarios");
      await admin.getByTestId(`edit-user-${SECURITY.email}`).click();
      const editor = admin.getByTestId("access-editor");
      await editor.getByTestId("access-placar-view").click();
      await expect(editor).toContainText("Personalizado");
      await admin.getByTestId("edit-user-submit").click();
      await expect(admin.getByTestId("user-row").filter({ hasText: SECURITY.email })).toContainText("Permissões ajustadas");
      await adminContext.close();

      const context = await browser.newContext();
      const page = await context.newPage();
      await login(page, SECURITY);
      await expect(page).toHaveURL(/\/painel$/);
      const nav = page.getByTestId("panel-nav").first();
      await expect(nav).toContainText("Placar");
      await expect(nav).toContainText("Portaria");
      await expect(nav).not.toContainText("Inscrições");
      await page.goto("/painel/inscricoes");
      await expect(page).toHaveURL(/\/painel$/);
      await context.close();
    });
  });
});
