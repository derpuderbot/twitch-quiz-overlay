# Twitch Quiz Overlay 🎮

A professional, OBS-ready quiz overlay with buzzer system for Twitch streams. Features real-time sync between a moderator config panel and the overlay, customizable design tokens, and persistent state.

## ✨ Features

- **Two-Camera Layout** - Side-by-side 16:9 frames with player names & points
- **Buzzer System** - First-to-buzz wins, configurable lockout (3-10s), visual glow feedback
- **Real-time Sync** - WebSocket connection between Config Panel and Overlay (<200ms latency)
- **Question Management** - Add, edit, delete, reorder (drag & drop), set timer per question
- **Player Management** - Names, avatars, points (+1/-1/set), buzzer test buttons
- **Live Design Editor** - Colors, typography, layout, animations - all via CSS custom properties
- **Export/Import** - Full config backup as JSON
- **Persistent State** - Survives server restarts (atomic JSON writes)
- **Responsive** - Works at 1920×1080, 1280×720, and stacked 1080×1920
- **Accessible** - WCAG AA contrast, prefers-reduced-motion, keyboard navigation
- **Docker Ready** - Multi-stage build, <50MB production image

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Docker (optional, for containerized deployment)

### Local Development

```bash
# Clone and enter directory
cd twitch-quiz-overlay

# Install dependencies
npm install

# Copy environment template and configure
cp .env.example .env
# Edit .env and set a secure SHARED_SECRET

# Start development server with live reload
npm run dev
```

The server starts at `http://localhost:3000`:
- **Overlay**: `http://localhost:3000/overlay/` (add as Browser Source in OBS)
- **Config Panel**: `http://localhost:3000/config/` (moderator access)

### Docker Deployment

```bash
# Build and start production container
docker-compose up -d --build

# Or development with live reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## ⚙️ Configuration

### Environment Variables (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `SHARED_SECRET` | **Required** - Auth token for Config Panel | `change-me` |

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### OBS Browser Source Setup

1. Add **Browser Source** to your scene
2. URL: `http://localhost:3000/overlay/` (or your production URL)
3. Width: `1920`, Height: `1080` (match your canvas)
4. FPS: `60`
5. **Uncheck** "Refresh browser when scene becomes active"
6. CSS (optional, for transparency):
   ```css
   body { margin: 0; overflow: hidden; background: transparent; }
   ```

### Config Panel Access

1. Open `http://localhost:3000/config/` in browser
2. Enter the `SHARED_SECRET` from your `.env`
3. You're now connected - all changes push instantly to overlay

## 🎯 Usage Guide

### Config Panel Tabs

#### 📝 Fragen (Questions)
- **Add Question**: Text, optional answer, category, timer (10-120s)
- **Set Current**: Click ✓ to push question to overlay immediately
- **Drag & Drop**: Reorder questions by dragging the ⋮⋮ handle
- **Edit/Delete**: Hover actions on each question

#### 👥 Spieler (Players)
- **Names**: Edit left/right player names
- **Avatars**: Optional image URLs (shown in frame)
- **Points**: ±1 buttons, or set exact value
- **Buzzer Test**: Simulate buzzes for testing

#### 🎨 Design (Live Design Tokens)
Four sub-tabs for complete visual control:
- **Farben**: Base, accent, buzzer states (color pickers)
- **Typografie**: Font families, font sizes (sliders with live preview)
- **Layout**: Frame radius, gaps, glow spread
- **Animation**: Transition durations

Changes apply **instantly** to overlay without reload.

#### 🔄 Export/Import
- **Export**: Downloads complete config as JSON
- **Import**: Upload JSON to restore full state

#### ⚠️ Runde zurücksetzen
Resets points to 0, clears current question, resets buzzer state.

### Keyboard Shortcuts (Config Panel)

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + S` | Export config |
| `Ctrl/Cmd + Shift + R` | Reset round |
| `Escape` | Close modal |

## 🏗️ Architecture

```
┌─────────────────┐     WebSocket      ┌──────────────────┐
│  Config Panel   │◄──────────────────►│  WebSocket       │
│  (Moderator)    │   (WSS in Prod)    │  Server          │
│  :3000/config   │                    │  (Node.js + ws)  │
└─────────────────┘                    └────────┬─────────┘
                                                │
                                                │ WebSocket
                                                ▼
                                     ┌──────────────────┐
                                     │  Overlay Page    │
                                     │  (Browser Source)│
                                     │  :3000/overlay   │
                                     └──────────────────┘
