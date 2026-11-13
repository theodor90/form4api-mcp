# Build and run the Form4API MCP server (stdio by default; HTTP with MCP_TRANSPORT=http).
# The server starts without FORM4API_KEY — keyless tools (get_public_stats,
# get_data_quality) work immediately; everything else returns setup guidance
# until the key is provided:  docker run -e FORM4API_KEY=... <image>
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci --ignore-scripts && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist ./dist
ENTRYPOINT ["node", "dist/index.js"]

# Hosted HTTP mode: run with  -e MCP_TRANSPORT=http  (or pass --http) and publish port 3000.
# The image defaults to stdio, so the healthcheck below passes trivially unless
# MCP_TRANSPORT=http is set, in which case it probes GET /healthz.
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "if(process.env.MCP_TRANSPORT!=='http')process.exit(0);fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
