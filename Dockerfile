# Puxador de Dados — imagem oficial
FROM node:22-alpine

# su-exec permite ajustar o dono do volume e depois rodar como usuario node
RUN apk add --no-cache su-exec

WORKDIR /app

# dependencias primeiro (melhor cache)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

ENV NODE_ENV=production \
    PORT=8790 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

RUN mkdir -p /data \
    && chown -R node:node /app /data \
    && chmod +x /app/docker/entrypoint.sh

VOLUME ["/data"]
EXPOSE 8790

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8790)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# O entrypoint roda como root apenas para corrigir o dono de /data
# e em seguida executa a aplicacao como usuario node.
ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["node", "server.js"]
