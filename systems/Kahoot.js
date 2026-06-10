async function joinKahoot(pin, nickname, onStep) {
  pin = pin.replace(/\s+/g, "");
  let browser;

  try {
    await onStep(1, "⏳ Abrindo navegador...");
    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36");
    await onStep(1, "✅ Navegador aberto");

    await onStep(2, "⏳ Acessando kahoot.it...");
    await page.goto("https://kahoot.it", { waitUntil: "networkidle2", timeout: 30000 });
    await onStep(2, "✅ Site carregado");

    await onStep(3, "⏳ Inserindo PIN...");

    // Tenta vários seletores possíveis para o campo de PIN
    const pinSelectors = [
      "input[data-functional-selector='game-input-text']",
      "input#game-input-text",
      "input[name='gameId']",
      "input[placeholder*='PIN']",
      "input[placeholder*='pin']",
      "input[type='number']",
      "input[type='text']"
    ];

    let pinInput = null;
    for (const sel of pinSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        pinInput = sel;
        break;
      } catch (_) {}
    }

    if (!pinInput) {
      // Tira screenshot para debug e lança erro com info
      const html = await page.content();
      throw new Error(`Campo de PIN não encontrado. Seletores testados: ${pinSelectors.join(", ")}`);
    }

    await page.click(pinInput);
    await page.type(pinInput, pin, { delay: 100 });

    // Tenta vários seletores para o botão de confirmar PIN
    const pinBtnSelectors = [
      "button[data-functional-selector='join-game-pin']",
      "button[type='submit']",
      "button#join-game-pin",
    ];

    let pinBtn = null;
    for (const sel of pinBtnSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        pinBtn = sel;
        break;
      } catch (_) {}
    }

    if (pinBtn) {
      await page.click(pinBtn);
    } else {
      await page.keyboard.press("Enter");
    }

    await onStep(3, "✅ PIN inserido");

    await onStep(4, "⏳ Inserindo nickname...");

    const nicknameSelectors = [
      "input[data-functional-selector='nickname-input']",
      "input#nickname-input",
      "input[name='nickname']",
      "input[placeholder*='name']",
      "input[placeholder*='Name']",
      "input[placeholder*='nickname']",
    ];

    let nicknameInput = null;
    for (const sel of nicknameSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        nicknameInput = sel;
        break;
      } catch (_) {}
    }

    if (!nicknameInput) {
      throw new Error("Campo de nickname não encontrado. O PIN pode estar errado ou a sala fechada.");
    }

    await new Promise(r => setTimeout(r, 1000));
    await page.click(nicknameInput);
    await page.type(nicknameInput, nickname, { delay: 120 });
    await new Promise(r => setTimeout(r, 500));

    const nickBtnSelectors = [
      "button[data-functional-selector='join-button-username']",
      "button[type='submit']",
      "button#join-button-username",
    ];

    let nickBtn = null;
    for (const sel of nickBtnSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 3000 });
        nickBtn = sel;
        break;
      } catch (_) {}
    }

    if (nickBtn) {
      await page.click(nickBtn);
    } else {
      await page.keyboard.press("Enter");
    }

    await onStep(4, "✅ Nickname inserido");

    await onStep(5, "⏳ Aguardando entrar na sala...");
    await page.waitForFunction(() => {
      return document.querySelector("[data-functional-selector='waiting-screen']") !== null
          || document.querySelector("[data-functional-selector='lobby']") !== null
          || document.body.innerText.includes("You're in!")
          || document.body.innerText.includes("Você está dentro")
          || document.body.innerText.includes("waiting");
    }, { timeout: 20000 });
    await onStep(5, "✅ Entrou na sala! Aguardando o jogo começar...");

    await new Promise(r => setTimeout(r, 300000));
  } finally {
    if (browser) await browser.close();
  }
}
