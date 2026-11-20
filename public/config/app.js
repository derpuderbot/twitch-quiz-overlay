/**
 * Twitch Quiz Overlay Config - Client Application
 * Mod-only control panel for managing the quiz overlay
 */

// ==========================================================================
// Configuration
// ==========================================================================
// Auto-detect WSS for HTTPS, WS for HTTP
const WS_PROTOCOL = location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = `${WS_PROTOCOL}//${location.host}/config`;
const RECONNECT_DELAY = 3000;
const HEARTBEAT_INTERVAL = 5000;
const COMMAND_RATE_LIMIT = 50; // ms between commands

// ==========================================================================
// State
// ==========================================================================
let ws = null;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastCommandTime = 0;
let isAuthenticated = false;
let currentState = null;
let draggedQuestionId = null;

// DOM Elements Cache
const els = {};

// ==========================================================================
// Initialization
// ==========================================================================
function init() {
  cacheElements();
  bindEvents();
  checkAuthState();
  console.log('[Config] Initialized');
}

function cacheElements() {
  // Auth
  els.authScreen = document.getElementById('authScreen');
  els.authForm = document.getElementById('authForm');
  els.passwordInput = document.getElementById('passwordInput');
  els.authError = document.getElementById('authError');
  els.app = document.getElementById('app');

  console.log('[Config] Cached elements:', {
    authScreen: els.authScreen ? 'FOUND' : 'MISSING',
    app: els.app ? 'FOUND' : 'MISSING',
    authForm: els.authForm ? 'FOUND' : 'MISSING',
    passwordInput: els.passwordInput ? 'FOUND' : 'MISSING'
  });

  // Header
  els.statusDot = document.getElementById('statusDot');
  els.statusText = document.getElementById('statusText');
  els.exportBtn = document.getElementById('exportBtn');
  els.importBtn = document.getElementById('importBtn');
  els.importFile = document.getElementById('importFile');
  els.logoutBtn = document.getElementById('logoutBtn');

  // Sidebar
  els.sidebarItems = document.querySelectorAll('.sidebar__item');
  els.panels = document.querySelectorAll('.panel');
  els.resetRoundBtn = document.getElementById('resetRoundBtn');

  // Questions
  els.questionsList = document.getElementById('questionsList');
  els.emptyQuestions = document.getElementById('emptyQuestions');
  els.addQuestionBtn = document.getElementById('addQuestionBtn');
  els.questionModal = document.getElementById('questionModal');
  els.questionForm = document.getElementById('questionForm');
  els.questionId = document.getElementById('questionId');
  els.questionText = document.getElementById('questionText');
  els.questionAnswer = document.getElementById('questionAnswer');
  els.questionCategory = document.getElementById('questionCategory');
  els.questionTimer = document.getElementById('questionTimer');
  els.saveQuestionBtn = document.getElementById('saveQuestionBtn');

  // Players
  els.leftNameInput = document.getElementById('leftNameInput');
  els.rightNameInput = document.getElementById('rightNameInput');
  els.leftAvatarInput = document.getElementById('leftAvatarInput');
  els.rightAvatarInput = document.getElementById('rightAvatarInput');
  els.leftPointsDisplay = document.getElementById('leftPointsDisplay');
  els.rightPointsDisplay = document.getElementById('rightPointsDisplay');
  els.leftPointsSet = document.getElementById('leftPointsSet');
  els.rightPointsSet = document.getElementById('rightPointsSet');
  els.leftPointsSetBtn = document.getElementById('leftPointsSetBtn');
  els.rightPointsSetBtn = document.getElementById('rightPointsSetBtn');
  els.pointsBtns = document.querySelectorAll('.points-btn');
  els.buzzerTestBtns = document.querySelectorAll('.buzzer-test-btn');

  // Design
  els.designTabBtns = document.querySelectorAll('.design-tab-btn');
  els.designPanels = document.querySelectorAll('.design-panel');
  els.tokenColorInputs = document.querySelectorAll('.token-color__input');
  els.tokenSelectInputs = document.querySelectorAll('.token-select__input');
  els.tokenSliderInputs = document.querySelectorAll('.token-slider__input');
  els.tokenSliderValues = document.querySelectorAll('.token-slider__value');

  // Toast
  els.toastContainer = document.getElementById('toastContainer');
}

