const fs = require('fs');
const axios = require('axios');
const path = require('path');
const archiver = require('archiver');


function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}


async function backupServer(guild) {
    const basePath = `./global-backup`;
    const channelsPath = `${basePath}/channels`;
    const filesPath = `${basePath}/files`;

    fs.mkdirSync(basePath, { recursive: true });
    fs.mkdirSync(channelsPath, { recursive: true });
    fs.mkdirSync(filesPath, { recursive: true });

    const serverData = [];

    for (const channel of guild.channels.cache.values()) {
        if (!channel.isTextBased()) continue;

        let allMessages = [];
        let lastId;

        while (true) {
            const options = { limit: 100 };
            if (lastId) options.before = lastId;

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) break;

            allMessages.push(...messages.values());
            lastId = messages.last().id;
        }

        const formatted = [];

        for (const msg of allMessages.reverse()) {
            let attachments = [];

            for (const att of msg.attachments.values()) {
                const fileName = `${Date.now()}-${att.name}`;
                const filePath = `${filesPath}/${fileName}`;

                try {
                    const response = await axios.get(att.url, { responseType: 'arraybuffer' });
                    fs.writeFileSync(filePath, response.data);
                    attachments.push(fileName);
                } catch {
                    attachments.push(att.url);
                }
            }

            formatted.push({
                author: msg.author.tag,
                content: msg.content || "",
                attachments
            });
        }

        fs.writeFileSync(
            `${channelsPath}/${channel.name}.json`,
            JSON.stringify(formatted, null, 2)
        );

        serverData.push({
            name: channel.name,
            type: channel.type
        });
    }

    fs.writeFileSync(
        `${basePath}/server.json`,
        JSON.stringify(serverData, null, 2)
    );

    console.log("📦 Backup completo salvo em ./global-backup");
}


async function zipBackup() {
    return new Promise((resolve, reject) => {
        const zipPath = `global-backup.zip`;
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip');

        output.on('close', () => resolve(zipPath));
        archive.on('error', err => reject(err));

        archive.pipe(output);
        archive.directory(`./global-backup`, false);
        archive.finalize();
    });
}


function splitFile(filePath, chunkSize = 20 * 1024 * 1024) {
    const buffer = fs.readFileSync(filePath);
    const parts = [];

    let index = 0;
    for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.slice(i, i + chunkSize);
        const partName = `${filePath}.part${index}`;

        fs.writeFileSync(partName, chunk);
        parts.push(partName);
        index++;
    }

    return parts;
}


async function restoreServer(guild) {
    const basePath = `./global-backup`;
    const channelsPath = `${basePath}/channels`;
    const filesPath = `${basePath}/files`;

    if (!fs.existsSync(basePath)) {
        console.log("❌ Backup não encontrado!");
        return;
    }

    let serverData;
    try {
        serverData = JSON.parse(fs.readFileSync(`${basePath}/server.json`));
    } catch (err) {
        console.log("❌ ERRO server.json:", err.message);
        return;
    }

    console.log("📁 Restaurando sem apagar canais...");

    for (const ch of serverData) {

        let existingChannel = guild.channels.cache.find(c => c.name === ch.name);

        let newChannel;

        if (existingChannel) {
            newChannel = existingChannel;
        } else {
            newChannel = await guild.channels.create({
                name: ch.name,
                type: 0
            });

            await sleep(1000);
        }

        const filePathJson = `${channelsPath}/${ch.name}.json`;
        if (!fs.existsSync(filePathJson)) continue;

        let messages;
        try {
            messages = JSON.parse(fs.readFileSync(filePathJson));
        } catch {
            continue;
        }

        messages = messages.slice(0, 300);

        for (const msg of messages) {
            let content = `**${msg.author}:** ${msg.content}`;

            
            const parts = content.match(/[\s\S]{1,1900}/g) || [];

            for (const part of parts) {
                try {
                    if (msg.attachments.length > 0) {
                        for (const file of msg.attachments) {
                            const filePath = path.join(filesPath, file);

                            if (fs.existsSync(filePath)) {
                                await newChannel.send({
                                    content: part,
                                    files: [filePath]
                                });
                            } else {
                                await newChannel.send(part + "\n" + file);
                            }

                            await sleep(1200);
                        }
                    } else {
                        await newChannel.send(part);
                        await sleep(800);
                    }
                } catch (err) {
                    console.log("⚠️ Erro:", err.message);
                    await sleep(2000);
                }
            }
        }
    }

    console.log("✅ Restore finalizado!");
}




module.exports = {
    backupServer,
    restoreServer,
    zipBackup,
    splitFile,
};
