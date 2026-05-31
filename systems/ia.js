const { EmbedBuilder } = require("discord.js");
const Groq = require("groq-sdk");

module.exports = (client) => {

    const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY
    });

    console.log("✅ Sistema de IA carregado");

    client.on("messageCreate", async (message) => {

        if (message.author.bot) return;

        // ================================
        // COMANDO !PERGUNTA
        // ================================
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

                const chatCompletion =
                    await groq.chat.completions.create({
                        messages: [
                            {
                                role: "system",
                                content:
                                    "Você é um assistente útil, inteligente e amigável dentro de um servidor Discord."
                            },
                            {
                                role: "user",
                                content: pergunta
                            }
                        ],
                        model: "llama-3.3-70b-versatile",
                        temperature: 0.7,
                        max_tokens: 2048
                    });

                const resposta =
                    chatCompletion.choices[0]?.message?.content ||
                    "Não consegui gerar uma resposta.";

                if (resposta.length > 1900) {

                    const partes =
                        resposta.match(/[\s\S]{1,1900}/g);

                    await message.reply(
                        `🤖 **Resposta:**\n${partes[0]}`
                    );

                    for (let i = 1; i < partes.length; i++) {
                        await message.channel.send(partes[i]);
                    }

                } else {

                    await message.reply(
                        `🤖 **Resposta:**\n${resposta}`
                    );

                }

            } catch (err) {

                console.error("ERRO IA:", err);

                if (
                    err.message?.includes("429") ||
                    err.status === 429
                ) {
                    return message.reply(
                        "⚠️ Limite da API atingido. Tente novamente mais tarde."
                    );
                }

                if (
                    err.message?.includes("401") ||
                    err.status === 401
                ) {
                    return message.reply(
                        "⚠️ API Key inválida."
                    );
                }

                return message.reply(
                    "❌ Erro ao processar sua pergunta."
                );
            }
        }

        // ================================
        // COMANDO !AJUDAIA
        // ================================
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
                    text: "Powered by Groq + Llama 3.3"
                });

            await message.reply({
                embeds: [embed]
            });
        }

    });

};
