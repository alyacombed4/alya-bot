const puppeteer = require("puppeteer");

const BASE_URL = "https://saladofuturo.educacao.sp.gov.br";

// ─── Abre browser e loga na conta ────────────────────────────────────
async function login(ra, senha) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  console.log("[Scraper] Abrindo login...");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2", timeout: 30000 });

  // Preenche RA e senha
  await page.waitForSelector("input[name='ra'], input[id='ra'], input[placeholder*='RA']", { timeout: 10000 });
  const raInput = await page.$("input[name='ra'], input[id='ra'], input[placeholder*='RA'], input[type='text']");
  if (!raInput) {
    await browser.close();
    throw new Error("Campo de RA não encontrado na página de login.");
  }
  await raInput.click({ clickCount: 3 });
  await raInput.type(String(ra), { delay: 50 });

  const senhaInput = await page.$("input[type='password']");
  if (!senhaInput) {
    await browser.close();
    throw new Error("Campo de senha não encontrado na página de login.");
  }
  await senhaInput.click({ clickCount: 3 });
  await senhaInput.type(String(senha), { delay: 50 });

  // Submete
  await Promise.all([
    page.keyboard.press("Enter"),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 }),
  ]);

  // Checa se logou
  const url = page.url();
  if (url.includes("login") || url.includes("erro") || url.includes("error")) {
    await browser.close();
    throw new Error("RA ou senha incorretos. Verifique e tente novamente.");
  }

  console.log("[Scraper] Login bem-sucedido. URL:", url);
  return { browser, page };
}

// ─── Lista tarefas (pendentes + expiradas) ───────────────────────────
async function listarTarefas(page) {
  await page.goto(`${BASE_URL}/tarefas`, { waitUntil: "networkidle2", timeout: 20000 });

  await page
    .waitForSelector(".tarefa, [class*='tarefa'], [class*='task'], .atividade", { timeout: 15000 })
    .catch(() => console.warn("[Scraper] Seletor padrão não encontrado, tentando fallback..."));

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
      if (elText.includes("expirad") || elText.includes("encerrad") || elText.includes("vencid")) {
        status = "expirada";
      } else if (elText.includes("entregue") || elText.includes("concluíd") || elText.includes("enviada")) {
        status = "entregue";
      }

      const prazoMatch = el.innerText.match(/\d{2}\/\d{2}\/\d{4}/);
      const prazo = prazoMatch ? prazoMatch[0] : null;

      itens.push({ titulo, link, status, prazo });
    }

    return itens;
  });

  return tarefas;
}

// ─── Abre uma tarefa e extrai as questões ───────────────────────────
async function extrairQuestoes(browser, url) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  console.log("[Scraper] Abrindo tarefa:", url);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });

  await page
    .waitForSelector(
      ".questao, [class*='questao'], [class*='question'], .enunciado, [class*='enunciado']",
      { timeout: 15000 }
    )
    .catch(() => console.warn("[Scraper] Seletor de questão não encontrado"));

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

  await page.close();
  return questoes;
}

// ─── Submete resposta numa questão ──────────────────────────────────
async function responderQuestao(browser, tarefaUrl, questaoNumero, resposta) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
  );

  await page.goto(tarefaUrl, { waitUntil: "networkidle2", timeout: 25000 });

  await page
    .waitForSelector(".questao, [class*='questao'], [class*='question']", { timeout: 15000 })
    .catch(() => {});

  const sucesso = await page.evaluate(
    (numQ, resp) => {
      const blocos = [
        ...document.querySelectorAll(".questao, [class*='questao'], [class*='question']"),
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

  if (sucesso) {
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button, [class*='btn'], [class*='salvar'], [class*='enviar']")];
      const salvar = btns.find(
        (b) =>
          b.innerText?.toLowerCase().includes("salvar") ||
          b.innerText?.toLowerCase().includes("enviar") ||
          b.innerText?.toLowerCase().includes("próxima") ||
          b.innerText?.toLowerCase().includes("confirmar")
      );
      salvar?.click();
    });
    await new Promise((r) => setTimeout(r, 2000));
  }

  await page.close();
  return sucesso;
}

module.exports = { login, listarTarefas, extrairQuestoes, responderQuestao };