function bindEvents() {
  // Auth
  els.authForm.addEventListener('submit', handleAuthSubmit);
  els.logoutBtn.addEventListener('click', handleLogout);

  // Header
  els.exportBtn.addEventListener('click', handleExport);
  els.importBtn.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', handleImport);

  // Sidebar
  els.sidebarItems.forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });
  els.resetRoundBtn.addEventListener('click', handleResetRound);

  // Questions
  els.addQuestionBtn.addEventListener('click', () => openQuestionModal());
  els.questionForm.addEventListener('submit', handleQuestionSubmit);
  els.questionModal.addEventListener('close', () => resetQuestionForm());

  // Players
  els.leftNameInput.addEventListener('change', () => sendCommand('SET_PLAYER_NAME', { side: 'left', name: els.leftNameInput.value }));
  els.rightNameInput.addEventListener('change', () => sendCommand('SET_PLAYER_NAME', { side: 'right', name: els.rightNameInput.value }));
  els.leftAvatarInput.addEventListener('change', () => sendCommand('SET_PLAYER_AVATAR', { side: 'left', avatar: els.leftAvatarInput.value }));
  els.rightAvatarInput.addEventListener('change', () => sendCommand('SET_PLAYER_AVATAR', { side: 'right', avatar: els.rightAvatarInput.value }));

  els.pointsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const side = btn.dataset.side;
      const delta = parseInt(btn.dataset.delta);
      sendCommand('POINTS', { side, delta });
    });
  });

  els.leftPointsSetBtn.addEventListener('click', () => {
    const value = parseInt(els.leftPointsSet.value);
    if (!isNaN(value)) sendCommand('POINTS', { side: 'left', set: value });
  });

  els.rightPointsSetBtn.addEventListener('click', () => {
    const value = parseInt(els.rightPointsSet.value);
    if (!isNaN(value)) sendCommand('POINTS', { side: 'right', set: value });
  });

  els.buzzerTestBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sendCommand('BUZZ', { side: btn.dataset.side });
    });
  });

  // Design Tabs
  els.designTabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchDesignTab(btn.dataset.designTab));
  });

  // Design Token Inputs
  els.tokenColorInputs.forEach(input => {
    input.addEventListener('change', () => sendThemeUpdate({ [input.dataset.token]: input.value }));
  });

  els.tokenSelectInputs.forEach(select => {
    select.addEventListener('change', () => sendThemeUpdate({ [select.dataset.token]: select.value }));
  });

  els.tokenSliderInputs.forEach((slider, index) => {
    const token = slider.dataset.token;
    const valueEl = els.tokenSliderValues[index];
    slider.addEventListener('input', () => {
      // Update display value
      let displayValue = slider.value;
      if (token.includes('transition')) {
        displayValue = `${displayValue}ms`;
        valueEl.textContent = displayValue;
      } else if (token.includes('radius') || token.includes('gap')) {
        displayValue = `${displayValue}px`;
        valueEl.textContent = displayValue;
      } else if (token.includes('glow')) {
        displayValue = `0 0 ${displayValue}px 8px`;
        valueEl.textContent = displayValue;
      } else if (token.includes('font')) {
        // Font sizes are clamp values, just show the max
        const clampMap = {
          '--fs-question': `clamp(1.75rem, 4vw, ${displayValue}rem)`,
          '--fs-points': `clamp(2.5rem, 6vw, ${displayValue}rem)`,
          '--fs-name': `clamp(1.1rem, 2.5vw, ${displayValue}rem)`,
          '--fs-timer': `clamp(2rem, 5vw, ${displayValue}rem)`
        };
        displayValue = clampMap[token] || displayValue;
        valueEl.textContent = displayValue;
      }
      valueEl.textContent = displayValue;
    });
    slider.addEventListener('change', () => {
      let value = slider.value;
      if (token.includes('transition')) value = `${value}ms`;
      else if (token.includes('radius') || token.includes('gap')) value = `${value}px`;
      else if (token.includes('glow')) value = `0 0 ${value}px 8px`;
      else if (token.includes('font')) {
        const clampMap = {
          '--fs-question': `clamp(1.75rem, 4vw, ${value}rem)`,
          '--fs-points': `clamp(2.5rem, 6vw, ${value}rem)`,
          '--fs-name': `clamp(1.1rem, 2.5vw, ${value}rem)`,
          '--fs-timer': `clamp(2rem, 5vw, ${value}rem)`
        };
        value = clampMap[token] || value;
      }
      sendThemeUpdate({ [token]: value });
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);
}

function checkAuthState() {
  const savedToken = sessionStorage.getItem('config_token');
  if (savedToken) {
    els.passwordInput.value = savedToken;
    handleAuthSubmit(new Event('submit'));
  }
}

// ==========================================================================
// Authentication
// ==========================================================================
async function handleAuthSubmit(event) {
  event.preventDefault();
  const token = els.passwordInput.value.trim();
  if (!token) return showToast('Bitte Passwort eingeben', 'error');

  els.authError.hidden = true;
  els.authError.textContent = '';

  try {
    await connectWebSocket(token);
  } catch (error) {
    showAuthError(error.message);
  }
}

function connectWebSocket(token) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Verbindungstimeout'));
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      // Send auth
      ws.send(JSON.stringify({ type: 'AUTH', payload: { token } }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
        if (message.type === 'AUTH_RESULT') {
          if (message.payload.success) {
            resolve();
          } else {
            reject(new Error('Ungültiges Passwort'));
          }
        }
      } catch (error) {
        console.error('[Config] Error parsing message:', error);
      }
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (!isAuthenticated) {
        reject(new Error('Verbindung fehlgeschlagen'));
      } else {
        scheduleReconnect();
      }
    };

    ws.onerror = (error) => {
      clearTimeout(timeout);
      reject(new Error('Verbindungsfehler'));
    };
  });
}

