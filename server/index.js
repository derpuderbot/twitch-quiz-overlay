import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: resolve(__dirname, '../.env') });

const PORT = process.env.PORT || 3000;
const SHARED_SECRET = process.env.SHARED_SECRET || 'default-secret-change-me';
const STATE_FILE = resolve(__dirname, 'state.json');

// Default state
const defaultState = {
  question: {
    id: null,
    text: '',
    answer: '',
    category: '',
    timer: 30
  },
  players: {
    left: {
      name: 'Spieler 1',
      avatar: '',
      points: 0
    },
    right: {
      name: 'Spieler 2',
      avatar: '',
      points: 0
    }
  },
  buzzer: {
    active: false,
    winner: null,
    lockoutUntil: 0,
    lockoutDuration: 5000
  },
  theme: {
    '--bg': '#0E0E10',
    '--bg-elevated': '#18181C',
    '--fg': '#F1F1F3',
    '--fg-muted': '#A0A0A8',
    '--accent': '#9146FF',
    '--accent-strong': '#B388FF',
    '--buzzer-idle': '#2A2A30',
    '--buzzer-hover': '#3A3A44',
    '--buzzer-active-left': '#00FF88',
    '--buzzer-active-right': '#FF4466',
    '--buzzer-lockout': '#FFAA00',
    '--font-display': "'Space Grotesk', sans-serif",
    '--font-ui': "'IBM Plex Sans', sans-serif",
    '--fs-question': 'clamp(1.75rem, 4vw, 3rem)',
    '--fs-points': 'clamp(2.5rem, 6vw, 5rem)',
    '--fs-name': 'clamp(1.1rem, 2.5vw, 1.5rem)',
    '--fs-timer': 'clamp(2rem, 5vw, 4rem)',
    '--frame-aspect': '16 / 9',
    '--frame-gap': 'clamp(16px, 3vw, 32px)',
    '--frame-radius': '16px',
    '--buzzer-glow-spread': '0 0 32px 8px',
    '--transition-fast': '120ms ease-out',
    '--transition-med': '250ms ease-out'
  },
  questions: [],
  timer: {
    active: false,
    remaining: 0,
    total: 30
  },
  overlayConnected: false,
  configConnected: false,
  lastHeartbeat: Date.now()
};

// Load state from file
async function loadState() {
  try {
    const data = await readFile(STATE_FILE, 'utf-8');
    const savedState = JSON.parse(data);
    return { ...defaultState, ...savedState, theme: { ...defaultState.theme, ...savedState.theme } };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return defaultState;
    }
    console.error('Error loading state:', error);
    return defaultState;
  }
}

