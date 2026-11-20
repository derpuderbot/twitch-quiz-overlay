version: '3.8'

services:
  quiz-overlay:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: twitch-quiz-overlay-dev
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "9229:9229" # Node inspector port
    environment:
      - NODE_ENV=development
      - PORT=3000
      - SHARED_SECRET=${SHARED_SECRET:-your-super-secret-shared-secret-change-in-production}
    volumes:
      - ./server:/app/server:cached
      - ./public:/app/public:cached
      - ./package.json:/app/package.json:ro
      - ./package-lock.json:/app/package-lock.json:ro
      - ./server/state.json:/app/server/state.json
    command: npm run dev
    stdin_open: true
    tty: true
    networks:
      - quiz-network

networks:
  quiz-network:
    driver: bridge