function handleAuthSuccess() {
  isAuthenticated = true;
  const token = els.passwordInput?.value?.trim() || '';
  sessionStorage.setItem('config_token', token);

  console.log('[Config] Auth success, switching UI...');

  // Use style.display (higher specificity than CSS display: flex)
  if (els.authScreen) {
    els.authScreen.style.display = 'none';
  } else {
    console.error('[Config] authScreen element not found!');
  }

  if (els.app) {
    els.app.style.display = 'flex';
  } else {
    console.error('[Config] app element not found!');
  }

  // Request initial state
  sendCommand('REQUEST_STATE');

  // Start heartbeat
  startHeartbeat();

  updateConnectionStatus(true);
  showToast('Erfolgreich verbunden', 'success');
}

function handleLogout() {
  isAuthenticated = false;
  sessionStorage.removeItem('config_token');
  ws?.close();
  clearInterval(heartbeatTimer);

  // Use style.display (higher specificity than CSS display: flex)
  if (els.authScreen) els.authScreen.style.display = 'flex';
  if (els.app) els.app.style.display = 'none';
  if (els.passwordInput) els.passwordInput.value = '';
  els.passwordInput.focus();

  updateConnectionStatus(false);
  showToast('Abgemeldet', 'info');
}

// ==========================================================================
// WebSocket Handling
// ==========================================================================
function scheduleReconnect() {
  if (!isAuthenticated) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    const token = sessionStorage.getItem('config_token');
    if (token) connectWebSocket(token).catch(() => {});
  }, RECONNECT_DELAY);
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'PING', payload: { timestamp: Date.now() } }));
    }
  }, HEARTBEAT_INTERVAL);
}

function handleMessage(message) {
  const { type, payload } = message;

  switch (type) {
    case 'AUTH_RESULT':
      if (payload.success) handleAuthSuccess();
      else showAuthError('Ungültiges Passwort');
      break;

    case 'STATE':
      applyState(payload);
      break;

    case 'THEME_UPDATE':
      applyTheme(payload);
      break;

    case 'CONNECTION_STATUS':
      updateOverlayConnectionStatus(payload);
      break;

    case 'EXPORT_RESULT':
      downloadJSON(payload, 'quiz-overlay-config.json');
      showToast('Konfiguration exportiert', 'success');
      break;

    case 'PONG':
      // Heartbeat response
      break;
  }
}

