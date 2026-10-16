FROM node:24-alpine
WORKDIR /app
COPY app/ /app/
ENV PORT=8080 BIND=0.0.0.0 DATA_DIR=/data PUBLIC_DIR=/app/public
EXPOSE 8080
CMD ["node", "server/serve.mjs"]
