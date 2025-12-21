FROM oven/bun:1.1.26

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY . .

CMD ["bun", "e2e/parent.ts"]