// Save state to file atomically
async function saveState(state) {
  try {
    const tempFile = STATE_FILE + '.tmp';
    await writeFile(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    await rename(tempFile, STATE_FILE);
  } catch (error) {
    console.error('Error saving state:', error);
  }
}

// Import rename for atomic writes
import { rename } from 'fs/promises';

let state = await loadState();

// Connected clients
const overlayClients = new Set();
const configClients = new Map(); // ws -> { authenticated: boolean }

// Broadcast to all overlay clients
function broadcastToOverlay(message) {
  const data = JSON.stringify(message);
  for (const client of overlayClients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  }
}

// Broadcast to all authenticated config clients
function broadcastToConfig(message) {
  const data = JSON.stringify(message);
  for (const [client, info] of configClients) {
    if (client.readyState === 1 && info.authenticated) {
      client.send(data);
    }
  }
}

// Broadcast to all clients (overlay + authenticated config)
function broadcastAll(message) {
  broadcastToOverlay(message);
  broadcastToConfig(message);
}

// Send full state to a client
function sendState(client) {
  client.send(JSON.stringify({
    type: 'STATE',
    payload: state
  }));
}

// Verify shared secret
function verifyAuth(token) {
  return token === SHARED_SECRET;
}

// Handle config client messages
function handleConfigMessage(ws, message) {
  try {
    const { type, payload } = JSON.parse(message);

    switch (type) {
      case 'AUTH': {
        const authenticated = verifyAuth(payload?.token);
        configClients.set(ws, { authenticated });
        ws.send(JSON.stringify({
          type: 'AUTH_RESULT',
          payload: { success: authenticated }
        }));
        if (authenticated) {
          state.configConnected = true;
          sendState(ws);
          broadcastAll({ type: 'CONNECTION_STATUS', payload: { configConnected: true } });
        }
        break;
      }

      case 'REQUEST_STATE': {
        const clientInfo = configClients.get(ws);
        if (clientInfo?.authenticated) {
          sendState(ws);
        }
        break;
      }

      case 'SET_QUESTION': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        state.question = { ...state.question, ...payload };
        state.timer = {
          active: false,
          remaining: payload.timer || 30,
          total: payload.timer || 30
        };
        saveState(state);
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'NEXT_QUESTION': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        // Find next question in the list
        const currentIndex = state.questions.findIndex(q => q.id === state.question.id);
        const nextIndex = (currentIndex + 1) % state.questions.length;
        if (state.questions.length > 0) {
          state.question = { ...state.questions[nextIndex] };
          state.timer = {
            active: false,
            remaining: state.question.timer || 30,
            total: state.question.timer || 30
          };
          state.buzzer = { ...defaultState.buzzer };
          saveState(state);
          broadcastAll({ type: 'STATE', payload: state });
        }
        break;
      }

      case 'BUZZ': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const now = Date.now();
        if (state.buzzer.lockoutUntil > now) return; // Still in lockout

        const side = payload?.side;
        if (side !== 'left' && side !== 'right') return;

        state.buzzer = {
          active: true,
          winner: side,
          lockoutUntil: now + state.buzzer.lockoutDuration,
          lockoutDuration: state.buzzer.lockoutDuration
        };

        saveState(state);
        broadcastAll({
          type: 'BUZZ_RESULT',
          payload: {
            winner: side,
            lockoutUntil: state.buzzer.lockoutUntil
          }
        });
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'POINTS': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const { side, delta, set } = payload;
        if (side !== 'left' && side !== 'right') return;

        if (typeof set === 'number') {
          state.players[side].points = Math.max(0, set);
        } else if (typeof delta === 'number') {
          state.players[side].points = Math.max(0, state.players[side].points + delta);
        }

        saveState(state);
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'SET_PLAYER_NAME': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const { side, name } = payload;
        if (side !== 'left' && side !== 'right') return;
        if (typeof name === 'string' && name.trim()) {
          state.players[side].name = name.trim();
          saveState(state);
          broadcastAll({ type: 'STATE', payload: state });
        }
        break;
      }

      case 'SET_PLAYER_AVATAR': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const { side, avatar } = payload;
        if (side !== 'left' && side !== 'right') return;
        state.players[side].avatar = avatar || '';
        saveState(state);
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'THEME': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        state.theme = { ...state.theme, ...payload };
        saveState(state);
        broadcastAll({ type: 'THEME_UPDATE', payload: state.theme });
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'ADD_QUESTION': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const question = {
          id: crypto.randomUUID(),
          text: payload?.text || '',
          answer: payload?.answer || '',
          category: payload?.category || '',
          timer: payload?.timer || 30
        };
        state.questions.push(question);
        saveState(state);
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'UPDATE_QUESTION': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const { id, ...updates } = payload;
        const index = state.questions.findIndex(q => q.id === id);
        if (index !== -1) {
          state.questions[index] = { ...state.questions[index], ...updates };
          // If this is the current question, update it too
          if (state.question.id === id) {
            state.question = { ...state.question, ...updates };
          }
          saveState(state);
          broadcastAll({ type: 'STATE', payload: state });
        }
        break;
      }

      case 'DELETE_QUESTION': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const { id } = payload;
        state.questions = state.questions.filter(q => q.id !== id);
        if (state.question.id === id) {
          state.question = { ...defaultState.question };
        }
        saveState(state);
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'REORDER_QUESTIONS': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        state.questions = payload?.questions || [];
        saveState(state);
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'SET_TIMER': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const { duration, action } = payload; // action: 'start', 'pause', 'reset'
        state.timer.total = duration || 30;

        if (action === 'start') {
          state.timer.active = true;
          state.timer.remaining = duration || 30;
        } else if (action === 'pause') {
          state.timer.active = false;
        } else if (action === 'reset') {
          state.timer.active = false;
          state.timer.remaining = duration || 30;
        }

        saveState(state);
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'SET_LOCKOUT_DURATION': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const { duration } = payload;
        if (typeof duration === 'number' && duration >= 1000 && duration <= 30000) {
          state.buzzer.lockoutDuration = duration;
          saveState(state);
          broadcastAll({ type: 'STATE', payload: state });
        }
        break;
      }

      case 'RESET_ROUND': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        state.question = { ...defaultState.question };
        state.players.left.points = 0;
        state.players.right.points = 0;
        state.buzzer = { ...defaultState.buzzer };
        state.timer = { ...defaultState.timer };
        saveState(state);
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'EXPORT_CONFIG': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        const exportData = {
          questions: state.questions,
          players: {
            left: { name: state.players.left.name, avatar: state.players.left.avatar },
            right: { name: state.players.right.name, avatar: state.players.right.avatar }
          },
          theme: state.theme,
          buzzer: { lockoutDuration: state.buzzer.lockoutDuration }
        };

        ws.send(JSON.stringify({
          type: 'EXPORT_RESULT',
          payload: exportData
        }));
        break;
      }

      case 'IMPORT_CONFIG': {
        const clientInfo = configClients.get(ws);
        if (!clientInfo?.authenticated) return;

        if (payload?.questions) state.questions = payload.questions;
        if (payload?.players) {
          if (payload.players.left) state.players.left = { ...state.players.left, ...payload.players.left };
          if (payload.players.right) state.players.right = { ...state.players.right, ...payload.players.right };
        }
        if (payload?.theme) state.theme = { ...state.theme, ...payload.theme };
        if (payload?.buzzer?.lockoutDuration) state.buzzer.lockoutDuration = payload.buzzer.lockoutDuration;

        saveState(state);
        broadcastAll({ type: 'STATE', payload: state });
        break;
      }

      case 'PING': {
        ws.send(JSON.stringify({ type: 'PONG', payload: { timestamp: Date.now() } }));
        break;
      }

      case 'PONG': {
        // Track pong response for connection health monitoring
        const clientInfo = configClients.get(ws);
        if (clientInfo) {
          clientInfo.lastPong = Date.now();
        }
        break;
      }
    }
  } catch (error) {
    console.error('Error handling config message:', error);
  }
}