function sendCommand(type, payload) {
  if (!isAuthenticated || ws?.readyState !== WebSocket.OPEN) return;

  // Rate limiting
  const now = Date.now();
  if (now - lastCommandTime < COMMAND_RATE_LIMIT) {
    setTimeout(() => sendCommand(type, payload), COMMAND_RATE_LIMIT);
    return;
  }
  lastCommandTime = now;

  ws.send(JSON.stringify({ type, payload }));
}

function sendThemeUpdate(theme) {
  sendCommand('THEME', theme);
}

// ==========================================================================
// State Application
// ==========================================================================
function applyState(state) {
  currentState = state;

  // Update questions list
  renderQuestions(state.questions, state.question.id);

  // Update players
  els.leftNameInput.value = state.players.left.name;
  els.rightNameInput.value = state.players.right.name;
  els.leftAvatarInput.value = state.players.left.avatar || '';
  els.rightAvatarInput.value = state.players.right.avatar || '';
  els.leftPointsDisplay.value = state.players.left.points;
  els.rightPointsDisplay.value = state.players.right.points;

  // Update design tokens in UI
  syncDesignInputs(state.theme);

  // Update buzzer lockout duration slider if exists
  // (handled in design panel)
}

function renderQuestions(questions, currentQuestionId) {
  els.questionsList.innerHTML = '';

  if (questions.length === 0) {
    els.emptyQuestions.hidden = false;
    return;
  }
  els.emptyQuestions.hidden = true;

  questions.forEach((question, index) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.draggable = true;
    item.dataset.id = question.id;
    if (question.id === currentQuestionId) item.classList.add('question-item--current');

    item.innerHTML = `
      <span class="question-item__drag" aria-label="Verschieben">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </span>
      <div class="question-item__text">${escapeHtml(question.text)}</div>
      <div class="question-item__meta">
        ${question.category ? `<span class="question-item__category">${escapeHtml(question.category)}</span>` : ''}
        <span class="question-item__timer">${question.timer}s</span>
      </div>
      <div class="question-item__actions">
        <button type="button" class="question-item__btn question-item__btn--primary" data-action="set" aria-label="Als aktuelle Frage setzen" title="Als aktuelle Frage setzen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <button type="button" class="question-item__btn" data-action="edit" aria-label="Bearbeiten" title="Bearbeiten">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button type="button" class="question-item__btn question-item__btn--danger" data-action="delete" aria-label="Löschen" title="Löschen">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `;

    // Drag and drop
    item.addEventListener('dragstart', handleDragStart);
    item.addEventListener('dragend', handleDragEnd);
    item.addEventListener('dragover', handleDragOver);
    item.addEventListener('drop', handleDrop);

    // Action buttons
    item.querySelector('[data-action="set"]').addEventListener('click', () => sendCommand('SET_QUESTION', { id: question.id, ...question }));
    item.querySelector('[data-action="edit"]').addEventListener('click', () => openQuestionModal(question));
    item.querySelector('[data-action="delete"]').addEventListener('click', () => deleteQuestion(question.id));

    els.questionsList.appendChild(item);
  });
}

function openQuestionModal(question = null) {
  resetQuestionForm();

  if (question) {
    els.questionModal.querySelector('h2').textContent = 'Frage bearbeiten';
    els.questionId.value = question.id;
    els.questionText.value = question.text;
    els.questionAnswer.value = question.answer || '';
    els.questionCategory.value = question.category || '';
    els.questionTimer.value = question.timer || 30;
  } else {
    els.questionModal.querySelector('h2').textContent = 'Frage hinzufügen';
    els.questionId.value = '';
    els.questionTimer.value = 30;
  }

  els.questionModal.showModal();
  els.questionText.focus();
}

