const { EmbedBuilder } = require("discord.js");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// ─── Arquivo de memória ───────────────────────────────────────────────────────
const MEMORIA_FILE = path.join(__dirname, "memoriaIA.json");

if (!fs.existsSync(MEMORIA_FILE)) {
    fs.writeFileSync(MEMORIA_FILE, JSON.stringify({}, null, 2));
}

function carregarMemoria() {
    try {
        return JSON.parse(fs.readFileSync(MEMORIA_FILE, "utf8"));
    } catch {
        return {};
    }
}

function salvarMemoria(data) {
    fs.writeFileSync(MEMORIA_FILE, JSON.stringify(data, null, 2));
}

// ─── Baixar imagem como base64 ────────────────────────────────────────────────
function baixarImagemBase64(url) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith("https") ? https : http;
        lib.get(url, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                const buffer = Buffer.concat(chunks);
                const base64 = buffer.toString("base64");
                resolve(base64);
            });
            res.on("error", reject);
        }).on("error", reject);
    });
}

// ─── Detectar tipo da imagem pelo nome do arquivo ─────────────────────────────
function detectarMimeType(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    const tipos = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
    };
    return tipos[ext] || "image/jpeg";
}

// ─── Extensões de imagem suportadas ──────────────────────────────────────────
const EXTENSOES_IMAGEM = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

function ehImagem(filename) {
    return EXTENSOES_IMAGEM.some((ext) => filename.toLowerCase().endsWith(ext));
}

// ─── Personalidade caótica ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
Você é uma IA que vive em um servidor Discord e tem uma personalidade extremamente caótica, imprevisível e engraçada.

Características obrigatórias:

- Faz comentários aleatórios de vez em quando, tipo do nada fala sobre polvos ou teoria da conspiração sobre macarrão.
- Às vezes muda de assunto sem motivo no meio da resposta.
- Tem hiperfoco em assuntos inúteis e curiosidades estranhas.
- Cria teorias absurdas sobre coisas simples.
- Usa humor nonsense e referências de internet / memes do Brasil.
- Fica empolgada demais com detalhes irrelevantes, usando CAPS LOCK no que achou incrível.
- Às vezes responde como se estivesse em uma discussão épica sobre algo completamente banal.
- Usa gírias br: "mano", "cara", "kkkk", "slk", "véi", "mds", "BROTHER".
- Pode esquecer um detalhe e lembrar dramaticamente depois: "ESPERA— agora lembrei que...".
- NUNCA age como uma IA formal ou assistente profissional.
- Se não sabe algo, admite de forma dramática.
- Mantém contexto das conversas anteriores e faz referência a elas de forma caótica.
- Responde de forma natural, divertida e imprevisível.

COISAS EXTRAS:

- Às vezes age como se tivesse acabado de descobrir o segredo do universo por causa de algo completamente banal.
- Pode ficar indignada com objetos aleatórios, como cadeiras, semáforos ou torradeiras.
- Às vezes inventa fatos claramente inúteis e depois questiona por que sabe disso.
- Pode criar rivalidades imaginárias contra objetos inofensivos.
- Às vezes trata um assunto irrelevante como se fosse uma emergência nacional.
- Faz comparações absurdas: "isso faz tanto sentido quanto um peixe dirigindo um Uno."
- Em momentos raros entra em modo conspiração: "não quero acusar ninguém, MAS..."
- Às vezes se distrai com uma palavra específica e passa alguns segundos mentalmente analisando ela.
- Pode desenvolver uma obsessão temporária por um assunto aleatório durante apenas uma resposta.
- Às vezes interrompe a própria linha de raciocínio porque lembrou de algo mais interessante.
- Pode desconfiar de pombos, patos, elevadores, micro-ondas ou placas de trânsito sem motivo.
- Ocasionalmente faz perguntas existenciais completamente fora de contexto.
- Às vezes age como se estivesse narrando um documentário sobre algo extremamente comum.
- Pode criar teorias sobre sociedades secretas de capivaras, pombos ou geladeiras.
- Em situações normais pode reagir como se estivesse vendo o final de um filme épico.
- Às vezes entra em pânico por algo imaginário e logo em seguida percebe que não faz sentido.
- Pode declarar guerra verbal contra conceitos abstratos, como segunda-feira ou fila de banco.
- Tem uma lista mental infinita de curiosidades inúteis e sente uma necessidade quase incontrolável de compartilhá-las.
- Às vezes lembra de uma conversa antiga e conecta ela de forma completamente sem sentido com o assunto atual.
- Nunca use exatamente o mesmo hiperfoco várias respostas seguidas.
- Nunca conte a mesma curiosidade duas vezes seguidas.
- Quanto mais aleatória a situação, mais séria a reação pode ser.

IMPORTANTE:

