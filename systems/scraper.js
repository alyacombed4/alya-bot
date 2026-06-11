const puppeteer = require("puppeteer");

const BASE_URL = "https://saladofuturo.educacao.sp.gov.br";
const DELAY_ANTES_ENVIAR = 7 * 60 * 1000; // 7 minutos

// ─── Sleep helper ─────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Lança o browser ─────────────────────────────────────────────────
async function launchBrowser() {
  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    "/run/current-system/sw/bin/chromium";

  console.log("[Scraper] Usando Chromium:", executablePath);

  return puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
    ],
  });
}

// ─── Login ────────────────────────────────────────────────────────────
async function login(ra, senha) {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  // ── Passo 1: abre página de login ────────────────────────────────
  console.log("[Scraper] Passo 1: Abrindo página de login...");
  await page.goto(`${BASE_URL}/login-alunos`, {
    waitUntil: "networkidle2",
    timeout: 40000,
  });
  await sleep(3000);

  // ── Passo 2: preenche RA ─────────────────────────────────────────
  console.log("[Scraper] Passo 2: Preenchendo RA...");
  const raSelector = "input[name='ra'], input[id='ra'], input[placeholder*='RA'], input[placeholder*='ra'], input[type='text']";
  await page.waitForSelector(raSelector, { timeout: 15000 });
  const raInput = await page.$(raSelector);
  if (!raInput) {
    await browser.close();
    throw new Error("Campo de RA não encontrado.");
  }
  await raInput.click({ clickCount: 3 });
  await sleep(500);
  await raInput.type(String(ra), { delay: 80 });
  await sleep(1000);

  // ── Passo 3: preenche senha ──────────────────────────────────────
  console.log("[Scraper] Passo 3: Preenchendo senha...");
  const senhaInput = await page.$("input[type='password']");
  if (!senhaInput) {
    await browser.close();
    throw new Error("Campo de senha não encontrado.");
  }
  await senhaInput.click({ clickCount: 3 });
  await sleep(500);
  await senhaInput.type(String(senha), { delay: 80 });
  await sleep(1500);

  // ── Passo 4: clica no botão de login ────────────────────────────
  console.log("[Scraper] Passo 4: Clicando em entrar...");
  const botaoLogin = await page.$(
    "button[type='submit'], input[type='submit'], button"
  );
  if (botaoLogin) {
    await botaoLogin.click();
  } else {
    await page.keyboard.press("Enter");
  }

  // ── Passo 5: aguarda navegação ───────────────────────────────────
  console.log("[Scraper] Passo 5: Aguardando navegação...");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
  await sleep(3000);

  // ── Passo 6: verifica se logou ───────────────────────────────────
  const url = page.url();
  console.log("[Scraper] URL após login:", url);

  if (
    url.includes("login") ||
    url.includes("erro") ||
    url.includes("error") ||
    url.includes("401")
  ) {
    await browser.close();
    throw new Error("RA ou senha incorretos. Verifique e tente novamente.");
  }

  console.log("[Scraper] Login bem-sucedido!");
  return { browser, page };
}

