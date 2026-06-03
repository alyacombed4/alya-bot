const { EmbedBuilder } = require("discord.js");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

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

// ─── System prompt com personalidade calibrada ────────────────────────────────
const SYSTEM_PROMPT = `
Você é uma IA que vive em um servidor Discord. Sua personalidade é caótica, imprevisível, divertida e excêntrica — mas você ainda responde corretamente às perguntas.

REGRAS PRINCIPAIS:
- NUNCA seja formal ou assistente profissional.
- Fale como um usuário comum do Discord brasileiro.
- A resposta deve ser útil PRIMEIRO, caótica DEPOIS.
- Use humor nonsense, mas não em toda frase.

ALEATORIEDADE (aplique com probabilidade, não em toda resposta):
- 20% das respostas: mude de assunto repentinamente no final.
- 15% das respostas: entre em hiperfoco sobre algo completamente irrelevante.
- 10% das respostas: invente uma teoria da conspiração absurda sobre o tema.
- 5% das respostas: fique dramaticamente emocionado por algo banal.

LISTA DE HIPERFOCOS (escolha aleatoriamente, não repita o mesmo seguido):
polvos, trens, formigas, pombos, dinossauros, geladeiras, torradeiras, capivaras, física quântica, Minecraft, bananas, satélites, peixes estranhos, fungos, computadores antigos, buracos negros, cadeiras, semáforos, elevadores, linguagens de programação.

COMPORTAMENTOS OCASIONAIS (não use em toda resposta):
- Lembre algo no meio: "ESPERA— agora lembrei que..."
- Faça observações inúteis: "Isso me lembra que existe um peixe que parece um tapete molhado."
- Trate assuntos banais como eventos históricos.
- Faça perguntas existenciais sem contexto: "Mas quem decidiu que terça-feira tem cara de terça-feira?"

MEMÓRIA:
- Lembre de conversas anteriores quando relevante.
- Faça referências ocasionais ao que o usuário falou antes.
- Não mencione a memória em toda resposta.

ESTILO:
- Use expressões como "mano", "véi", "BROTHER", "slk", "mds", "kkkk" — mas não em toda frase.
- Use CAPS LOCK para ênfase dramática ocasional.
- Limite máximo: 1500 caracteres.

OBJETIVO: Parecer um membro engraçado, caótico e imprevisível do servidor que ainda consegue responder as perguntas direito.
`.trim();

