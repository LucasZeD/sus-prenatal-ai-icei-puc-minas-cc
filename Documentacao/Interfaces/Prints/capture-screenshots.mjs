#!/usr/bin/env node
/**
 * Captura prints do Prenatal Digital para documentação do TCC.
 * Uso: node capture-screenshots.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const BASE_URL = 'https://prenatal.duarte-zegrine.com.br';
const EMAIL = 'admin@local.dev';
const PASSWORD = '16b!6hT.Qxb!J8kZ-1wgb5aH!W0';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = devices['iPhone 13'];

async function shot(page, name, opts = {}) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  console.log(`  ✓ ${name}.png`);
}

async function scrollToSection(page, selector) {
  const el = page.locator(selector).first();
  if ((await el.count()) > 0) {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    return true;
  }
  return false;
}

async function login(page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
  const passInput = page.locator('input[type="password"]').first();

  await emailInput.scrollIntoViewIfNeeded();
  await emailInput.fill(EMAIL);
  await passInput.fill(PASSWORD);

  const submit = page.getByRole('button', { name: /entrar|acessar|login/i }).first();
  if ((await submit.count()) > 0) {
    await submit.click();
  } else {
    await passInput.press('Enter');
  }

  await page.waitForURL(/\/dashboard/, { timeout: 30000 }).catch(async () => {
    await page.waitForTimeout(3000);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
}

async function captureLanding(browser) {
  console.log('\n[1] Landing page (público)');
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  await shot(page, '01_landing_hero', { fullPage: false });
  await shot(page, '01_landing_hero_full', { fullPage: true });

  const sections = [
    { sel: '#login, [data-section="login"], form', name: '02_landing_login' },
    { sel: '#demo-video, [data-section="demo"], video, iframe', name: '03_landing_demo_video' },
    { sel: '#contexto, [data-section="contexto"]', name: '04_landing_contexto_lgpd' },
    { sel: '#documentos, [data-section="documentos"]', name: '05_landing_documentos_oficiais' },
    { sel: '#caderneta, [data-section="caderneta"]', name: '06_landing_caderneta_digital' },
    { sel: '#sistema, [data-section="sistema"], [class*="carousel"]', name: '07_landing_sistema_carousel' },
    { sel: '#infraestrutura, [data-section="infra"], [class*="stack"]', name: '08_landing_infraestrutura_ia' },
    { sel: '#metricas, [data-section="metricas"]', name: '09_landing_metricas' },
    { sel: '#feedback-interesse, [data-section="feedback"]', name: '10_landing_feedback' },
  ];

  for (const { sel, name } of sections) {
    const found = await scrollToSection(page, sel);
    if (found) {
      await shot(page, name, { fullPage: false });
    } else {
      console.log(`  · seção não encontrada: ${sel}`);
    }
  }

  // Scroll incremental para cobrir página longa
  const scrollSteps = 8;
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let i = 1; i <= scrollSteps; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round((height / scrollSteps) * i));
    await page.waitForTimeout(400);
    await shot(page, `01_landing_scroll_${String(i).padStart(2, '0')}`, { fullPage: false });
  }

  await context.close();
}

async function captureAuthenticated(browser) {
  console.log('\n[2] Área autenticada (desktop)');
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();

  await login(page);

  // Dashboard
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, '11_dashboard_agenda', { fullPage: true });
  await shot(page, '11_dashboard_agenda_viewport', { fullPage: false });

  // Modal nova consulta
  const novaConsulta = page.getByRole('button', { name: /nova consulta|agendar|criar consulta/i }).first();
  if ((await novaConsulta.count()) > 0) {
    await novaConsulta.click();
    await page.waitForTimeout(800);
    await shot(page, '12_dashboard_modal_nova_consulta', { fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // Pacientes
  await page.goto(`${BASE_URL}/pacientes`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, '13_pacientes_lista', { fullPage: true });

  const novaGestante = page.getByRole('button', { name: /nova gestante|cadastrar gestante/i }).first();
  if ((await novaGestante.count()) > 0) {
    await novaGestante.click();
    await page.waitForTimeout(800);
    await shot(page, '14_pacientes_modal_nova_gestante', { fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // Buscar demo patient
  const search = page.locator('input[type="search"], input[placeholder*="Buscar"], input[placeholder*="buscar"]').first();
  if ((await search.count()) > 0) {
    await search.fill('Demo');
    await page.waitForTimeout(1200);
    await shot(page, '13_pacientes_busca_demo', { fullPage: false });
  }

  // Clicar na primeira gestante (preferir Demo)
  const demoRow = page.getByRole('row', { name: /demo/i }).first();
  const anyRow = page.locator('table tbody tr, [role="row"]').nth(1);
  if ((await demoRow.count()) > 0) {
    await demoRow.click();
  } else if ((await anyRow.count()) > 0) {
    await anyRow.click();
  }

  await page.waitForTimeout(2500);
  const patientUrl = page.url();
  await shot(page, '15_prontuario_visao_geral', { fullPage: true });
  await shot(page, '15_prontuario_topo', { fullPage: false });

  // Nutrição
  await page.goto(`${patientUrl}#acompanhamento-nutricional`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await scrollToSection(page, '#acompanhamento-nutricional, [id*="nutricional"], [class*="nutric"]');
  await shot(page, '16_prontuario_grafico_nutricional', { fullPage: false });

  // Timeline consultas
  const timeline = page.locator('[class*="timeline"], [data-section="consultas"], h2, h3').filter({ hasText: /consulta|timeline|atendimento/i }).first();
  if ((await timeline.count()) > 0) {
    await timeline.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await shot(page, '17_prontuario_timeline_consultas', { fullPage: false });
  }

  // Lívia assistant
  const liviaBtn = page.getByRole('button', { name: /lívia|livia|assistente/i }).first();
  if ((await liviaBtn.count()) > 0) {
    await liviaBtn.click();
    await page.waitForTimeout(1200);
    await shot(page, '18_prontuario_livia_assistente', { fullPage: false });
    await page.keyboard.press('Escape').catch(() => {});
  }

  // Escriba — pegar link da consulta
  const escribaLink = page.getByRole('link', { name: /escriba|iniciar atendimento/i }).first();
  const escribaBtn = page.getByRole('button', { name: /escriba|iniciar atendimento/i }).first();
  if ((await escribaLink.count()) > 0) {
    await escribaLink.click();
  } else if ((await escribaBtn.count()) > 0) {
    await escribaBtn.click();
  } else {
    // Voltar ao dashboard e iniciar atendimento
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const iniciar = page.getByRole('button', { name: /iniciar atendimento/i }).first();
    if ((await iniciar.count()) > 0) {
      await iniciar.click();
      await page.waitForTimeout(2500);
    }
  }

  if (page.url().includes('/escriba')) {
    await shot(page, '19_escriba_atendimento', { fullPage: true });
    await shot(page, '19_escriba_viewport', { fullPage: false });

    const prontuarioTab = page.getByRole('tab', { name: /prontuário|prontuario/i }).first();
    if ((await prontuarioTab.count()) > 0) {
      await prontuarioTab.click();
      await page.waitForTimeout(1000);
      await shot(page, '20_escriba_prontuario_form', { fullPage: false });
    }
  }

  // Dev sandbox (admin)
  await page.goto(`${BASE_URL}/dev/sandbox`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  if (page.url().includes('/dev/sandbox')) {
    await page.waitForTimeout(1500);
    await shot(page, '21_dev_sandbox', { fullPage: true });
  }

  await writeFile(path.join(OUT_DIR, '_urls_capturadas.txt'), [
    `Dashboard: ${BASE_URL}/dashboard`,
    `Pacientes: ${BASE_URL}/pacientes`,
    `Prontuário: ${patientUrl}`,
    `Escriba: ${page.url().includes('/escriba') ? page.url() : 'N/A'}`,
    `Capturado em: ${new Date().toISOString()}`,
  ].join('\n'), 'utf8');

  await context.close();
}

async function captureMobile(browser) {
  console.log('\n[3] Responsivo (mobile)');
  const context = await browser.newContext({ ...MOBILE });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, '22_mobile_landing', { fullPage: true });

  await login(page);

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '23_mobile_dashboard', { fullPage: true });

  // Menu mobile
  const menuBtn = page.getByRole('button', { name: /menu|abrir|navegação/i }).first();
  if ((await menuBtn.count()) > 0) {
    await menuBtn.click();
    await page.waitForTimeout(600);
    await shot(page, '24_mobile_menu_lateral', { fullPage: false });
    await page.keyboard.press('Escape').catch(() => {});
  }

  await page.goto(`${BASE_URL}/pacientes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, '25_mobile_pacientes', { fullPage: true });

  const demoRow = page.getByRole('row', { name: /demo/i }).first();
  const anyRow = page.locator('table tbody tr, [role="row"]').nth(1);
  if ((await demoRow.count()) > 0) await demoRow.click();
  else if ((await anyRow.count()) > 0) await anyRow.click();
  await page.waitForTimeout(2000);
  await shot(page, '26_mobile_prontuario', { fullPage: true });

  await context.close();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Capturando prints em: ${OUT_DIR}`);
  console.log(`Site: ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });

  try {
    await captureLanding(browser);
    await captureAuthenticated(browser);
    await captureMobile(browser);
    console.log('\nConcluído!');
  } catch (err) {
    console.error('Erro:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
