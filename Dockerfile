FROM node:20-slim

# Instala dependências de áudio/voz para @discordjs/voice e sodium-native
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libtool \
    autoconf \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "index.js"]

