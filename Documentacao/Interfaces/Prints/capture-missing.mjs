#!/usr/bin/env node
/** Capturas complementares: seções da landing, prontuário, escriba e Lívia */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const BASE = 'https://prenatal.duarte-zegrine.com.br';
const EMAIL = 'admin@local.dev';
const PASSWORD = '16b!6hT.Qxb!J8kZ-1wgb5aH!W0';

async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), ...opts });
  console.log(`  ✓ ${name}.png`);
}

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.locator('input[type="email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  const btn = page.getByRole('button', { name: /entrar|acessar/i }).first();
  if (await btn.count()) await btn.click();
  else await page.locator('input[type="password"]').first().press('Enter');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  console.log('[A] Landing — seções nomeadas');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const landing = [
    ['#demo-titulo', '03_landing_demo_video'],
    ['#contexto-titulo', '04_landing_contexto_lgpd'],
    ['#refs-titulo', '05_landing_documentos_oficiais'],
    ['#materiais-titulo', '06_landing_caderneta_digital'],
    ['text=Veja o sistema em funcionamento', '07_landing_sistema_carousel'],
    ['text=Infraestrutura e modelos de IA', '08_landing_infraestrutura_ia'],
    ['#metricas-titulo', '09_landing_metricas'],
  ];

  for (const [sel, name] of landing) {
    const loc = sel.startsWith('text=') ? page.getByText(sel.slice(5), { exact: false }).first() : page.locator(sel).first();
    if (await loc.count()) {
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await shot(page, name);
    }
  }

  console.log('[B] Prontuário + Escriba + Lívia');
  await login(page);

  await page.goto(`${BASE}/pacientes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const search = page.locator('input[placeholder*="Buscar"], input[type="search"]').first();
  if (await search.count()) {
    await search.fill('Demo');
    await page.waitForTimeout(1000);
  }

  const verPront = page.getByRole('link', { name: /ver prontuário/i }).first();
  await verPront.click();
  await page.waitForURL(/\/pacientes\/[a-f0-9-]+/, { timeout: 20000 });
  await page.waitForTimeout(2500);

  const patientUrl = page.url();
  await shot(page, '15_prontuario_visao_geral', { fullPage: true });
  await shot(page, '15_prontuario_topo', { fullPage: false });

  // Timeline
  const timeline = page.getByRole('heading', { name: /timeline de consultas/i });
  if (await timeline.count()) {
    await timeline.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await shot(page, '17_prontuario_timeline_consultas');
  }

  // Expandir primeira consulta
  const verMais = page.getByRole('button', { name: /ver mais|expandir/i }).first();
  if (await verMais.count()) {
    await verMais.click();
    await page.waitForTimeout(600);
    await shot(page, '17b_prontuario_consulta_expandida');
  }

  // Lívia (painel lateral desktop)
  const liviaFab = page.locator('[class*="Livia"], button').filter({ hasText: /lívia|livia/i }).first();
  const liviaHeading = page.getByText('Assistente Lívia').first();
  if (!(await liviaHeading.isVisible().catch(() => false)) && await liviaFab.count()) {
    await liviaFab.click();
    await page.waitForTimeout(1000);
  }
  if (await liviaHeading.isVisible().catch(() => false)) {
    await shot(page, '18_prontuario_livia_assistente');
  } else {
    // tentar abrir via FAB fixo
    const fab = page.locator('button[aria-label*="Lívia"], button[aria-label*="Livia"], button[title*="Lívia"]').first();
    if (await fab.count()) {
      await fab.click();
      await page.waitForTimeout(1000);
      await shot(page, '18_prontuario_livia_assistente');
    }
  }

  // Nutrição
  await page.goto(`${patientUrl}#acompanhamento-nutricional`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const nutri = page.getByText(/acompanhamento nutricional|caderneta 2024/i).first();
  if (await nutri.count()) {
    await nutri.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await shot(page, '16_prontuario_grafico_nutricional');
  }

  // Escriba
  const escriba = page.getByRole('link', { name: /iniciar escriba/i }).first();
  if (await escriba.count()) {
    await escriba.click();
    await page.waitForURL(/\/escriba/, { timeout: 20000 });
    await page.waitForTimeout(2500);
    await shot(page, '19_escriba_atendimento', { fullPage: true });
    await shot(page, '19_escriba_viewport', { fullPage: false });

    const tab = page.getByRole('tab', { name: /prontuário|prontuario/i }).first();
    if (await tab.count()) {
      await tab.click();
      await page.waitForTimeout(1000);
      await shot(page, '20_escriba_prontuario_form');
    }
  } else {
    // Dashboard fallback
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const iniciar = page.getByRole('link', { name: /iniciar atendimento/i }).first();
    if (await iniciar.count()) {
      await iniciar.click();
      await page.waitForURL(/\/escriba/, { timeout: 20000 });
      await page.waitForTimeout(2500);
      await shot(page, '19_escriba_atendimento', { fullPage: true });
      await shot(page, '19_escriba_viewport', { fullPage: false });
      const tab = page.getByRole('tab', { name: /prontuário|prontuario/i }).first();
      if (await tab.count()) {
        await tab.click();
        await page.waitForTimeout(1000);
        await shot(page, '20_escriba_prontuario_form');
      }
    }
  }

  // Editar prontuário
  await page.goto(patientUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const editar = page.getByRole('button', { name: /editar prontuário|editar prontuario/i }).first();
  if (await editar.count()) {
    await editar.click();
    await page.waitForTimeout(800);
    await shot(page, '15b_prontuario_modo_edicao');
  }

  await browser.close();
  console.log('Complementares concluídos.');
}

main().catch((e) => { console.error(e); process.exit(1); });
