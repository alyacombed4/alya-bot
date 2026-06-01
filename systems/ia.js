const { EmbedBuilder } = require("discord.js");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const MEMORIA_FILE = path.join(__dirname, "memoriaIA.json");

if (!fs.existsSync(MEMORIA_FILE)) {
    fs.writeFileSync(MEMORIA_FILE, JSON.stringify({}, null, 2));
}

function carregarMemoria() {
    return JSON.parse(fs.readFileSync(MEMORIA_FILE, "utf8"));
}

function salvarMemoria(data) {
    fs.writeFileSync(MEMORIA_FILE, JSON.stringify(data, null, 2));
}

module.exports = (client) => {

    const api1Key = process.env.GROQ_API_KEY;   // LiteRouter
    const api2Key = process.env.GROQ_API_KEY2;  // Groq oficial

    console.log("🔑 API 1 (LiteRouter):", api1Key ? "OK" : "NÃO ENCONTRADA");
    console.log("🔑 API 2 (Groq):", api2Key ? "OK" : "NÃO ENCONTRADA");

    const api1 = new OpenAI({
        baseURL: "https://literouter.com/api/v1",
        apiKey: api1Key
    });

    const api2 = new OpenAI({
        baseURL: "https://api.groq.com/openai/v1",
        apiKey: api2Key
    });

    console.log("✅ Sistema de IA carregado");

    async function perguntarIA(userId, pergunta) {

        const memoria = carregarMemoria();

        if (!memoria[userId]) {
            memoria[userId] = [];
        }

        const historico = memoria[userId];

        const mensagens = [
            {
                role: "system",
                content:
                    "Você é um assistente útil, inteligente e amigável dentro de um servidor Discord."
            }
        ];

        for (const item of historico) {
            mensagens.push({
                role: "user",
                content: item.pergunta
            });

            mensagens.push({
                role: "assistant",
                content: item.resposta
            });
        }

        mensagens.push({
            role: "user",
            content: `${pergunta}\n\nResuma em 500 caracteres.`
        });

        // API 1 (LiteRouter)
        try {
            const r1 = await api1.chat.completions.create({
                model: "meta-llama/llama-3.3-70b-instruct:free",
                messages: mensagens,
                temperature: 0.7
            });

            const resposta = r1.choices?.[0]?.message?.content;

            historico.push({
                pergunta,
                resposta
            });

            if (historico.length > 10) {
                historico.splice(0, historico.length - 10);
            }

            salvarMemoria(memoria);

            return resposta;

        } catch (err1) {
            console.log("⚠️ API 1 falhou, tentando API 2...");
        }

        // API 2 (Groq)
        try {
            const r2 = await api2.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: mensagens,
                temperature: 0.7
            });

            const resposta = r2.choices?.[0]?.message?.content;

            historico.push({
                pergunta,
                resposta
            });

            if (historico.length > 10) {
                historico.splice(0, historico.length - 10);
            }

            salvarMemoria(memoria);

            return resposta;

        } catch (err2) {
            console.error("❌ IA falhou em todas as APIs:", err2?.message || err2);
            throw new Error("IA indisponível no momento");
        }
    }

    client.on("messageCreate", async (message) => {

        if (message.author.bot) return;

        const canaisPermitidos = [
            "1510801968606482512",
            "1510702157677072635",
            "1403155779552284693",
            "1507815371523100865"
        ];

        if (!canaisPermitidos.includes(message.channel.id)) return;

        const args = message.content.split(" ");
        const comando = args[0].toLowerCase();

        if (
            comando === "!pergunta" ||
            comando === "!p" ||
            comando === "!c"
        ) {

            const pergunta = args.slice(1).join(" ");

            if (!pergunta) {
                return message.reply(
                    "❓ Você esqueceu de fazer uma pergunta!\n\n" +
                    "**Exemplo:** `!pergunta Qual é a capital do Brasil?`"
                );
            }

            try {

                await message.channel.sendTyping();

                const resposta = await perguntarIA(
                    message.author.id,
                    pergunta
                );

                if (!resposta) {
                    return message.reply("❌ Não consegui gerar uma resposta.");
                }

                if (resposta.length > 1900) {

                    const partes = resposta.match(/[\s\S]{1,1900}/g);

                    await message.reply(`🤖 **Resposta:**\n${partes[0]}`);

                    for (let i = 1; i < partes.length; i++) {
                        await message.channel.send(partes[i]);
                    }

                } else {

                    await message.reply(`🤖 **Resposta:**\n${resposta}`);
                }

            } catch (err) {

                console.error("❌ ERRO IA FINAL:", err.message || err);

                return message.reply(
                    "❌ A IA está indisponível no momento. Tente novamente mais tarde."
                );
            }
        }

        if (comando === "!ajudaia") {

            const embed = new EmbedBuilder()
                .setTitle("🤖 Comandos da IA")
                .setColor(0x0099ff)
                .addFields(
                    {
                        name: "❓ !pergunta / !p / !c",
                        value: "Faça uma pergunta para a IA."
                    },
                    {
                        name: "📖 Exemplo",
                        value: "`!pergunta O que é JavaScript?`"
                    }
                )
                .setFooter({
                    text: "Powered by LiteRouter + Groq Fallback"
                });

            await message.reply({ embeds: [embed] });
        }

    });

};
