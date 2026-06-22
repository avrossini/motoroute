#!/bin/sh
set -e

# O bind-mount .:/app sobrescreve o /app da imagem, incluindo node_modules.
# Sempre instalar dependências ao iniciar para garantir que o container
# use versões corretas (compiladas para Linux/Alpine, não para o host Windows).
echo "[expo] Instalando dependências..."
npm install --legacy-peer-deps --prefer-offline 2>&1 | tail -3
echo "[expo] Pronto."

exec "$@"
