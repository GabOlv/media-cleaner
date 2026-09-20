const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const URL = process.env.MEDIA_CLEANER_TEST_URL || "http://localhost:8091";
const artifacts = path.resolve(__dirname, "../artifacts");

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  const button = (name) => page.getByRole("button", { name: new RegExp(String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  const tab = (name) => page.getByRole("tab", { name, exact: true });
  const capture = (name) => page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true });
  const journal = () => page.evaluate(() => {
    const value = localStorage.getItem("@media_cleaner_journal_v3");
    return value ? JSON.parse(value) : null;
  });

  async function assertLayout() {
    const result = await page.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      horizontal: [...document.querySelectorAll("*")]
        .filter((element) => element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflowX === "visible")
        .map((element) => element.tagName),
    }));
    assert.ok(result.document <= result.width + 1, JSON.stringify(result));
    assert.ok(result.body <= result.width + 1, JSON.stringify(result));
    assert.equal(result.horizontal.length, 0, JSON.stringify(result));
  }

  async function assertCleanBranding() {
    const body = await page.locator("body").innerText();
    assert.doesNotMatch(body, /\b(Bipo|XP|pontos|nível|missão|conquista|robô|robot)\b/i);
    assert.equal(await page.getByRole("img", { name: /bipo|mascot|robô|robot/i }).count(), 0);
  }

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Uma pequena revisão por dia.", { exact: true }).waitFor();
    await assertCleanBranding();
    await assertLayout();
    const primary = button("Começar revisão");
    const box = await primary.boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 640, `Primary below fold: ${JSON.stringify(box)}`);
    await capture("home-320");

    await tab("Ajustes").click();
    await page.getByRole("button", { name: /Abrir demonstração/ }).click();
    await tab("Revisão").click();
    await button("Buscar arquivos").click();
    await page.getByRole("checkbox", { name: /Uma foto do passeio/ }).first().waitFor();
    await assertCleanBranding();
    await assertLayout();
    await capture("review-320");

    const firstFile = page.getByRole("checkbox", { name: /Uma foto do passeio/ }).first();
    await firstFile.click();
    await button("Excluir selecionados").click();
    await page.getByText("Excluir 9 arquivos?", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Excluir selecionados", exact: true }).last().click();
    await page.getByText("Revisão concluída", { exact: true }).waitFor();
    const afterDeletion = await journal();
    assert.equal(afterDeletion.version, 3);
    assert.equal(afterDeletion.ignoredIds.length, 0, "demo decisions must not persist");
    assert.equal(afterDeletion.mission.reviewed.length, 0, "demo progress must not persist");
    await capture("review-complete");

    await page.evaluate(() => {
      const key = "@media_cleaner_journal_v3";
      const data = JSON.parse(localStorage.getItem(key));
      data.ignoredIds = ["persisted-kept-file"];
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText("Uma pequena revisão por dia.", { exact: true }).waitFor();
    await tab("Ajustes").click();
    await page.getByRole("radio", { name: "5", exact: true }).click();
    await page.getByRole("switch", { name: "Ativar lembretes" }).click();
    await page.getByRole("radio", { name: "2 vezes", exact: true }).click();
    await page.getByRole("button", { name: /Lembrete 1/ }).click();
    await page.getByRole("textbox", { name: "Horário" }).fill("25:99");
    await button("Salvar horário").click();
    await page.getByText("Use um horário como 08:30 ou 20:00.", { exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Horário" }).fill("08:30");
    await button("Salvar horário").click();
    await page.waitForFunction(() => {
      const value = localStorage.getItem("@media_cleaner_journal_v3");
      if (!value) return false;
      const data = JSON.parse(value);
      return data.preferences.batchSize === 5 && data.preferences.reminderTimes[0] === 510 && data.preferences.reminderTimes.length === 2;
    });
    await capture("settings-390");

    await page.getByRole("button", { name: /Itens ignorados/ }).click();
    await page.getByText("Redefinir itens ignorados?", { exact: true }).waitFor();
    await button("Redefinir lista").click();
    await page.getByText("A lista de itens ignorados foi redefinida.", { exact: true }).waitFor();
    assert.deepEqual((await journal()).ignoredIds, []);

    await page.getByRole("button", { name: /Abrir demonstração/ }).click();
    await tab("Pastas").click();
    await page.getByRole("button", { name: /Pastas protegidas/ }).first().click();
    await page.getByText("O que deve ficar fora?", { exact: true }).waitFor();
    await button("Voltar").click();
    await page.getByText("Tudo entra por padrão.", { exact: true }).waitFor();
    await button("Proteger uma pasta").click();
    await page.getByPlaceholder("Buscar pasta").waitFor();
    await page.getByRole("button", { name: /^Music,/ }).click();
    await page.getByRole("button", { name: /Pastas protegidas/ }).first().click();
    await page.getByText("Music", { exact: true }).waitFor();
    assertLayout();
    await capture("folders-390");

    await tab("Início").click();
    for (const [width, height, name] of [[390, 844, "home-390"], [1024, 900, "tablet"]]) {
      await page.setViewportSize({ width, height });
      await assertLayout();
      await capture(name);
    }
    await assertCleanBranding();
    assert.deepEqual(errors, [], `Browser runtime/console errors: ${JSON.stringify(errors)}`);
    console.log("PASS: minimalist branding; 320/390/tablet layouts; default selection and keep flow; deletion confirmation; ignored-list reset; reminder count/time modal; protected-folder navigation; zero browser errors.");
  } catch (error) {
    await capture("failure").catch(() => {});
    console.error("Browser errors:", errors);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
