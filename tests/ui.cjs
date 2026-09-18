const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const URL = process.env.MEDIA_CLEANER_TEST_URL || process.env.BIPO_TEST_URL || "http://localhost:8091";
const artifacts = path.resolve(__dirname, "../artifacts");

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const button = name => page.getByRole("button", { name, exact: true });
  const tab = name => page.getByRole("tab", { name, exact: true });
  const capture = name => page.screenshot({ path: path.join(artifacts, `${name}.png`) });
  const progress = (done, total = 10) => page.getByText(`${done} de ${total} revisados`, { exact: true }).waitFor();
  const saved = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("@media_cleaner"))));
  async function cleanUI() {
    assert.doesNotMatch(await page.locator("body").innerText(), /\b(Bipo|XP|pontos|nível|missão|conquista|bip-bip|nhac)\b/i);
    assert.equal(await page.getByRole("img", { name: /bipo|mascot|robô/i }).count(), 0);
  }
  async function layout() {
    await cleanUI();
    const result = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
      scrollers: [...document.querySelectorAll("*")].filter(e => e.clientWidth > 0 && ["auto", "scroll"].includes(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1).map(e => e.tagName) }));
    assert.ok(result.document <= result.width + 1 && result.body <= result.width + 1 && !result.scrollers.length, JSON.stringify(result));
  }
  try {
    await page.goto(URL);
    await progress(0);
    await layout();
    const primary = button("Iniciar revisão");
    const box = await primary.boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 640, `Primary below fold: ${JSON.stringify(box)}`);
    assert.ok(await primary.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), "Primary obscured");
    await capture("small-phone");
    let focused = false;
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      if (await primary.evaluate(el => el === document.activeElement)) { focused = true; break; }
    }
    assert.ok(focused, "Primary must be keyboard reachable");
    assert.ok(await primary.evaluate(el => { const s = getComputedStyle(el); return (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== "none"; }), "Keyboard focus must be visible");
    await page.keyboard.press("Enter");
    await button("Experimentar demonstração").waitFor();
    assert.equal(await button("Guardar este arquivo").count(), 0, "Web must not silently activate demo");
    await layout();
    await tab("Início").click();
    for (const [width, height, name] of [[390, 844, "home"], [1024, 900, "tablet"]]) {
      await page.setViewportSize({ width, height });
      await layout();
      await capture(name);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await tab("Ajustes").click();
    await page.getByRole("radio", { name: "5", exact: true }).click();
    const time = page.getByRole("textbox", { name: "Horário do lembrete" });
    await time.fill("25:99");
    await button("Salvar horário").click();
    await page.getByText("Use um horário como 08:30 ou 20:00.", { exact: true }).waitFor();
    await time.fill("08:30");
    await button("Salvar horário").click();
    await page.waitForFunction(() => Object.values(localStorage).some(v => { try { const j = JSON.parse(v); return j.preferences?.time === "08:30" && j.preferences?.batchSize === 5; } catch { return false; } }));
    await page.reload();
    await progress(0, 5);
    await tab("Ajustes").click();
    assert.equal(await page.getByRole("radio", { name: "5", exact: true }).getAttribute("aria-checked"), "true");
    assert.equal(await time.inputValue(), "08:30");
    const realBefore = await saved();
    await tab("Revisão").click();
    await button("Experimentar demonstração").click();
    await progress(0);
    await tab("Pastas").click();
    await button("Proteger uma pasta").click();
    await page.getByRole("textbox", { name: "Buscar pasta" }).fill("Music");
    await page.getByRole("button", { name: /Music/ }).click();
    await button("Incluir nas próximas revisões").waitFor();
    await layout();
    await capture("folders");
    await button("Incluir nas próximas revisões").click();
    await page.getByText("Nenhuma pasta protegida", { exact: true }).waitFor();
    await tab("Início").click();
    await button("Iniciar revisão").click();
    await button("Guardar este arquivo").waitFor();
    await layout();
    await capture("review");
    await capture("mission"); // Historical artifact alias.
    await button("Guardar este arquivo").click();
    await progress(1);
    const beforeCancel = await page.locator("body").innerText();
    await button("Excluir este arquivo").click();
    await button("Cancelar").click();
    await progress(1);
    assert.equal(await page.locator("body").innerText(), beforeCancel, "Cancel must preserve current file/progress");
    await button("Excluir este arquivo").click();
    await capture("deletion");
    await button("Sim, excluir arquivo").click();
    await progress(2);
    await page.getByText("Arquivo excluído.", { exact: true }).waitFor();
    assert.equal(await button("Sim, excluir arquivo").count(), 0);
    await capture("deletion-success");
    for (let i = 2; i < 10; i++) {
      await button("Guardar este arquivo").click();
      await progress(i + 1);
    }
    await page.getByText("Revisão concluída", { exact: true }).waitFor();
    assert.equal(await button("Guardar este arquivo").count(), 0);
    await cleanUI();
    await capture("completed");
    await button("Voltar ao início").click();
    await progress(10);
    assert.deepEqual(await saved(), realBefore, "Demo must never persist decisions or preferences");
    await button("Sair").click();
    await progress(0, 5);
    await page.reload();
    await progress(0, 5);
    assert.deepEqual(await saved(), realBefore);
    await tab("Revisão").click();
    await button("Experimentar demonstração").waitFor();
    assert.equal(await button("Guardar este arquivo").count(), 0);
    await tab("Início").click();
    // Synthetic web text enlargement; does not emulate Android system font scale.
    await page.setViewportSize({ width: 320, height: 640 });
    await page.evaluate(() => {
      const sizes = [...document.querySelectorAll("div,span,button,input")].filter(el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim())).map(el => { const s = getComputedStyle(el); return [el, parseFloat(s.fontSize), parseFloat(s.lineHeight)]; });
      for (const [el, size, line] of sizes) { el.style.fontSize = `${size * 1.5}px`; if (Number.isFinite(line)) el.style.lineHeight = `${line * 1.5}px`; }
    });
    await layout();
    await capture("font-scale");
    await button("Iniciar revisão").click();
    await button("Experimentar demonstração").waitFor();
    assert.deepEqual(errors, [], "Browser runtime/console errors");
    console.log("PASS: 320x640 primary visible; explicit web demo; no gamification; keep/delete/cancel; protect/unprotect; completion; saved preferences/reload; demo isolation; keyboard focus; 320/390/1024 layouts; synthetic 150% text; zero browser errors.");
  } catch (error) {
    await capture("failure").catch(() => {});
    console.error("Browser errors:", errors);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
