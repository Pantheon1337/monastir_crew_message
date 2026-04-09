# Git и деплой на VPS

## 1. Локально: перенос в Git

1. Убедитесь, что в репозиторий **не** попадают секреты и данные: в `.gitignore` уже указаны `node_modules`, `dist`, `.env`, `server/data/`, `server/uploads/`, `*.db`.

2. Инициализация и первый коммит (в корне проекта `monastir crew`):

```bash
git init
git add -A
git status
git commit -m "Initial commit: Monastir Crew client + server"
```

3. Создайте **пустой** репозиторий на GitHub / GitLab / Gitea и добавьте remote:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git branch -M main
git push -u origin main
```

При необходимости используйте SSH: `git@github.com:YOUR_USER/YOUR_REPO.git`.

---

## 2. Сервер: что нужно

- **Ubuntu 22.04+** (или другой Linux) с доступом по SSH.
- **Node.js 20 LTS** (или 18+): `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -` и `sudo apt install -y nodejs`.
- **nginx** (рекомендуется) для HTTPS и прокси на Node; для внутренних тестов можно открыть порт приложения напрямую.

Данные на сервере (создайте каталоги и права под пользователя `deploy` или `www-data`):

- каталог для БД и загрузок, **вне** репозитория, например `/var/lib/monastir/` с подкаталогами или переменными `SQLITE_PATH` и существующим `server/uploads` (см. ниже).

---

## 3. Клонирование и сборка

```bash
cd /opt   # или домашний каталог пользователя
git clone https://github.com/YOUR_USER/YOUR_REPO.git monastir-crew
cd monastir-crew

npm run install:all
npm run build
```

Сборка кладёт фронт в `client/dist`. При **`NODE_ENV=production`** процесс Node отдаёт и API, и статику из `client/dist` с **одного порта** (см. `server/index.js`).

---

## 4. Переменные окружения

Скопируйте `.env.example` в `.env` на сервере или задайте переменные в **systemd** (ниже).

| Переменная | Назначение |
|------------|------------|
| `NODE_ENV=production` | Включить раздачу SPA из `client/dist`. |
| `PORT=3001` | Порт HTTP (и WebSocket на том же хосте, путь `/ws`). |
| `SQLITE_PATH` | Полный путь к файлу БД, если не используете `server/data/app.db`. |

Каталог для SQLite и `uploads` должен быть **записываемым** пользователем, от которого запускается Node.

---

## 5. systemd (один процесс Node)

Файл `/etc/systemd/system/monastir.service` (пути подставьте свои):

```ini
[Unit]
Description=Monastir Crew API + SPA
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/monastir-crew/server
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=SQLITE_PATH=/var/lib/monastir/app.db
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/lib/monastir
sudo chown www-data:www-data /var/lib/monastir
sudo systemctl daemon-reload
sudo systemctl enable --now monastir.service
sudo systemctl status monastir.service
```

Убедитесь, что каталог `server/uploads` существует и доступен записи (аватары и истории): например `sudo mkdir -p /opt/monastir-crew/server/uploads && sudo chown -R www-data:www-data /opt/monastir-crew/server/uploads`.

---

## 6. nginx + HTTPS + WebSocket

Пример сервера, который проксирует всё на `127.0.0.1:3001` (TLS выдаёт certbot или свой сертификат):

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.example;

    ssl_certificate     /etc/letsencrypt/live/your-domain.example/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.example/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

После правок: `sudo nginx -t && sudo systemctl reload nginx`.

Фронт и API на **одном** origin — WebSocket в браузере подключается к `wss://ваш-домен/ws` автоматически (см. `useWebSocket.js`). Отдельный `VITE_WS_URL` нужен только если клиент и API на разных доменах.

---

## 7. Обновление после `git push`

На сервере:

```bash
cd /opt/monastir-crew
git pull
npm run install:all
npm run build
sudo systemctl restart monastir.service
```

---

## 8. Бэкапы

Регулярно копируйте файл БД (`SQLITE_PATH` или `server/data/app.db`) и каталог `server/uploads/`. См. также `docs/VPS_AND_DATA.md`.
