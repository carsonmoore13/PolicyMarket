FROM node:20-slim

WORKDIR /app

# Install root dependencies
COPY package*.json ./
RUN npm install

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Install frontend dependencies and build
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# Copy source
COPY . .

# Build frontend
RUN cd frontend && npm run build

EXPOSE 3001

CMD ["node", "backend/server.js"]