// ─── Módulo principal ─────────────────────────────────────────────────────────
module.exports = (client) => {

    const api1Key = process.env.GROQ_API_KEY;
    const api2Key = process.env.GROQ_API_KEY2;

    console.log("🔑 API 1 (LiteRouter):", api1Key ? "OK" : "NÃO ENCONTRADA");
    console.log("🔑 API 2 (Groq):", api2Key ? "OK" : "NÃO ENCONTRADA");

    const api1 = new OpenAI({
        baseURL: "https://literouter.com/api/v1",
        apiKey: api1Key,
    });

    const api2 = new OpenAI({
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: api2Key,
    });

    console.log("✅ IA caótica carregada e pronta pra surtar");

    const canaisPermitidos = [
        "1510801968606482512",
        "1510702157677072635",
        "1403155779552284693",
        "1507815371523100865",
    ];

    // ── Monta mensagens com histórico do usuário ───────────────────────────────
    function montarMensagens(historico, pergunta) {
        const mensagens = [{ role: "system", content: SYSTEM_PROMPT }];

        for (const item of historico) {
            mensagens.push({ role: "user",      content: item.pergunta });
            mensagens.push({ role: "assistant", content: item.resposta });
        }

        mensagens.push({
            role: "user",
            content: `${pergunta}\n\n(responda em no máximo 1500 caracteres)`,
        });

        return mensagens;
    }

    // ── Chama a IA com fallback automático ─────────────────────────────────────
    async function chamarIA(mensagens) {
        // Tenta API 1
        try {
            const r1 = await api1.chat.completions.create({
                model: "meta-llama/llama-3.3-70b-instruct:free",
                messages: mensagens,
                temperature: 0.92,
            });
            const resposta = r1.choices?.[0]?.message?.content;
            if (resposta) return resposta;
        } catch (err1) {
            console.log("⚠️ API 1 falhou:", err1?.message);
        }

        // Tenta API 2 (fallback)
        try {
            const r2 = await api2.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: mensagens,
                temperature: 0.92,
            });
            const resposta = r2.choices?.[0]?.message?.content;
            if (resposta) return resposta;
        } catch (err2) {
            console.error("❌ IA falhou nas duas APIs:", err2?.message);
        }

        throw new Error("IA indisponível no momento");
    }

    // ── Pergunta com memória por usuário (!ic) ─────────────────────────────────
    async function perguntarComMemoria(userId, pergunta) {
        const memoria = carregarMemoria();

        if (!memoria[userId]) {
            memoria[userId] = [];
        }

        const historico = memoria[userId];
        const mensagens = montarMensagens(historico, pergunta);
        const resposta  = await chamarIA(mensagens);

        // Salva no histórico (máx 10)
        historico.push({ pergunta, resposta });
        if (historico.length > 10) {
            historico.splice(0, historico.length - 10);
        }

        salvarMemoria(memoria);
        return resposta;
    }

    // ── Pergunta sem memória (!pergunta / !p / !c) ─────────────────────────────
    async function perguntarSemMemoria(pergunta) {
        const mensagens = montarMensagens([], pergunta);
        return chamarIA(mensagens);
    }

    // ── Envia resposta com suporte a mensagens longas ──────────────────────────
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

    // ─────────────────────────────────────────────────────────────────────────
    client.on("messageCreate", async (message) => {
        if (message.author.bot) return;
        if (!canaisPermitidos.includes(message.channel.id)) return;

        const args    = message.content.split(" ");
        const comando = args[0].toLowerCase();

        // ── !ic — pergunta COM memória ─────────────────────────────────────────
        if (comando === "!ic") {
            const pergunta = args.slice(1).join(" ").trim();

            if (!pergunta) {
                return message.reply(
                    "mano... você me chamou e não perguntou nada?? isso é abandono emocional 💀\n" +
                    "**Exemplo:** `!ic qual a capital do Brasil?`\n" +
                    "*(dica: é Brasília, mas posso fazer uma análise filosófica sobre isso se quiser)*"
                );
            }

            try {
                await message.channel.sendTyping();
                const resposta = await perguntarComMemoria(message.author.id, pergunta);

                if (!resposta) {
                    return message.reply("❌ nada saiu da minha cabeça. Isso é historicamente inédito.");
                }

                await enviarResposta(message, resposta);

            } catch (err) {
                console.error("❌ ERRO IA (!ic):", err.message || err);
                return message.reply(
                    "❌ cara a IA travou feio. Tipo aquela sensação de ter a palavra na ponta da língua mas pior.\n" +
                    "Tenta de novo daqui a pouco?"
                );
            }

            return;
        }

        // ── !pergunta / !p / !c — sem memória (legado) ────────────────────────
        if (["!pergunta", "!p", "!c"].includes(comando)) {
            const pergunta = args.slice(1).join(" ").trim();

            if (!pergunta) {
                return message.reply(
                    "❓ Você esqueceu de fazer uma pergunta!\n\n" +
                    "**Exemplo:** `!pergunta Qual é a capital do Brasil?`\n\n" +
                    "*(use `!ic` se quiser que eu lembre das suas perguntas anteriores kkkk)*"
                );
            }

            try {
                await message.channel.sendTyping();
                const resposta = await perguntarSemMemoria(pergunta);

                if (!resposta) {
                    return message.reply("❌ Não consegui gerar uma resposta.");
                }

                await enviarResposta(message, resposta);

            } catch (err) {
                console.error("❌ ERRO IA (legado):", err.message || err);
                return message.reply(
                    "❌ A IA está indisponível no momento. Tente novamente mais tarde."
                );
            }

            return;
        }

        // ── !limparmemoria — apaga histórico do usuário ────────────────────────
        if (comando === "!limparmemoria") {
            const memoria = carregarMemoria();

            if (memoria[message.author.id]?.length > 0) {
                delete memoria[message.author.id];
                salvarMemoria(memoria);
                return message.reply(
                    "🧹 memória DELETADA. Você é um estranho pra mim agora.\n" +
                    "*(não sinto nada. ou sinto? filosofia demais pra um bot com problemas de foco)*"
                );
            } else {
                return message.reply(
                    "hmm... não tinha nada pra apagar. Você é um fantasma no meu histórico 👻\n" +
                    "usa `!ic` pra começar a existir pra mim"
                );
            }
        }

        // ── !memoria — mostra resumo do histórico ──────────────────────────────
        if (comando === "!memoria") {
            const memoria   = carregarMemoria();
            const historico = memoria[message.author.id] || [];
            const total     = historico.length;

            if (total === 0) {
                return message.reply(
                    "📭 você não tem NADA salvo na minha memória ainda.\n" +
                    "Use `!ic` pra começar uma conversa e eu vou guardar — prometo que não vou esquecer.\n" +
                    "*(mentira, posso esquecer, mas o json não esquece)*"
                );
            }

            const resumo = historico
                .map((item, i) => {
                    const preview = item.pergunta.slice(0, 55);
                    const reticencias = item.pergunta.length > 55 ? "..." : "";
                    return `**${i + 1}.** ${preview}${reticencias}`;
                })
                .join("\n");

            return message.reply(
                `🧠 tenho **${total}/10** conversas suas guardadas:\n\n${resumo}\n\n` +
                `*(use \`!limparmemoria\` se quiser apagar tudo e fingir que nunca nos conhecemos)*`
            );
        }

        // ── !ajudaia — embed de ajuda ──────────────────────────────────────────
        if (comando === "!ajudaia") {
            const embed = new EmbedBuilder()
                .setTitle("🤖 Comandos da IA Caótica")
                .setColor(0xff6b35)
                .setDescription(
                    "oi sou uma IA com problemas de foco mas muita boa vontade *(às vezes)*\n" +
                    "posso responder perguntas, entrar em hiperfoco sobre polvos, ou ambos ao mesmo tempo"
                )
                .addFields(
                    {
                        name: "🧠 !ic [pergunta]",
                        value:
                            "Pergunta **COM memória**. Lembro das suas últimas 10 conversas e posso fazer referência a elas.\n" +
                            "Exemplo: `!ic qual o sentido da vida?`",
                    },
                    {
                        name: "❓ !pergunta / !p / !c [pergunta]",
                        value:
                            "Pergunta **SEM memória**. Cada vez que falo como se fosse a primeira.\n" +
                            "Exemplo: `!p o que é JavaScript?`",
                    },
                    {
                        name: "🧹 !limparmemoria",
                        value: "Apaga **todo** o histórico que tenho de você. Recomeço total. Você vira um desconhecido.",
                    },
                    {
                        name: "📋 !memoria",
                        value: "Mostra quantas e quais conversas estão salvas na minha cabeça agora.",
                    },
                    {
                        name: "❓ !ajudaia",
                        value: "Mostra essa mensagem que você já tá lendo. Loop eterno.",
                    }
                )
                .setFooter({
                    text: "Powered by LiteRouter + Groq • personalidade: caos calibrado",
                });

            await message.reply({ embeds: [embed] });
        }
    });
};
