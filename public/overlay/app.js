/**
 * Twitch Quiz Overlay - Client Application
 * Connects to WebSocket server and renders overlay state
 */

// ==========================================================================
// Configuration
// ==========================================================================
// Auto-detect WSS for HTTPS, WS for HTTP
const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${location.host}/overlay`;
const RECONNECT_DELAY = 3000;
const HEARTBEAT_TIMEOUT = 15000;

// ==========================================================================
// State
// ==========================================================================
let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastHeartbeat = Date.now();
let currentState = null;

// DOM Elements
const elements = {
  leftName: document.getElementById('leftName'),
  rightName: document.getElementById('rightName'),
  leftPoints: document.getElementById('leftPoints'),
  rightPoints: document.getElementById('rightPoints'),
  leftFrame: document.querySelector('.frame--left'),
  rightFrame: document.querySelector('.frame--right'),
  leftBuzzer: document.getElementById('leftBuzzer'),
  rightBuzzer: document.getElementById('rightBuzzer'),
  questionText: document.getElementById('questionText'),
  timerValue: document.getElementById('timerValue'),
  timerProgress: document.querySelector('.timer__ring-progress'),
  statusToast: document.getElementById('statusToast'),
  connectionIndicator: document.getElementById('connectionIndicator')
};

// Timer ring circumference for stroke-dashoffset
const TIMER_RING_RADIUS = 28;
const TIMER_RING_CIRCUMFERENCE = 2 * Math.PI * TIMER_RING_RADIUS;

// ==========================================================================
// WebSocket Connection
// ==========================================================================
function connect() {
  if (ws?.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[Overlay] Connected to server');
    clearTimeout(reconnectTimer);
    sendPing();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      handleMessage(message);
    } catch (error) {
      console.error('[Overlay] Error parsing message:', error);
    }
  };

  ws.onclose = () => {
    console.log('[Overlay] Disconnected from server');
    setConnectionStatus(false);
    scheduleReconnect();
  };

  ws.onerror = (error) => {
    console.error('[Overlay] WebSocket error:', error);
  };
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
}

function sendPing() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'PING', payload: { timestamp: Date.now() } }));
    // Update heartbeat when WE send ping (client-controlled heartbeat)
    lastHeartbeat = Date.now();
    console.log('[Overlay] Client heartbeat sent, lastHeartbeat updated');
  }
}

// Heartbeat monitoring
function startHeartbeatMonitor() {
  // Client sends own ping every 10 seconds (independent of server)
  setInterval(sendPing, 10000);

  // Monitor for timeout (check every second)
  heartbeatTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
      console.log('[Overlay] Heartbeat timeout, reconnecting...');
      ws?.close();
    }
  }, 1000);
}

// ==========================================================================
// Message Handling
// ==========================================================================
function handleMessage(message) {
  const { type, payload } = message;

  switch (type) {
    case 'STATE':
      applyState(payload);
      break;

    case 'BUZZ_RESULT':
      handleBuzzResult(payload);
      break;

    case 'THEME_UPDATE':
      applyTheme(payload);
      break;

    case 'CONNECTION_STATUS':
      updateConnectionStatus(payload);
      break;

    case 'PONG':
      lastHeartbeat = Date.now();
      break;

    case 'PING':
      // Server ping, respond with pong
      ws?.send(JSON.stringify({ type: 'PONG', payload: { timestamp: Date.now() } }));
      // Update heartbeat when we respond to server ping
      lastHeartbeat = Date.now();
      break;
  }
}

// ==========================================================================
// State Application
// ==========================================================================
function applyState(state) {
  currentState = state;

  // Update player names
  elements.leftName.textContent = state.players.left.name;
  elements.rightName.textContent = state.players.right.name;

  // Update points with animation
  updatePoints('left', state.players.left.points);
  updatePoints('right', state.players.right.points);

  // Update question
  updateQuestion(state.question.text);

  // Update timer
  updateTimer(state.timer);

  // Update buzzer state
  updateBuzzerState(state.buzzer);

  // Apply theme
  applyTheme(state.theme);
}

function updatePoints(side, points) {
  const element = elements[`${side}Points`];
  const newPoints = String(points);

  if (element.textContent !== newPoints) {
    const oldPoints = parseInt(element.textContent) || 0;
    const delta = points - oldPoints;

    element.textContent = newPoints;

    // Trigger count-up animation for positive deltas
    if (delta > 0) {
      element.classList.add('frame__points--animating');
      element.addEventListener('animationend', () => {
        element.classList.remove('frame__points--animating');
      }, { once: true });
    }
  }
}

function updateQuestion(text) {
  if (elements.questionText.textContent !== text) {
    elements.questionText.classList.add('question__text--updating');

    requestAnimationFrame(() => {
      elements.questionText.textContent = text || 'Warte auf Frage...';
      elements.questionText.classList.remove('question__text--updating');
    });
  }
}

function updateTimer(timer) {
  const { active, remaining, total } = timer;

  // Update timer value display
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  elements.timerValue.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  // Update progress ring
  const progress = total > 0 ? remaining / total : 0;
  const offset = TIMER_RING_CIRCUMFERENCE * (1 - progress);
  elements.timerProgress.style.strokeDashoffset = offset;

  // Update progress ring color based on time remaining
  elements.timerProgress.classList.remove('timer__ring-progress--warning', 'timer__ring-progress--danger');
  if (active && remaining <= 10 && remaining > 5) {
    elements.timerProgress.classList.add('timer__ring-progress--warning');
  } else if (active && remaining <= 5) {
    elements.timerProgress.classList.add('timer__ring-progress--danger');
  }
}

function updateBuzzerState(buzzer) {
  const { active, winner, lockoutUntil } = buzzer;
  const now = Date.now();
  const isLockout = lockoutUntil > now;

  // Reset frame classes
  elements.leftFrame.classList.remove('frame--buzzed-left', 'frame--buzzed-right', 'frame--lockout');
  elements.rightFrame.classList.remove('frame--buzzed-left', 'frame--buzzed-right', 'frame--lockout');

  if (active && winner) {
    if (winner === 'left') {
      elements.leftFrame.classList.add('frame--buzzed-left');
      showToast(`🎉 ${currentState?.players?.left?.name || 'Spieler 1'} hat gebuzzert!`, 'buzzed');
    } else {
      elements.rightFrame.classList.add('frame--buzzed-right');
      showToast(`🎉 ${currentState?.players?.right?.name || 'Spieler 2'} hat gebuzzert!`, 'buzzed');
    }
  } else if (isLockout) {
    elements.leftFrame.classList.add('frame--lockout');
    elements.rightFrame.classList.add('frame--lockout');
    const remaining = Math.ceil((lockoutUntil - now) / 1000);
    showToast(`⏳ Lockout aktiv: ${remaining}s`, 'lockout');
  }
}

function handleBuzzResult(payload) {
  // This is handled by the STATE update, but we can show immediate feedback
  const { winner, lockoutUntil } = payload;
  const name = winner === 'left'
    ? currentState?.players?.left?.name || 'Spieler 1'
    : currentState?.players?.right?.name || 'Spieler 2';

  showToast(`⚡ ${name} war schneller!`, 'buzzed');
}

function applyTheme(theme) {
  if (!theme) return;

  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme)) {
    if (key.startsWith('--')) {
      root.style.setProperty(key, value);
    }
  }
}

// ==========================================================================
// UI Helpers
// ==========================================================================
function showToast(message, type = '') {
  elements.statusToast.textContent = message;
  elements.statusToast.className = 'status-toast';
  elements.statusToast.hidden = false;

  if (type) {
    elements.statusToast.classList.add(`status-toast--${type}`);
  }

  // Force reflow for animation
  requestAnimationFrame(() => {
    elements.statusToast.classList.add('status-toast--visible');
  });

  // Auto-hide after 4 seconds
  setTimeout(() => {
    hideToast();
  }, 4000);
}

function hideToast() {
  elements.statusToast.classList.remove('status-toast--visible');
  setTimeout(() => {
    elements.statusToast.hidden = true;
  }, 300);
}

function setConnectionStatus(connected) {
  if (connected) {
    elements.connectionIndicator.classList.add('connection-indicator--connected');
    elements.connectionIndicator.classList.remove('connection-indicator--disconnected');
    elements.connectionIndicator.querySelector('.connection-indicator__text').textContent = 'Verbunden';
  } else {
    elements.connectionIndicator.classList.add('connection-indicator--disconnected');
    elements.connectionIndicator.classList.remove('connection-indicator--connected');
    elements.connectionIndicator.querySelector('.connection-indicator__text').textContent = 'Getrennt';
  }
}

function updateConnectionStatus(payload) {
  // This could be used to show overlay/config connection status separately
  // For now, just use the main connection indicator
}

// ==========================================================================
// Initialization
// ==========================================================================
function init() {
  console.log('[Overlay] Initializing...');

  // Set initial timer ring circumference
  elements.timerProgress.style.strokeDasharray = TIMER_RING_CIRCUMFERENCE;
  elements.timerProgress.style.strokeDashoffset = TIMER_RING_CIRCUMFERENCE;

  // Connect to WebSocket
  connect();
  startHeartbeatMonitor();

  // Handle visibility change (pause/reconnect when tab hidden)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(heartbeatTimer);
    } else {
      startHeartbeatMonitor();
      if (ws?.readyState !== WebSocket.OPEN) {
        connect();
      }
    }
  });

  // Apply initial theme from CSS custom properties
  // (Will be overridden by server state on connect)

  console.log('[Overlay] Ready');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for debugging
window.__overlayDebug = {
  getState: () => currentState,
  getElements: () => elements,
  forceReconnect: () => { ws?.close(); connect(); }
};