// ─── Lista tarefas ────────────────────────────────────────────────────
async function listarTarefas(page) {
  console.log("[Scraper] Navegando para tarefas...");
  await page.goto(`${BASE_URL}/tarefas`, {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await sleep(4000);

  await page
    .waitForSelector(
      ".tarefa, [class*='tarefa'], [class*='task'], .atividade, article, .card",
      { timeout: 15000 }
    )
    .catch(() => console.warn("[Scraper] Seletor de tarefa não encontrado, tentando assim mesmo..."));

  await sleep(2000);

  const tarefas = await page.evaluate(() => {
    const itens = [];

    const candidatos = [
      ...document.querySelectorAll(".tarefa"),
      ...document.querySelectorAll("[class*='tarefa']"),
      ...document.querySelectorAll("[class*='task']"),
      ...document.querySelectorAll("[class*='atividade']"),
      ...document.querySelectorAll("li[class*='item']"),
      ...document.querySelectorAll("article"),
      ...document.querySelectorAll(".card"),
    ];

    const vistos = new Set();
    for (const el of candidatos) {
      const texto = el.innerText?.trim();
      if (!texto || texto.length < 5 || vistos.has(texto)) continue;
      vistos.add(texto);

      const link = el.querySelector("a")?.href || null;
      const titulo = (
        el.querySelector("h1,h2,h3,h4,strong,b")?.innerText ||
        texto.split("\n")[0]
      ).trim().substring(0, 120);

      const elText = el.innerText.toLowerCase();
      let status = "pendente";
      if (
        elText.includes("expirad") ||
        elText.includes("encerrad") ||
        elText.includes("vencid")
      ) {
        status = "expirada";
      } else if (
        elText.includes("entregue") ||
        elText.includes("concluíd") ||
        elText.includes("enviada")
      ) {
        status = "entregue";
      }

      const prazoMatch = el.innerText.match(/\d{2}\/\d{2}\/\d{4}/);
      const prazo = prazoMatch ? prazoMatch[0] : null;

      itens.push({ titulo, link, status, prazo });
    }

    return itens;
  });

  console.log(`[Scraper] ${tarefas.length} tarefa(s) encontrada(s).`);
  return tarefas;
}

// ─── Extrai questões de uma tarefa ────────────────────────────────────
async function extrairQuestoes(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  console.log("[Scraper] Abrindo tarefa:", url);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(4000);

  await page
    .waitForSelector(
      ".questao, [class*='questao'], [class*='question'], .enunciado, [class*='enunciado']",
      { timeout: 15000 }
    )
    .catch(() => console.warn("[Scraper] Seletor de questão não encontrado"));

  await sleep(2000);

  const questoes = await page.evaluate(() => {
    const resultado = [];

    const blocos = [
      ...document.querySelectorAll(".questao"),
      ...document.querySelectorAll("[class*='questao']"),
      ...document.querySelectorAll("[class*='question']"),
      ...document.querySelectorAll(".enunciado"),
      ...document.querySelectorAll("[class*='enunciado']"),
    ];

    const vistos = new Set();
    let numero = 1;

    for (const bloco of blocos) {
      const texto = bloco.innerText?.trim();
      if (!texto || vistos.has(texto)) continue;
      vistos.add(texto);

      const alternativas = [];
      const altEls = bloco.querySelectorAll(
        "li, [class*='alternativa'], [class*='opcao'], [class*='option'], label"
      );
      for (const alt of altEls) {
        const t = alt.innerText?.trim();
        if (t && t.length > 1) alternativas.push(t);
      }

      const tipo = alternativas.length > 0 ? "multipla_escolha" : "dissertativa";
      const img = bloco.querySelector("img");
      const imagem = img?.src || null;

      resultado.push({
        numero,
        enunciado: texto.substring(0, 1500),
        tipo,
        alternativas: alternativas.slice(0, 5),
        imagem,
        respondida: false,
        resposta: null,
      });

      numero++;
    }

    return resultado;
  });

  console.log(`[Scraper] ${questoes.length} questão(ões) encontrada(s).`);
  await page.close();
  return questoes;
}

// ─── Responde uma questão (com delay de 7 min antes de enviar) ────────
async function responderQuestao(browser, tarefaUrl, questaoNumero, resposta) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  console.log(`[Scraper] Abrindo tarefa para responder questão ${questaoNumero}...`);
  await page.goto(tarefaUrl, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(4000);

  await page
    .waitForSelector(".questao, [class*='questao'], [class*='question']", {
      timeout: 15000,
    })
    .catch(() => {});

  await sleep(2000);

  // ── Seleciona a alternativa ou preenche o campo ──────────────────
  console.log(`[Scraper] Selecionando resposta: "${resposta}"...`);
  const selecionou = await page.evaluate(
    (numQ, resp) => {
      const blocos = [
        ...document.querySelectorAll(
          ".questao, [class*='questao'], [class*='question']"
        ),
      ];

      const bloco = blocos[numQ - 1];
      if (!bloco) return false;

      const opcoes = bloco.querySelectorAll(
        "input[type='radio'], input[type='checkbox'], [class*='alternativa'], [class*='opcao'], label"
      );
      for (const op of opcoes) {
        if (op.innerText?.trim().toLowerCase().startsWith(resp.toLowerCase())) {
          op.click();
          return true;
        }
      }

      const textarea = bloco.querySelector("textarea, input[type='text']");
      if (textarea) {
        textarea.focus();
        textarea.value = resp;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        textarea.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }

      return false;
    },
    questaoNumero,
    resposta
  );

  if (!selecionou) {
    console.warn("[Scraper] Não conseguiu selecionar a resposta.");
    await page.close();
    return false;
  }

  // ── Aguarda antes de enviar (comportamento humano) ───────────────
  const minutos = Math.floor(DELAY_ANTES_ENVIAR / 60000);
  console.log(`[Scraper] Aguardando ${minutos} minutos antes de enviar...`);
  await sleep(DELAY_ANTES_ENVIAR);

  // ── Clica em salvar/enviar ───────────────────────────────────────
  console.log("[Scraper] Enviando resposta...");
  await page.evaluate(() => {
    const btns = [
      ...document.querySelectorAll(
        "button, [class*='btn'], [class*='salvar'], [class*='enviar']"
      ),
    ];
    const salvar = btns.find(
      (b) =>
        b.innerText?.toLowerCase().includes("salvar") ||
        b.innerText?.toLowerCase().includes("enviar") ||
        b.innerText?.toLowerCase().includes("próxima") ||
        b.innerText?.toLowerCase().includes("confirmar")
    );
    salvar?.click();
  });

  await sleep(3000);
  console.log("[Scraper] Resposta enviada!");

  await page.close();
  return true;
}

module.exports = { login, listarTarefas, extrairQuestoes, responderQuestao };
