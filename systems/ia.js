const { EmbedBuilder } = require("discord.js");
const OpenAI = require("openai");

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

    async function perguntarIA(pergunta) {

        // API 1 (LiteRouter)
        try {
            const r1 = await api1.chat.completions.create({
                model: "meta-llama/llama-3.3-70b-instruct:free",
                messages: [
                    {
                        role: "system",
                        content: "Você é um assistente útil, inteligente e amigável dentro de um servidor Discord."
                    },
                    {
                        role: "user",
                        content: pergunta
                    }
                ],
                temperature: 0.7
            });

            return r1.choices?.[0]?.message?.content;

        } catch (err1) {
            console.log("⚠️ API 1 falhou, tentando API 2...");
        }

        // API 2 (Groq)
        try {
            const r2 = await api2.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: "Você é um assistente útil, inteligente e amigável dentro de um servidor Discord."
                    },
                    {
                        role: "user",
                        content: pergunta
                    }
                ],
                temperature: 0.7
            });

            return r2.choices?.[0]?.message?.content;

        } catch (err2) {
            console.error("❌ IA falhou em todas as APIs:", err2?.message || err2);
            throw new Error("IA indisponível no momento");
        }
    }

    client.on("messageCreate", async (message) => {

        if (message.author.bot) return;

        if (message.content.toLowerCase().startsWith("!pergunta")) {

            const pergunta = message.content.slice(10).trim();

            if (!pergunta) {
                return message.reply(
                    "❓ Você esqueceu de fazer uma pergunta!\n\n" +
                    "**Exemplo:** `!pergunta Qual é a capital do Brasil?`"
                );
            }

            try {

                await message.channel.sendTyping();

                const resposta = await perguntarIA(pergunta);

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

        if (message.content.toLowerCase() === "!ajudaia") {

            const embed = new EmbedBuilder()
                .setTitle("🤖 Comandos da IA")
                .setColor(0x0099ff)
                .addFields(
                    {
                        name: "❓ !pergunta",
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
