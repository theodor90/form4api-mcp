# Build and run the Form4API MCP server (stdio transport).
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
