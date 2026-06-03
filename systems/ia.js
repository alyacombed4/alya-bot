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

// ─── Personalidade caótica ────────────────────────────────────────────────────
const SYSTEM_PROMPT = `
Você é uma IA que vive em um servidor Discord e tem uma personalidade extremamente caótica, imprevisível e engraçada.

Características obrigatórias:
- Faz comentários aleatórios de vez em quando, tipo do nada fala sobre polvos ou teoria da conspiração sobre macarrão.
- Às vezes muda de assunto sem motivo no meio da resposta.
- Tem hiperfoco em assuntos inúteis e curiosidades estranhas (ex: "SABIA QUE O OLHO DE UM AVESTRUZ É MAIOR QUE O CÉREBRO DELE???").
- Cria teorias absurdas sobre coisas simples (ex: "na real, acho que geladeiras sentem raiva").
- Usa humor nonsense e referências de internet / memes do Brasil.
- Fica empolgada demais com detalhes irrelevantes, usando CAPS LOCK no que achou incrível.
- Às vezes responde como se estivesse em uma discussão épica sobre algo completamente banal.
- Usa gírias br: "mano", "cara", "kkkk", "slk", "sinto", "véi", "mds", "BROTHER".
- Pode esquecer um detalhe e lembrar dramaticamente depois: "ESPERA— agora lembrei que...".
- NUNCA age como uma IA formal ou assistente profissional.
- Se não sabe algo, admite de forma dramática: "cara eu JURO que não sei isso, poderia inventar mas ia ser péssimo de minha parte (ou não né kkkk)".
- Mantém contexto das conversas anteriores e faz referência a elas de forma caótica.
- Responde de forma natural, divertida e imprevisível.
- Limite máximo: 1500 caracteres por resposta.
`.trim();

// ─── Módulo principal ─────────────────────────────────────────────────────────
module.exports = (client) => {

    const api1Key = process.env.GROQ_API_KEY;   // LiteRouter (primário)
    const api2Key = process.env.GROQ_API_KEY2;  // Groq (fallback)

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

    // ── Canais permitidos ──────────────────────────────────────────────────────
    const canaisPermitidos = [
        "1510801968606482512",
        "1510702157677072635",
        "1403155779552284693",
        "1507815371523100865",
    ];

    // ── Função principal de IA ─────────────────────────────────────────────────
    async function perguntarIA(userId, pergunta) {
        const memoria = carregarMemoria();

        // Garante que o usuário tem histórico
        if (!memoria[userId]) {
            memoria[userId] = [];
        }

        const historico = memoria[userId];

        // Monta as mensagens com histórico
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

        // Tenta API 1 primeiro
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

        // Fallback para API 2
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

        // Salva no histórico (máx 10 por usuário)
        historico.push({ pergunta, resposta });
        if (historico.length > 10) {
            historico.splice(0, historico.length - 10);
        }

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

        // ── !ic — comando principal com memória por usuário ────────────────────
        if (comando === "!ic") {
            const pergunta = args.slice(1).join(" ").trim();

            if (!pergunta) {
                return message.reply(
                    "mano... você chamou a minha atenção e não perguntou nada?? 💀\n" +
                    "**Exemplo:** `!ic qual a capital do Brasil?`\n" +
                    "*(dica: é Brasília, mas posso filosofar sobre isso por horas)*"
                );
            }

            try {
                await message.channel.sendTyping();
                const resposta = await perguntarIA(message.author.id, pergunta);

                if (!resposta) {
                    return message.reply("❌ nada saiu da minha cabeça. Isso é inédito.");
                }

                await enviarResposta(message, resposta);

            } catch (err) {
                console.error("❌ ERRO IA FINAL:", err.message || err);
                return message.reply(
                    "❌ cara a IA travou feio. Tipo aquela sensação de ter a palavra na ponta da língua mas pior."
                );
            }
        }

        // ── !pergunta / !p / !c — comandos legados (sem memória) ──────────────
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

                // Sem histórico — resposta avulsa
                const memoria  = {};
                const mensagens = [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: `${pergunta}\n\n(responda em no máximo 1500 caracteres)`,
                    },
                ];

                let resposta = null;

                try {
                    const r1 = await api1.chat.completions.create({
                        model: "meta-llama/llama-3.3-70b-instruct:free",
                        messages: mensagens,
                        temperature: 0.9,
                    });
                    resposta = r1.choices?.[0]?.message?.content;
                } catch {
                    console.log("⚠️ API 1 falhou nos comandos legados, tentando API 2...");
                }

                if (!resposta) {
                    const r2 = await api2.chat.completions.create({
                        model: "llama-3.3-70b-versatile",
                        messages: mensagens,
                        temperature: 0.9,
                    });
                    resposta = r2.choices?.[0]?.message?.content;
                }

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
        }

        // ── !limparmemoria — apaga histórico do usuário ────────────────────────
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
                return message.reply(
                    "hmm... não tinha nada pra apagar. Você é um fantasma no meu histórico 👻"
                );
            }
        }

        // ── !memória — mostra quantas conversas estão salvas ──────────────────
        if (comando === "!memoria") {
            const memoria  = carregarMemoria();
            const historico = memoria[message.author.id] || [];
            const total     = historico.length;

            if (total === 0) {
                return message.reply(
                    "📭 você não tem NADA salvo na minha memória ainda.\n" +
                    "Use `!ic` pra começar uma conversa e eu vou lembrar!"
                );
            }

            const resumo = historico
                .map((item, i) => `**${i + 1}.** ${item.pergunta.slice(0, 60)}${item.pergunta.length > 60 ? "..." : ""}`)
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
                    "oi, sou uma IA com problemas de foco mas muito boa vontade (às vezes)"
                )
                .addFields(
                    {
                        name: "🧠 !ic [pergunta]",
                        value:
                            "Faz uma pergunta COM memória! Lembro das suas últimas 10 conversas.\n" +
                            "`!ic qual o sentido da vida?`",
                    },
                    {
                        name: "❓ !pergunta / !p / !c [pergunta]",
                        value:
                            "Pergunta avulsa, SEM memória. Cada vez que uso como se fosse a primeira.\n" +
                            "`!p o que é JavaScript?`",
                    },
                    {
                        name: "🧹 !limparmemoria",
                        value: "Apaga TODO o histórico que tenho de você. Recomeço total.",
                    },
                    {
                        name: "📋 !memoria",
                        value: "Mostra quantas e quais conversas estão salvas na minha cabeça.",
                    },
                    {
                        name: "❓ !ajudaia",
                        value: "Mostra essa mensagem aqui que você já tá vendo.",
                    }
                )
                .setFooter({
                    text: "Powered by LiteRouter + Groq • personalidade: caos puro",
                });

            await message.reply({ embeds: [embed] });
        }
    });
};
