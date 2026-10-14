FROM node:24-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Sandbox provider is fixed at build time. just-bash needs nothing extra;
# "docker" would need the Docker socket inside this container.
ARG AGENT_SANDBOX=just-bash
ENV AGENT_SANDBOX=${AGENT_SANDBOX}
RUN npx eve build

ENV NODE_ENV=production \
    PORT=3000 \
    AGENT_DATA_DIR=/app/.data

# Durable state: workflow runs (sessions, parked turns) and the agent's own data.
VOLUME ["/app/.eve/.workflow-data", "/app/.data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/eve/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "eve", "start", "--host", "0.0.0.0"]
