const fs = require("fs");
const { EmbedBuilder } = require("discord.js");
const OpenAI = require("openai");
 
// ─── Memória ─────────────────────────────────────────────────────────────────
 
const MEMORY_FILE = "./memory.json";
 
if (!fs.existsSync(MEMORY_FILE)) {
    fs.writeFileSync(MEMORY_FILE, "{}");
}
 
function loadMemory() {
    try {
        return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    } catch {
        return {};
    }
}
 
function saveMemory(data) {
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2));
}
 
// ─── Módulo principal ─────────────────────────────────────────────────────────
 
module.exports = (client) => {
 
    const openai = new OpenAI({
        baseURL: "https://literouter.com/api/v1",
        apiKey: process.env.GROQ_API_KEY,
    });
 
    console.log("✅ Sistema de IA carregado");
 
    client.on("messageCreate", async (message) => {
 
        // Ignora bots antes de qualquer coisa
        if (message.author.bot) return;
 
        const conteudo = message.content.toLowerCase();
 
        // ── !iniciarchat ──────────────────────────────────────────────────────
        if (conteudo === "!iniciarchat") {
            const memory = loadMemory();
            memory[message.author.id] = [];
            saveMemory(memory);
 
            return message.reply(
                "✅ Chat iniciado! Agora a IA lembrará das últimas 10 interações."
            );
        }
 
        // ── !pergunta ─────────────────────────────────────────────────────────
        if (conteudo.startsWith("!pergunta")) {
            const pergunta = message.content.slice("!pergunta".length).trim();
            const memory = loadMemory();
 
            // Verifica se o usuário iniciou o chat
            if (!memory[message.author.id]) {
                return message.reply(
                    "❌ Use `!iniciarchat` antes de conversar comigo."
                );
            }
 
            // Verifica se a pergunta não está vazia
            if (!pergunta) {
                return message.reply(
                    "❓ Você esqueceu de fazer uma pergunta!\n\n" +
                    "**Exemplo:** `!pergunta Qual é a capital do Brasil?`"
                );
            }
 
            try {
                await message.channel.sendTyping();
 
                // Histórico do usuário (últimas 20 mensagens = 10 interações)
                const historico = memory[message.author.id];
 
                const respostaIA = await openai.chat.completions.create({
                    model: "meta-llama/llama-3.3-70b-instruct:free",
                    messages: [
                        {
                            role: "system",
                            content: "Você é um assistente útil, inteligente e amigável dentro de um servidor Discord.",
                        },
                        ...historico,
                        {
                            role: "user",
                            content: pergunta,
                        },
                    ],
                    temperature: 0.7,
                });
 
                const resposta =
                    respostaIA.choices?.[0]?.message?.content?.trim() ||
                    "Não consegui gerar uma resposta.";
 
                // Salva a interação no histórico
                memory[message.author.id].push({ role: "user", content: pergunta });
                memory[message.author.id].push({ role: "assistant", content: resposta });
 
                // Mantém apenas as últimas 20 mensagens (10 interações)
                if (memory[message.author.id].length > 20) {
                    memory[message.author.id] = memory[message.author.id].slice(-20);
                }
 
                saveMemory(memory);
 
                // Envia a resposta (dividindo se for muito longa)
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
                console.error("ERRO IA:", err);
                return message.reply(
                    `❌ Erro ao processar a pergunta.\n\`${err.message}\``
                );
            }
        }
 
        // ── !ajudaia ──────────────────────────────────────────────────────────
        if (conteudo === "!ajudaia") {
            const embed = new EmbedBuilder()
                .setTitle("🤖 Comandos da IA")
                .setColor(0x0099ff)
                .addFields(
                    {
                        name: "🚀 !iniciarchat",
                        value: "Inicia uma conversa com a IA e ativa a memória.",
                    },
                    {
                        name: "❓ !pergunta",
                        value: "Faz uma pergunta para a IA.",
                    },
                    {
                        name: "📖 Exemplo",
                        value: "`!pergunta O que é JavaScript?`",
                    }
                )
                .setFooter({ text: "Powered by LiteRouter + Llama 3.3" });
 
            return message.reply({ embeds: [embed] });
        }
    });
};
