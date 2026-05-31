const { EmbedBuilder } = require("discord.js");
const OpenAI = require("openai");

module.exports = (client) => {

    const apiKey = process.env.GROQ_API_KEY;

    console.log("🔑 API KEY:", apiKey ? "OK" : "NÃO ENCONTRADA");

    if (!apiKey) {
        console.error("❌ GROQ_API_KEY não foi definida no Railway!");
    }

    const openai = new OpenAI({
        baseURL: "https://literouter.com/api/v1",
        apiKey: apiKey
    });

    console.log("✅ Sistema de IA carregado");

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

                const respostaIA = await openai.chat.completions.create({
                    model: "llama-3-8b-instruct:free",
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

                const resposta =
                    respostaIA?.choices?.[0]?.message?.content ||
                    "Não consegui gerar uma resposta.";

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

                console.error("❌ ERRO IA:", err?.message || err);

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
                    text: "Powered by LiteRouter + Llama 3.3"
                });

            await message.reply({ embeds: [embed] });
        }

    });

};