// Track last pong time for each overlay client
const overlayClientPongs = new Map();

// Handle overlay client messages (ping/pong)
function handleOverlayMessage(ws, message) {
  try {
    const { type } = JSON.parse(message);
    if (type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', payload: { timestamp: Date.now() } }));
    } else if (type === 'PONG') {
      // Track pong response for connection health monitoring
      overlayClientPongs.set(ws, Date.now());
    }
  } catch (error) {
    console.error('Error handling overlay message:', error);
  }
}

// Create Express app
const app = express();
app.use(express.json());
app.use(express.static(resolve(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Create HTTP server
const server = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = req.url || '';

  if (url.startsWith('/overlay')) {
    // Overlay client connection
    console.log('Overlay client connected');
    overlayClients.add(ws);
    state.overlayConnected = true;
    broadcastAll({ type: 'CONNECTION_STATUS', payload: { overlayConnected: true } });
    sendState(ws);

    ws.on('message', (data) => handleOverlayMessage(ws, data.toString()));

    ws.on('close', () => {
      console.log('Overlay client disconnected');
      overlayClients.delete(ws);
      if (overlayClients.size === 0) {
        state.overlayConnected = false;
        broadcastAll({ type: 'CONNECTION_STATUS', payload: { overlayConnected: false } });
      }
    });

    ws.on('error', (error) => {
      console.error('Overlay WebSocket error:', error);
      overlayClients.delete(ws);
    });

  } else if (url.startsWith('/config')) {
    // Config client connection
    console.log('Config client connected');
    configClients.set(ws, { authenticated: false, lastPong: null });

    ws.on('message', (data) => handleConfigMessage(ws, data.toString()));

    ws.on('close', () => {
      console.log('Config client disconnected');
      const wasAuthenticated = configClients.get(ws)?.authenticated;
      configClients.delete(ws);

      // Check if any authenticated config clients remain
      const hasAuthenticatedConfig = Array.from(configClients.values()).some(c => c.authenticated);
      if (!hasAuthenticatedConfig && wasAuthenticated) {
        state.configConnected = false;
        broadcastAll({ type: 'CONNECTION_STATUS', payload: { configConnected: false } });
      }
    });

    ws.on('error', (error) => {
      console.error('Config WebSocket error:', error);
      configClients.delete(ws);
    });
  } else {
    ws.close(4000, 'Invalid endpoint. Use /overlay or /config');
  }
});

// Heartbeat interval - tracks PONG responses and cleans stale connections
setInterval(() => {
  const now = Date.now();
  state.lastHeartbeat = now;

  // Send ping to all clients
  const pingMessage = JSON.stringify({ type: 'PING', payload: { timestamp: now } });

  for (const client of overlayClients) {
    if (client.readyState === 1) client.send(pingMessage);
  }
  for (const client of configClients.keys()) {
    if (client.readyState === 1) client.send(pingMessage);
  }

  // Clean up stale overlay connections (no pong for 25 seconds)
  const staleTimeout = 25000;
  for (const client of overlayClients) {
    const lastPong = overlayClientPongs.get(client);
    if (lastPong && (now - lastPong > staleTimeout)) {
      console.log('[Server] Overlay client stale (no pong for', now - lastPong, 'ms), closing');
      client.close(1001, 'Heartbeat timeout');
      overlayClients.delete(client);
      overlayClientPongs.delete(client);
    }
  }

  // Clean up stale config connections
  for (const [client, info] of configClients) {
    if (info.lastPong && (now - info.lastPong > staleTimeout)) {
      console.log('[Server] Config client stale, closing');
      client.close(1001, 'Heartbeat timeout');
      configClients.delete(client);
    }
  }
}, 5000);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Overlay: http://localhost:${PORT}/overlay/`);
  console.log(`Config: http://localhost:${PORT}/config/`);
  console.log(`WebSocket Overlay: ws://localhost:${PORT}/overlay`);
  console.log(`WebSocket Config: ws://localhost:${PORT}/config`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, saving state and shutting down...');
  await saveState(state);
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, saving state and shutting down...');
  await saveState(state);
  server.close(() => {
    process.exit(0);
  });
});