```

### File Structure

```
twitch-quiz-overlay/
├── server/
│   ├── index.js          # WebSocket + Express server
│   └── state.json        # Persisted state (auto-created)
├── public/
│   ├── overlay/
│   │   ├── index.html    # Overlay (Browser Source)
│   │   ├── style.css     # Design tokens + layout
│   │   └── app.js        # Overlay logic (state → DOM)
│   └── config/
│       ├── index.html    # Config panel (Moderator)
│       ├── style.css     # Admin UI styles
│       └── app.js        # Config logic (UI → WS commands)
├── Dockerfile            # Multi-stage production build
├── Dockerfile.dev        # Development with nodemon
├── docker-compose.yml    # Production deployment
├── docker-compose.dev.yml# Development with live reload
├── nginx.conf            # Reverse proxy with SSL/WSS
├── package.json
├── .env.example
└── README.md
```

### WebSocket Protocol

**Config → Server (Commands)**
```json
{ "type": "SET_QUESTION", "payload": { "id": "q12", "text": "Frage?", "timer": 30 } }
{ "type": "BUZZ", "payload": { "side": "left" } }
{ "type": "POINTS", "payload": { "side": "right", "delta": 1 } }
{ "type": "THEME", "payload": { "--buzzer-glow": "#00FF88" } }
{ "type": "RESET_ROUND" }
```

**Server → Clients (State Sync)**
```json
{ "type": "STATE", "payload": { /* complete state */ } }
{ "type": "BUZZ_RESULT", "payload": { "winner": "left", "lockoutUntil": 1732100000000 } }
{ "type": "THEME_UPDATE", "payload": { /* theme tokens */ } }
```

## 🌐 Production Deployment

### Option 1: Docker + Reverse Proxy (Recommended)

1. **Server**: VPS (Hetzner, DigitalOcean, etc.) with Docker
2. **Domain**: Point `overlay.yourdomain.com` and `config.yourdomain.com` to server
3. **SSL**: Use Let's Encrypt (certbot) or Cloudflare
4. **Nginx**: Use provided `nginx.conf` for WSS proxy

```bash
# On server
git clone <your-repo>
cd twitch-quiz-overlay
cp .env.example .env
# Edit .env with secure SHARED_SECRET
docker-compose up -d --build
```

### Option 2: Platform-as-a-Service (Railway / Render / Fly.io) — **Empfohlen für schnellen Start**

- Connect GitHub repo
- Set `SHARED_SECRET` env var
- Deploy - auto-detects Node.js
- **Automatisches HTTPS/WSS** ✅

### Option 3: Static Hosting + Separate WS Server
- Deploy `public/overlay` and `public/config` as static sites (Netlify/Vercel/GitHub Pages)
- Deploy `server/` as separate Node.js service (Railway/Render/VPS)
- Update WS URLs in both apps to point to WS server

---

## 🖥️ Multi-PC Setup (2 Overlays + 1 Config) — **Dein Use Case**

### Architektur
```
┌─────────────────────────────────────────────────────────────┐
│                   CENTRAL SERVER (Cloud/VPS)                │
│  WebSocket Server (Node.js + ws) + State Persistence        │
│  HTTPS/WSS + Rate Limiting + Auto-SSL                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   ┌─────────┐        ┌─────────┐        ┌─────────┐
   │  PC 1   │        │  PC 2   │        │  PC 3   │
   │ Overlay │        │ Overlay │        │ Config  │
   │ (OBS)   │        │ (OBS)   │        │ (Mod)   │
   └─────────┘        └─────────┘        └─────────┘
```

### Schnellstart: Railway (kostenlos, 5 Min Setup)

1. **Repo zu GitHub pushen:**
   ```bash
   git init && git add . && git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/DEIN-USERNAME/twitch-quiz-overlay.git
   git push -u origin main
   ```

2. **Railway Project erstellen:**
   - [railway.app](https://railway.app) → "New Project" → "Deploy from GitHub"
   - Repo auswählen → Deploy

3. **Environment Variables setzen (Railway Dashboard → Variables):**
   ```
   NODE_ENV=production
   SHARED_SECRET=dein-32-stelliges-hex-secret
   PORT=3000
   ```
   Secret generieren: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

4. **URLs notieren (nach Deploy in Railway Dashboard):**
   - **Overlay URL**: `https://dein-projekt.up.railway.app/overlay/`
   - **Config URL**: `https://dein-projekt.up.railway.app/config/`