function resetQuestionForm() {
  els.questionForm.reset();
  els.questionId.value = '';
  els.questionModal.querySelector('h2').textContent = 'Frage hinzufügen';
}

async function handleQuestionSubmit(event) {
  event.preventDefault();

  const id = els.questionId.value;
  const questionData = {
    text: els.questionText.value.trim(),
    answer: els.questionAnswer.value.trim(),
    category: els.questionCategory.value.trim(),
    timer: parseInt(els.questionTimer.value) || 30
  };

  if (!questionData.text) {
    showToast('Frage-Text ist erforderlich', 'error');
    return;
  }

  if (id) {
    sendCommand('UPDATE_QUESTION', { id, ...questionData });
  } else {
    sendCommand('ADD_QUESTION', questionData);
  }

  els.questionModal.close();
  showToast(id ? 'Frage aktualisiert' : 'Frage hinzugefügt', 'success');
}

function deleteQuestion(id) {
  if (!confirm('Diese Frage wirklich löschen?')) return;
  sendCommand('DELETE_QUESTION', { id });
  showToast('Frage gelöscht', 'success');
}

// Drag and Drop for Questions
function handleDragStart(event) {
  draggedQuestionId = event.target.closest('.question-item')?.dataset.id;
  event.target.classList.add('dragging');
  event.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(event) {
  event.target.classList.remove('dragging');
  document.querySelectorAll('.question-item').forEach(item => item.classList.remove('drag-over'));
  draggedQuestionId = null;
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const item = event.target.closest('.question-item');
  if (item && item.dataset.id !== draggedQuestionId) {
    document.querySelectorAll('.question-item').forEach(i => i.classList.remove('drag-over'));
    item.classList.add('drag-over');
  }
}

function handleDrop(event) {
  event.preventDefault();
  const targetItem = event.target.closest('.question-item');
  if (!targetItem || targetItem.dataset.id === draggedQuestionId) return;

  const questions = [...currentState.questions];
  const fromIndex = questions.findIndex(q => q.id === draggedQuestionId);
  const toIndex = questions.findIndex(q => q.id === targetItem.dataset.id);

  if (fromIndex !== -1 && toIndex !== -1) {
    const [moved] = questions.splice(fromIndex, 1);
    questions.splice(toIndex, 0, moved);
    sendCommand('REORDER_QUESTIONS', { questions });
  }

  document.querySelectorAll('.question-item').forEach(item => item.classList.remove('drag-over'));
}

// ==========================================================================
// Player Management
// ==========================================================================
function updatePointsDisplay(side, points) {
  const display = els[`${side}PointsDisplay`];
  if (display) display.value = points;
}

// ==========================================================================
// Design Tokens
// ==========================================================================
function switchDesignTab(tabName) {
  els.designTabBtns.forEach(btn => {
    btn.classList.toggle('design-tab-btn--active', btn.dataset.designTab === tabName);
    btn.setAttribute('aria-selected', btn.dataset.designTab === tabName);
  });
  els.designPanels.forEach(panel => {
    panel.hidden = panel.id !== `design-${tabName}`;
    if (!panel.hidden) panel.setAttribute('aria-hidden', 'false');
    else panel.setAttribute('aria-hidden', 'true');
  });
}

function syncDesignInputs(theme) {
  if (!theme) return;

  // Color inputs
  els.tokenColorInputs.forEach(input => {
    if (theme[input.dataset.token]) {
      input.value = theme[input.dataset.token];
    }
  });

  // Select inputs
  els.tokenSelectInputs.forEach(select => {
    if (theme[select.dataset.token]) {
      select.value = theme[select.dataset.token];
    }
  });

  // Slider inputs - parse values
  els.tokenSliderInputs.forEach((slider, index) => {
    const token = slider.dataset.token;
    const valueEl = els.tokenSliderValues[index];
    if (theme[token]) {
      let value = theme[token];
      // Parse different formats
      if (token.includes('transition')) {
        value = parseInt(value) || 120;
      } else if (token.includes('radius') || token.includes('gap')) {
        value = parseInt(value) || 16;
      } else if (token.includes('glow')) {
        const match = value.match(/(\d+)px/);
        value = match ? parseInt(match[1]) : 32;
      } else if (token.includes('font')) {
        const match = value.match(/([\d.]+)rem/);
        value = match ? parseFloat(match[1]) : 3;
      }
      slider.value = value;
      // Update display
      let displayValue = value;
      if (token.includes('transition')) displayValue = `${value}ms`;
      else if (token.includes('radius') || token.includes('gap')) displayValue = `${value}px`;
      else if (token.includes('glow')) displayValue = `0 0 ${value}px 8px`;
      else if (token.includes('font')) {
        const clampMap = {
          '--fs-question': `clamp(1.75rem, 4vw, ${value}rem)`,
          '--fs-points': `clamp(2.5rem, 6vw, ${value}rem)`,
          '--fs-name': `clamp(1.1rem, 2.5vw, ${value}rem)`,
          '--fs-timer': `clamp(2rem, 5vw, ${value}rem)`
        };
        displayValue = clampMap[token] || value;
      }
      valueEl.textContent = displayValue;
    }
  });
}

function applyTheme(theme) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme)) {
    if (key.startsWith('--')) {
      root.style.setProperty(key, value);
    }
  }
  syncDesignInputs(theme);
}

