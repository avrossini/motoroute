FROM node:20-alpine

# Dependências do sistema necessárias para módulos nativos (ex: sharp, canvas)
RUN apk add --no-cache git python3 make g++

WORKDIR /app

# Copiar manifesto antes do código — melhor uso do cache de camadas Docker.
# Se apenas o código mudar (não o package.json), o npm install não é reexecutado.
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# O código-fonte é montado como volume em desenvolvimento (ver docker-compose.yml),
# então COPY . . só é relevante em builds de produção.
COPY . .

# Entrypoint: instala node_modules no volume nomeado se estiver vazio (primeira execução)
COPY docker/expo-entrypoint.sh /usr/local/bin/expo-entrypoint.sh
RUN chmod +x /usr/local/bin/expo-entrypoint.sh

# Portas do Expo: 8081 (web), 19000 (Expo Go), 19001 (Metro inspector)
EXPOSE 8081 19000 19001

ENV EXPO_PACKAGER_PROXY_URL=http://localhost:8081
ENV REACT_NATIVE_PACKAGER_HOSTNAME=localhost

ENTRYPOINT ["/usr/local/bin/expo-entrypoint.sh"]
CMD ["npx", "expo", "start", "--web", "--localhost"]