### PC 1 & 2 (Stream-PCs) — OBS Browser Source

| Einstellung | Wert |
|-------------|------|
| **URL** | `https://dein-projekt.up.railway.app/overlay/` |
| **Breite** | 1920 (oder deine Stream-Auflösung) |
| **Höhe** | 1080 |
| **FPS** | 60 |
| **Refresh on scene change** | **AUS** (wichtig!) |
| **Custom CSS** | `body { margin: 0; overflow: hidden; background: transparent; }` |

> **Tipp:** Beide PCs nutzen **die gleiche Overlay-URL**. Der Server unterscheidet die Spieler über die WebSocket-Verbindung (links/rechts).

### PC 3 (Moderator-PC) — Config Panel

1. Browser öffnen: `https://dein-projekt.up.railway.app/config/`
2. Passwort eingeben = `SHARED_SECRET` aus Railway Variables
3. ✅ Verbunden → Alle Änderungen gehen **live an beide Overlays**

### Kamera-Feeds einbinden (PC 1 & 2)

Das Overlay zeigt standardmäßig Platzhalter. Für echte Kameras:

**Option A: OBS Media Source (einfachster Weg)**
- In OBS **unter** dem Browser Source: "Media Source" hinzufügen für Kamera 1 & 2
- Positionieren (links/rechts), Browser Source liegt transparent darüber

**Option B: Kamera-URLs direkt im Overlay**
In Browser-Konsole (F12) auf **jedem Overlay-PC**:
```javascript
// Kamera URLs eintragen (RTMP, HLS, WebRTC, etc.)
document.getElementById('leftMedia').innerHTML = 
  '<video src="KAMERA_URL_LINKS" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>';
document.getElementById('rightMedia').innerHTML = 
  '<video src="KAMERA_URL_RECHTS" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>';
```

---

### VPS Alternative (Hetzner/Contabo/DigitalOcean ~4-6€/Monat)

Für **vollständige Kontrolle** und eigene Domain:

```bash
# 1. VPS aufsetzen (Ubuntu 24.04)
apt update && apt install -y docker.io docker-compose nginx certbot

# 2. Repo clonen
git clone https://github.com/DEIN-USERNAME/twitch-quiz-overlay.git
cd twitch-quiz-overlay
cp .env.example .env
# SHARED_SECRET in .env setzen

# 3. Domain DNS A-Records:
# overlay.deinedomain.de → VPS_IP
# config.deinedomain.de  → VPS_IP

# 4. Nginx + SSL (Let's Encrypt)
cp nginx.conf /etc/nginx/sites-available/twitch-quiz
ln -s /etc/nginx/sites-available/twitch-quiz /etc/nginx/sites-enabled/
certbot --nginx -d overlay.deinedomain.de -d config.deinedomain.de

# 5. Starten
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 6. Autostart
systemctl enable docker && systemctl enable nginx
```

### GitHub Actions CI/CD (Auto-Deploy bei Push)

Die Datei `.github/workflows/ci-cd.yml` ist bereits enthalten. Für VPS-Deploy:

1. **GitHub Secrets** setzen (Settings → Secrets → Actions):
   - `VPS_HOST`: IP deines VPS
   - `VPS_USER`: `root` (oder dein User)
   - `VPS_SSH_KEY`: Privater SSH Key (ohne Passphrase)
   - `VPS_PORT`: `22` (optional)

2. **Bei jedem Push auf `main`** wird automatisch:
   - Tests & Lint ausgeführt
   - Docker Image gebaut
   - Per SSH auf VPS deployed

---

### Security Checklist

- [ ] Strong `SHARED_SECRET` (32+ random hex chars)
- [ ] HTTPS/WSS in production (use nginx.conf + certs)
- [ ] Firewall: only expose 80/443, not 3000 directly
- [ ] Rate limiting enabled (nginx.conf included)
- [ ] Regular backups of `server/state.json`

## 🎨 Design Token Reference

All visual customization via CSS custom properties on `:root`:

