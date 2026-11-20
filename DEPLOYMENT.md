# Multi-PC Deployment Guide 🌐

## Architektur für 3 PCs

```
┌─────────────────────────────────────────────────────────────────┐
│                     CENTRAL SERVER (VPS/Cloud)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Overlay    │  │  Config     │  │  State      │             │
│  │  WS :3001   │◄─┤  WS :3001   │  │  (state.json)│             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│         ▲                ▲                ▲                     │
│         │                │                │                     │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
    ┌─────┴─────┐    ┌─────┴─────┐    ┌─────┴─────┐
    │  PC 1     │    │  PC 2     │    │  PC 3     │
    │  Overlay  │    │  Overlay  │    │  Config   │
    │  (OBS)    │    │  (OBS)    │    │  (Mod)    │
    └───────────┘    └───────────┘    └───────────┘
```

---

## Option 1: Railway (Empfohlen - einfachste) 🚂

**Kostenlos** für kleine Projekte, automatisches HTTPS/WSS, GitHub Integration.

### 1. Repository vorbereiten
```bash
cd twitch-quiz-overlay
git init
git add .
git commit -m "Initial commit: Twitch Quiz Overlay"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/twitch-quiz-overlay.git
git push -u origin main
```

### 2. Railway Deployment
1. Gehe zu [railway.app](https://railway.app) → "New Project" → "Deploy from GitHub repo"
2. Wähle dein Repository
3. Railway erkennt automatisch Node.js
4. **Environment Variables** setzen:
   ```
   NODE_ENV=production
   SHARED_SECRET=dein-super-sicherer-32-zeichen-hex-string
   PORT=3000
   ```
   (Secret generieren: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
5. Deploy klicken → Warten bis "Active"

### 3. URLs notieren
Nach Deploy bekommst du z.B.:
- **App URL**: `https://twitch-quiz-overlay-production.up.railway.app`
- **Overlay**: `https://twitch-quiz-overlay-production.up.railway.app/overlay/`
- **Config**: `https://twitch-quiz-overlay-production.up.railway.app/config/`
- **WebSocket**: `wss://twitch-quiz-overlay-production.up.railway.app/overlay` & `/config`

---

## Option 2: Render (Alternative) 🎨

Ähnlich wie Railway, auch kostenloser Tier verfügbar.

1. [render.com](https://render.com) → "New Web Service" → GitHub verbinden
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Environment Variables wie oben setzen
3. **Auto-Deploy** aktivieren

---

## Option 3: Eigener VPS (Hetzner, DigitalOcean, Contabo) 🖥️

**Mehr Kontrolle, günstiger bei Dauerbetrieb (~4-6€/Monat)**

### 1. Server aufsetzen (Ubuntu 22.04/24.04)
```bash
# Als root auf dem VPS
apt update && apt upgrade -y
apt install -y docker.io docker-compose git nginx certbot python3-certbot-nginx
systemctl enable docker nginx
usermod -aG docker $USER
# Neues SSH-Login nötig für docker-Gruppe
```

### 2. Repository clonen
```bash
git clone https://github.com/DEIN-USERNAME/twitch-quiz-overlay.git
cd twitch-quiz-overlay
cp .env.example .env
# .env bearbeiten: SHARED_SECRET setzen
```

### 3. Domain konfigurieren (empfohlen)
DNS A-Records setzen:
```
overlay.deinedomain.de     → DEINE_VPS_IP
config.deinedomain.de      → DEINE_VPS_IP
```

### 4. Nginx + SSL einrichten
```bash
# Nginx Config kopieren
cp nginx.conf /etc/nginx/sites-available/twitch-quiz
ln -s /etc/nginx/sites-available/twitch-quiz /etc/nginx/sites-enabled/
# In nginx.conf: server_name anpassen

# SSL Zertifikate holen
certbot --nginx -d overlay.deinedomain.de -d config.deinedomain.de

# Nginx reload
nginx -t && systemctl reload nginx
```

### 5. Docker Compose starten
```bash
docker-compose up -d --build
# Logs checken
docker-compose logs -f
```

### 6. Autostart (systemd)
```bash
cat > /etc/systemd/system/twitch-quiz.service << 'EOF'
[Unit]
Description=Twitch Quiz Overlay
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/root/twitch-quiz-overlay
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl enable twitch-quiz
systemctl start twitch-quiz
```

---

## PC-Konfiguration (alle 3 PCs) 💻

### PC 1 & 2: Overlay in OBS
1. OBS → Sources → **+** → **Browser Source**
2. **URL**: `https://overlay.deinedomain.de/overlay/` (oder Railway/Render URL)
3. **Width**: 1920, **Height**: 1080 (oder deine Stream-Auflösung)
4. **FPS**: 60
5. ✅ **Uncheck**: "Refresh browser when scene becomes active"
6. **Custom CSS** (für Transparenz):
   ```css
   body { margin: 0; overflow: hidden; background: transparent; }
   ```

### PC 3: Config Panel
1. Browser öffnen: `https://config.deinedomain.de/config/`
2. **Passwort eingeben** = `SHARED_SECRET` aus `.env`
3. Verbunden ✅ → Alle Änderungen gehen live an **beide** Overlay-PCs

---

## WICHTIG: Kamera-Feeds auf PC 1 & 2 🎥

Das Overlay zeigt **Platzhalter-Bilder** für die Kameras. Du hast 2 Optionen:

### Option A: Lokale Kamera-URLs (empfohlen)
In der Config → **Design → Layout** oder per Browser-Konsole:
```javascript
// Auf JEDEM Overlay-PC einzeln in Browser-Konsole (F12):
document.getElementById('leftMedia').innerHTML = '<video src="DEINE_KAMERA_URL_1" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>';
document.getElementById('rightMedia').innerHTML = '<video src="DEINE_KAMERA_URL_2" autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;"></video>';
```
Oder permanent in `public/overlay/index.html` die `src` der Platzhalter-Bilder anpassen.

### Option B: OBS Media Source (einfacher)
In OBS **unter** dem Browser Source:
- **Media Source** für Kamera 1 (links positionieren)
- **Media Source** für Kamera 2 (rechts positionieren)
- Browser Source liegt **darüber** (transparent)

---

## GitHub Actions CI/CD (Optional) 🔄

Erstelle `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      # Für Railway/Render: Deploy via API oder Git Push
      # Für VPS: SSH Deploy
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: root
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /root/twitch-quiz-overlay
            git pull origin main
            docker-compose up -d --build
```

Secrets in GitHub Settings → Secrets → Actions:
- `VPS_HOST`: IP deines VPS
- `VPS_SSH_KEY`: Privater SSH Key (ohne Passphrase)

---

## Troubleshooting 🔧

| Problem | Lösung |
|---------|--------|
| Overlay zeigt "Getrennt" | Prüfe: HTTPS/WSS URLs, Firewall (Port 443), Browser-Konsole |
| Config "Ungültiges Passwort" | `SHARED_SECRET` in `.env` = eingegebenes Passwort? |
| Kameras schwarz | Option A/B oben prüfen, CORS bei Kamera-URLs |
| State nicht synchron | Beide Overlays auf **gleicher** URL? Config verbunden? |
| WebSocket Fehler | Nginx: `proxy_set_header Upgrade $http_upgrade;` prüfen |

---

## Checkliste vor Stream 🎯

- [ ] Server läuft & HTTPS/WSS funktioniert
- [ ] PC 1 Overlay lädt, zeigt "Verbunden" (grüner Punkt)
- [ ] PC 2 Overlay lädt, zeigt "Verbunden"
- [ ] PC 3 Config verbindet, Passwort funktioniert
- [ ] Frage setzen → beide Overlays zeigen sie <200ms
- [ ] Buzzer Test Links/Rechts → korrekter Rahmen leuchtet
- [ ] Punkte +/- → beide Overlays aktualisieren
- [ ] Design-Änderung (Farbe) → live auf beiden Overlays
- [ ] Kameras sichtbar (Option A oder B)
- [ ] `SHARED_SECRET` sicher & notiert

---

**Viel Erfolg beim Stream!** 🎮📺

Bei Fragen: GitHub Issue öffnen oder `DEPLOYMENT.md` erweitern.