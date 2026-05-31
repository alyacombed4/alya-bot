const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const Groq = require("groq-sdk");

// ================================
// CONFIGURAÇÕES
// ================================
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// ================================

const groq = new Groq({
    apiKey: GROQ_API_KEY
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once("ready", () => {
    console.log(`✅ Bot conectado como: ${client.user.tag}`);
    console.log("✅ Groq carregado com sucesso");
});

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
                chatCompletion.choices[0].message.content;

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

            console.error(err);

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
                `❌ Erro ao processar sua pergunta:\n\`${err.message}\``
            );
        }
    }

    // ================================
    // COMANDO !AJUDA
    // ================================
    if (message.content.toLowerCase() === "!ajuda") {

        const embed = new EmbedBuilder()
            .setTitle("📖 Comandos do Bot")
            .setDescription("Lista de comandos disponíveis")
            .setColor(0x0099ff)
            .addFields(
                {
                    name: "❓ !pergunta",
                    value: "Faça uma pergunta para a IA.\nExemplo: `!pergunta O que é JavaScript?`"
                },
                {
                    name: "📖 !ajuda",
                    value: "Mostra esta mensagem."
                }
            )
            .setFooter({
                text: "Powered by Groq + Llama 3.3 🚀"
            });

        await message.reply({
            embeds: [embed]
        });
    }
});

client.login(DISCORD_TOKEN);