### Colors
```css
--bg: #0E0E10;              /* Main background */
--bg-elevated: #18181C;     /* Cards, modals */
--fg: #F1F1F3;              /* Primary text */
--fg-muted: #A0A0A8;        /* Secondary text */
--accent: #9146FF;          /* Brand accent (Twitch purple) */
--accent-strong: #B388FF;   /* Hover accent */

--buzzer-idle: #2A2A30;     /* Frame border idle */
--buzzer-hover: #3A3A44;    /* Frame border hover */
--buzzer-active-left: #00FF88;  /* Left wins - neon green */
--buzzer-active-right: #FF4466; /* Right wins - neon red */
--buzzer-lockout: #FFAA00;  /* Lockout - amber */
```

### Typography
```css
--font-display: 'Space Grotesk', sans-serif;  /* Points, names */
--font-ui: 'IBM Plex Sans', sans-serif;       /* UI, questions */
--fs-question: clamp(1.75rem, 4vw, 3rem);
--fs-points: clamp(2.5rem, 6vw, 5rem);
--fs-name: clamp(1.1rem, 2.5vw, 1.5rem);
--fs-timer: clamp(2rem, 5vw, 4rem);
```

### Layout
```css
--frame-aspect: 16 / 9;
--frame-gap: clamp(16px, 3vw, 32px);
--frame-radius: 16px;
--buzzer-glow-spread: 0 0 32px 8px;
```

### Animation
```css
--transition-fast: 120ms ease-out;
--transition-med: 250ms ease-out;
```

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Manual Verification (Acceptance Criteria)

| # | Test | Expected |
|---|------|----------|
| 1 | Open overlay in OBS | No console errors |
| 2 | Open config, enter password | WebSocket connects (🟢) |
| 3 | Set question in config | Overlay updates <200ms |
| 4 | Click buzzer test left/right | First wins, frame glows, lockout works |
| 5 | Change points ±1 | Overlay updates instantly |
| 6 | Change color in Design tab | Overlay updates live, no reload |
| 7 | Restart server (`docker restart`) | State preserved |
| 8 | Resize browser to 1280×720, 1080×1920 | Layout adapts correctly |
| 9 | OS: Reduce motion enabled | Buzzer pulse disabled |
| 10 | Export → Import JSON | Identical state restored |

## 🔧 Troubleshooting

### Overlay shows "Getrennt" (Disconnected)
- Check server is running: `docker-compose ps` or `npm run dev`
- Verify WS URL: Should be `ws://host:3000/overlay`
- Check browser console for connection errors

### Config Panel "Ungültiges Passwort"
- Verify `SHARED_SECRET` in `.env` matches what you're entering
- Check server logs: `docker-compose logs quiz-overlay`

### Changes not syncing to overlay
- Check both overlay and config show "Verbunden" (green dot)
- Verify no browser console errors
- Try refresh overlay browser source in OBS

### Docker: Permission denied on state.json
```bash
# Fix permissions
sudo chown -R 1001:1001 ./server
```

### Font not loading
- Overlay loads Google Fonts (Space Grotesk, IBM Plex Sans)
- For offline use, download fonts and host locally
- Update `@import` in both CSS files

## 📦 Nice-to-Have (Future)

- [ ] Twitch Chat Integration (`!buzz` via EventSub)
- [ ] Sound Effects (buzzer, correct, wrong)
- [ ] Overlay Scenes (Intro, Question, Resolution, Leaderboard)
- [ ] 4+ Player Grid Layout
- [ ] Persistent Player Profiles (SQLite/PostgreSQL)
- [ ] Stream Deck Plugin
- [ ] OBS WebSocket Integration (auto scene switch)

## 📄 License

MIT License - feel free to use for your streams!

## 🤝 Contributing

1. Fork the repo
2. Create feature branch
3. Commit with conventional messages
4. Open PR

## 🙏 Credits

- Fonts: [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk), [IBM Plex Sans](https://fonts.google.com/specimen/IBM+Plex+Sans)
- Icons: [Lucide](https://lucide.dev/) (SVG inline)
- Built with vanilla HTML/CSS/JS + Node.js `ws` library

---

**Happy Streaming!** 🎮✨

*Questions? Issues? Open a GitHub issue or check the [troubleshooting section](#-troubleshooting).*