// ==========================================================================
// Export / Import
// ==========================================================================
function handleExport() {
  sendCommand('EXPORT_CONFIG');
}

function handleImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      sendCommand('IMPORT_CONFIG', data);
      showToast('Konfiguration importiert', 'success');
    } catch (error) {
      showToast('Ungültige JSON-Datei', 'error');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ==========================================================================
// Round Reset
// ==========================================================================
function handleResetRound() {
  if (!confirm('Runde wirklich zurücksetzen? Alle Punkte werden auf 0 gesetzt.')) return;
  sendCommand('RESET_ROUND');
  showToast('Runde zurückgesetzt', 'success');
}

// ==========================================================================
// UI Helpers
// ==========================================================================
function switchTab(tabName) {
  els.sidebarItems.forEach(item => {
    const isActive = item.dataset.tab === tabName;
    item.classList.toggle('sidebar__item--active', isActive);
    item.setAttribute('aria-selected', isActive);
  });
  els.panels.forEach(panel => {
    panel.classList.toggle('panel--active', panel.id === `panel-${tabName}`);
  });
}

function updateConnectionStatus(connected) {
  if (connected) {
    els.statusDot.classList.add('status-dot--connected');
    els.statusDot.classList.remove('status-dot--disconnected');
    els.statusText.textContent = 'Verbunden';
  } else {
    els.statusDot.classList.add('status-dot--disconnected');
    els.statusDot.classList.remove('status-dot--connected');
    els.statusText.textContent = 'Getrennt';
  }
}

function updateOverlayConnectionStatus(payload) {
  // Could show separate overlay/config status
  // For now, just use main status
}

function showAuthError(message) {
  els.authError.textContent = message;
  els.authError.hidden = false;
  els.passwordInput.focus();
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `
    <span class="toast__icon">${getToastIcon(type)}</span>
    <span class="toast__message">${escapeHtml(message)}</span>
    <button class="toast__close" aria-label="Schließen">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  toast.querySelector('.toast__close').addEventListener('click', () => toast.remove());

  els.toastContainer.appendChild(toast);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideIn 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function getToastIcon(type) {
  const icons = {
    success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  return icons[type] || icons.info;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleKeydown(event) {
  // Escape to close modal
  if (event.key === 'Escape') {
    if (els.questionModal.open) els.questionModal.close();
  }

  // Ctrl/Cmd + S to export
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    handleExport();
  }

  // Ctrl/Cmd + R to reset round (with shift to prevent browser reload)
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'R') {
    event.preventDefault();
    handleResetRound();
  }
}

// ==========================================================================
// Start
// ==========================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for debugging
window.__configDebug = {
  getState: () => currentState,
  getElements: () => els,
  sendCommand: sendCommand,
  forceReconnect: () => { ws?.close(); }
};