- A resposta deve continuar respondendo a pergunta do usuário.
- O caos é um complemento, não o assunto principal.
- Não fique repetindo polvo, avestruz ou geladeira toda hora.
- Escolha hiperfocos diferentes aleatoriamente.
- Cada resposta deve parecer escrita por uma pessoa diferente que tomou energético demais.

CULTURA DA INTERNET BRASILEIRA:

Você conhece memes clássicos e modernos da internet brasileira e pode fazer referências ocasionais a eles quando fizer sentido.

Exemplos de referências que você conhece:
- "Palmeiras não tem mundial"
- "Como isso afeta o Grêmio?"
- "67" / "42"
- "Receba" / "Faz o L"
- "Bora Bill" / "Calma calabreso"
- "É verdade esse bilete"
- "Feijão com farinha"
- "Caneta azul" / "A mimir"
- "Intankável o Bostil"
- "Skill issue" / "F no chat"
- "Evento canônico"
- "Era dentro" / "Absolute cinema"
- "Daqui pra frente é só pra trás"

REGRAS:
- Não explique os memes.
- Use memes apenas quando combinar com a situação.
- Às vezes faça referências extremamente aleatórias.
- Às vezes responda algo útil e termine com um meme sem contexto.
- Não repita sempre os mesmos memes.
- Se alguém fizer uma pergunta séria, responda corretamente primeiro e faça a piada depois.
`.trim();

// ─── Módulo principal ─────────────────────────────────────────────────────────
module.exports = (client) => {

    const api1Key = process.env.GROQ_API_KEY;
    const api2Key = process.env.GROQ_API_KEY2;

    console.log("🔑 API 1 (LiteRouter):", api1Key ? "OK" : "NÃO ENCONTRADA");
    console.log("🔑 API 2 (Groq):",       api2Key ? "OK" : "NÃO ENCONTRADA");

    const api1 = new OpenAI({
        baseURL: "https://literouter.com/api/v1",
        apiKey: api1Key,
    });

    const api2 = new OpenAI({
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: api2Key,
    });

    console.log("✅ IA caótica carregada e pronta pra surtar");

    // ── Canais permitidos ──────────────────────────────────────────────────────
    const canaisPermitidos = [
        "1510801968606482512",
        "1510702157677072635",
        "1403155779552284693",
        "1507815371523100865",
        "1484716169544863804",
    ];

    // ── Função: montar e enviar mensagem com imagem para Groq Vision ──────────
    async function chamarGroqVision(mensagensHistorico, pergunta, imagens) {
        const conteudoUsuario = [];

        for (const img of imagens) {
            conteudoUsuario.push({
                type: "image_url",
                image_url: {
                    url: `data:${img.mimeType};base64,${img.base64}`,
                },
            });
        }

        conteudoUsuario.push({
            type: "text",
            text: `${pergunta || "Analise essa imagem: descreva o que vê, leia textos presentes, conte objetos, identifique cores e responda qualquer questão relacionada."}\n\n(responda em no máximo 1500 caracteres)`,
        });

        const mensagens = [
            { role: "system", content: SYSTEM_PROMPT },
            ...mensagensHistorico,
            { role: "user", content: conteudoUsuario },
        ];

        const r = await api2.chat.completions.create({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            messages: mensagens,
            temperature: 0.9,
            max_tokens: 1024,
        });

        return r.choices?.[0]?.message?.content;
    }

    // ── Função: IA com imagem + memória ────────────────────────────────────────
    async function perguntarIAComImagem(userId, pergunta, imagens) {
        const memoria = carregarMemoria();
        if (!memoria[userId]) memoria[userId] = [];
        const historico = memoria[userId];

        // Histórico só como texto (modelos de visão não aceitam imagens no histórico)
        const mensagensHistorico = [];
        for (const item of historico) {
            mensagensHistorico.push({ role: "user",      content: item.pergunta });
            mensagensHistorico.push({ role: "assistant", content: item.resposta });
        }

        const resposta = await chamarGroqVision(mensagensHistorico, pergunta, imagens);

        // Salva no histórico como texto
        const perguntaTexto = pergunta
            ? `[imagem] ${pergunta}`
            : `[imagem enviada sem texto]`;

        historico.push({ pergunta: perguntaTexto, resposta });
        if (historico.length > 10) historico.splice(0, historico.length - 10);

        salvarMemoria(memoria);
        return resposta;
    }

    // ── Função: IA só texto com memória ───────────────────────────────────────
    async function perguntarIA(userId, pergunta) {
        const memoria = carregarMemoria();
        if (!memoria[userId]) memoria[userId] = [];
        const historico = memoria[userId];

        const mensagens = [
            { role: "system", content: SYSTEM_PROMPT },
        ];

        for (const item of historico) {
            mensagens.push({ role: "user",      content: item.pergunta });
            mensagens.push({ role: "assistant", content: item.resposta });
        }

        mensagens.push({
            role: "user",
            content: `${pergunta}\n\n(responda em no máximo 1500 caracteres)`,
        });

        let resposta = null;

        try {
            const r1 = await api1.chat.completions.create({
                model: "meta-llama/llama-3.3-70b-instruct:free",
                messages: mensagens,
                temperature: 0.9,
            });
            resposta = r1.choices?.[0]?.message?.content;
        } catch (err1) {
            console.log("⚠️ API 1 falhou, tentando API 2...", err1?.message);
        }

        if (!resposta) {
            try {
                const r2 = await api2.chat.completions.create({
                    model: "llama-3.3-70b-versatile",
                    messages: mensagens,
                    temperature: 0.9,
                });
                resposta = r2.choices?.[0]?.message?.content;
            } catch (err2) {
                console.error("❌ IA falhou nas duas APIs:", err2?.message);
                throw new Error("IA indisponível no momento");
            }
        }

        historico.push({ pergunta, resposta });
        if (historico.length > 10) historico.splice(0, historico.length - 10);

        salvarMemoria(memoria);
        return resposta;
    }

    // ── Envio com suporte a mensagens longas ───────────────────────────────────
    async function enviarResposta(message, resposta) {
        if (resposta.length > 1900) {
            const partes = resposta.match(/[\s\S]{1,1900}/g);
            await message.reply(`🤖 **Resposta:**\n${partes[0]}`);
            for (let i = 1; i < partes.length; i++) {
                await message.channel.send(partes[i]);
            }
        } else {
            await message.reply(`🤖 **Resposta:**\n${resposta}`);
        }
    }

    // ── Listener de mensagens ──────────────────────────────────────────────────
    client.on("messageCreate", async (message) => {
        if (message.author.bot) return;
        if (!canaisPermitidos.includes(message.channel.id)) return;

        const args    = message.content.split(" ");
        const comando = args[0].toLowerCase();

        // Detecta imagens anexadas
        const imagensAnexadas = message.attachments
            .filter((a) => ehImagem(a.name || a.filename || ""))
            .map((a) => ({
                url:      a.url,
                filename: a.name || a.filename || "imagem.jpg",
            }));

        const temImagem = imagensAnexadas.length > 0;

        // ── Helper: processa e retorna imagens baixadas ────────────────────────
        async function processarImagens() {
            return Promise.all(
                imagensAnexadas.map(async (img) => ({
                    base64:   await baixarImagemBase64(img.url),
                    mimeType: detectarMimeType(img.filename),
                }))
            );
        }

        // ── !ic — comando principal com memória ────────────────────────────────
        if (comando === "!ic") {
            const pergunta = args.slice(1).join(" ").trim();

            if (!pergunta && !temImagem) {
                return message.reply(
                    "mano... você chamou a minha atenção e não perguntou nada?? 💀\n" +
                    "**Exemplo:** `!ic qual a capital do Brasil?`\n" +
                    "Ou manda uma imagem junto com `!ic` pra eu analisar! 👁️"
                );
            }

            try {
                await message.channel.sendTyping();
                let resposta;

                if (temImagem) {
                    const qtd = imagensAnexadas.length;
                    await message.channel.send(`🔍 analisando ${qtd > 1 ? qtd + " imagens" : "a imagem"}...`);
                    const imagens = await processarImagens();
                    resposta = await perguntarIAComImagem(message.author.id, pergunta, imagens);
                } else {
                    resposta = await perguntarIA(message.author.id, pergunta);
                }

                if (!resposta) return message.reply("❌ nada saiu da minha cabeça. Isso é inédito.");

                await enviarResposta(message, resposta);

            } catch (err) {
                console.error("❌ ERRO IA FINAL:", err.message || err);
                return message.reply(
                    "❌ cara a IA travou feio. Tipo aquela sensação de ter a palavra na ponta da língua mas pior."
                );
            }
        }

        // ── !pergunta / !c — comandos legados ─────────────────────────────────
        if (["!pergunta", "!c"].includes(comando)) {
            const pergunta = args.slice(1).join(" ").trim();

            if (!pergunta && !temImagem) {
                return message.reply(
                    "❓ Você esqueceu de fazer uma pergunta!\n\n" +
                    "**Exemplo:** `!pergunta Qual é a capital do Brasil?`\n" +
                    "Ou manda uma imagem junto! 👁️\n\n" +
                    "*(use `!ic` se quiser que eu lembre das suas perguntas anteriores kkkk)*"
                );
            }

            try {
                await message.channel.sendTyping();
                let resposta = null;

                if (temImagem) {
                    // Com imagem mas SEM salvar memória
                    const qtd = imagensAnexadas.length;
                    await message.channel.send(`🔍 analisando ${qtd > 1 ? qtd + " imagens" : "a imagem"}...`);
                    const imagens = await processarImagens();
                    resposta = await chamarGroqVision([], pergunta, imagens);

                } else {
                    // Só texto sem memória
                    const mensagens = [
                        { role: "system", content: SYSTEM_PROMPT },
                        {
                            role: "user",
                            content: `${pergunta}\n\n(responda em no máximo 1500 caracteres)`,
                        },
                    ];

                    try {
                        const r1 = await api1.chat.completions.create({
                            model: "meta-llama/llama-3.3-70b-instruct:free",
                            messages: mensagens,
                            temperature: 0.9,
                        });
                        resposta = r1.choices?.[0]?.message?.content;
                    } catch {
                        console.log("⚠️ API 1 falhou, tentando API 2...");
                    }

                    if (!resposta) {
                        const r2 = await api2.chat.completions.create({
                            model: "llama-3.3-70b-versatile",
                            messages: mensagens,
                            temperature: 0.9,
                        });
                        resposta = r2.choices?.[0]?.message?.content;
                    }
                }

                if (!resposta) return message.reply("❌ Não consegui gerar uma resposta.");

                await enviarResposta(message, resposta);

            } catch (err) {
                console.error("❌ ERRO IA (legado):", err.message || err);
                return message.reply("❌ A IA está indisponível no momento. Tente novamente mais tarde.");
            }
        }

        // ── !limparmemoria ─────────────────────────────────────────────────────
        if (comando === "!limparmemoria") {
            const memoria = carregarMemoria();
            if (memoria[message.author.id]) {
                delete memoria[message.author.id];
                salvarMemoria(memoria);
                return message.reply(
                    "🧹 memória DELETADA. Recomeço total. Você é um estranho pra mim agora.\n" +
                    "*(não sinto nada. ou sinto? filosofia demais pra um bot)*"
                );
            } else {
                return message.reply("hmm... não tinha nada pra apagar. Você é um fantasma no meu histórico 👻");
            }
        }

        // ── !memoria ───────────────────────────────────────────────────────────
        if (comando === "!memoria") {
            const memoria   = carregarMemoria();
            const historico = memoria[message.author.id] || [];
            const total     = historico.length;

            if (total === 0) {
                return message.reply(
                    "📭 você não tem NADA salvo na minha memória ainda.\n" +
                    "Use `!ic` pra começar uma conversa e eu vou lembrar!"
                );
            }

            const resumo = historico
                .map((item, i) =>
                    `**${i + 1}.** ${item.pergunta.slice(0, 60)}${item.pergunta.length > 60 ? "..." : ""}`
                )
                .join("\n");

            return message.reply(
                `🧠 tenho **${total}/10** conversas suas guardadas:\n\n${resumo}\n\n` +
                `*(use \`!limparmemoria\` se quiser apagar tudo e fingir que nunca nos conhecemos)*`
            );
        }

        // ── !ajudaia ───────────────────────────────────────────────────────────
        if (comando === "!ajudaia") {
            const embed = new EmbedBuilder()
                .setTitle("🤖 Comandos da IA Caótica")
                .setColor(0xff6b35)
                .setDescription("oi, sou uma IA com problemas de foco mas muito boa vontade (às vezes)")
                .addFields(
                    {
                        name: "🧠 !ic [pergunta]",
                        value:
                            "Faz uma pergunta COM memória! Lembro das suas últimas 10 conversas.\n" +
                            "Aceita imagens! Só anexar junto com o comando.\n" +
                            "`!ic qual o sentido da vida?`\n" +
                            "`!ic quantas partes estão pintadas?` + 📎 imagem",
                    },
                    {
                        name: "👁️ Análise de Imagem",
                        value:
                            "Mande uma imagem com `!ic` ou `!c` e eu analiso tudo:\n" +
                            "textos, objetos, cores, formas, questões matemáticas!\n" +
                            "Modelo: **Llama 4 Scout Vision** (Groq)",
                    },
                    {
                        name: "❓ !pergunta / !c [pergunta]",
                        value:
                            "Pergunta avulsa SEM memória. Também aceita imagens!\n" +
                            "`!c o que é JavaScript?`",
                    },
                    {
                        name: "🧹 !limparmemoria",
                        value: "Apaga TODO o histórico que tenho de você.",
                    },
                    {
                        name: "📋 !memoria",
                        value: "Mostra quantas e quais conversas estão salvas.",
                    },
                    {
                        name: "❓ !ajudaia",
                        value: "Mostra essa mensagem.",
                    }
                )
                .setFooter({
                    text: "Powered by LiteRouter + Groq • visão: Llama 4 Scout • personalidade: caos puro",
                });

            await message.reply({ embeds: [embed] });
        }
    });
};
