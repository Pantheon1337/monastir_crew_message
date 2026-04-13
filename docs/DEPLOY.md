# Git и деплой на VPS

## 1. Локально: перенос в Git

1. Убедитесь, что в репозиторий **не** попадают секреты и данные: в `.gitignore` уже указаны `node_modules`, `dist`, `.env`, `server/data/`, `server/uploads/`, `*.db`.

2. Инициализация и первый коммит (в корне проекта `ruscord crew`):

```bash
git init
git add -A
git status
git commit -m "Initial commit: Ruscord - Crew client + server"
```

3. Создайте **пустой** репозиторий на GitHub / GitLab / Gitea и добавьте remote:

```bash
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git branch -M main
git push -u origin main
```

При необходимости используйте SSH: `git@github.com:YOUR_USER/YOUR_REPO.git`.

---

## Пошаговый план на VPS (тестирование и обновления)

Ниже порядок для **Ubuntu 22.04/24.04** по SSH. Подставьте свой IP, домен и путь к клону (пример: `/opt/ruscord-crew`). Репозиторий: `Pantheon1337/ruscord_crew`.

### Этап 0 — доступ и обновление системы

```bash
ssh user@ВАШ_IP
sudo apt update && sudo apt upgrade -y
```

### Этап 1 — пакеты: git, nginx, файрвол, сборка C++

```bash
sudo apt install -y git nginx ufw curl build-essential
```

- **git** — клонирование и `git pull`
- **nginx** — прокси и HTTPS (можно подключить после первого успешного запуска Node)
- **ufw** — файрвол
- **build-essential** — сборка нативных модулей npm (**better-sqlite3** и др.)

Certbot (когда будет домен и nginx):

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### Этап 2 — Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```

### Этап 3 — файрвол

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Если **временно** тестируете без nginx напрямую на порт приложения:

```bash
sudo ufw allow 3001/tcp
```

В продакшене с nginx снаружи обычно открыты только **22, 80, 443**; порт **3001** остаётся только на `127.0.0.1`.

### Этап 4 — каталоги данных (вне git)

База и загрузки не должны теряться при `git pull`.

```bash
sudo mkdir -p /var/lib/ruscord-crew
sudo chown www-data:www-data /var/lib/ruscord-crew
```

Каталог репозитория (пример):

```bash
sudo mkdir -p /opt/ruscord-crew
sudo chown $USER:$USER /opt/ruscord-crew
```

### Этап 5 — клонирование

```bash
cd /opt
git clone https://github.com/Pantheon1337/ruscord_crew.git ruscord-crew
cd ruscord-crew
```

Для приватного репозитория: [Personal Access Token](https://github.com/settings/tokens) при `git clone` по HTTPS или [SSH-ключ](https://docs.github.com/en/authentication/connecting-to-github-with-ssh) на сервере.

### Этап 6 — зависимости и сборка фронта

```bash
npm run install:all
npm run build
```

При ошибке сборки нативных модулей проверьте **build-essential** и повторите `npm run install:all`.

### Этап 7 — права на uploads

```bash
sudo mkdir -p /opt/ruscord-crew/server/uploads
sudo chown -R www-data:www-data /opt/ruscord-crew/server/uploads
```

(Путь к репо замените на свой, пользователь — тот же, что в `User=` в systemd.)

### Этап 8 — пробный запуск вручную

```bash
cd /opt/ruscord-crew/server
export NODE_ENV=production
export PORT=3001
export SQLITE_PATH=/var/lib/ruscord-crew/app.db
node index.js
```

Проверка API: `curl -s http://127.0.0.1:3001/api/health`. В браузере — `http://ВАШ_IP:3001`, если открыт порт **3001** в ufw. Остановка: **Ctrl+C**.

### Этап 9 — systemd

Создайте юнит по разделу **«5. systemd»** ниже (`WorkingDirectory`, `Environment`, `User=www-data`), затем:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ruscord-crew.service
sudo systemctl status ruscord-crew.service
sudo journalctl -u ruscord-crew.service -n 80 --no-pager
```

### Этап 10 — nginx и HTTPS

1. DNS: **A**-запись домена на IP VPS.
2. Конфиг — раздел **«6. nginx»** ниже; `server_name` — ваш домен; `proxy_pass` на `127.0.0.1:3001`.
3. `sudo nginx -t && sudo systemctl reload nginx`
4. `sudo certbot --nginx -d ваш.домен`

Сайт: `https://ваш.домен` — и страница, и `/api`, и WebSocket `/ws` с одного origin.

### Этап 11 — цикл после разработки (`git push`)

На сервере:

```bash
cd /opt/ruscord-crew
git pull
npm run install:all
npm run build
sudo systemctl restart ruscord-crew.service
```

### Разработка на VPS (опционально)

Для постоянного тестового стенда обычно достаточно **production-сборки** (этапы 6–11). Отладка «как на локалке» (Vite `npm run dev` + `node --watch`) возможна в **screen/tmux** и с пробросом портов по SSH; для ежедневной работы удобнее править код **локально**, пушить в Git и выполнять этап **11** на VPS.

---

## 2. Сервер: что нужно (кратко)

- **Ubuntu 22.04+** с SSH.
- **Node.js 20 LTS** — см. этап 2 выше.
- **nginx** — прокси и TLS; для быстрого теста можно обойтись портом **3001** и ufw.
- Каталог для БД (**`/var/lib/ruscord-crew`** или `SQLITE_PATH`) и **`server/uploads`** с правами пользователя сервиса.

---

## 3. Клонирование и сборка

```bash
cd /opt   # или домашний каталог пользователя
git clone https://github.com/YOUR_USER/YOUR_REPO.git ruscord-crew
cd ruscord-crew

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

Файл `/etc/systemd/system/ruscord-crew.service` (пути подставьте свои):

```ini
[Unit]
Description=Ruscord - Crew API + SPA
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/ruscord-crew/server
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=SQLITE_PATH=/var/lib/ruscord-crew/app.db
ExecStart=/usr/bin/node index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo mkdir -p /var/lib/ruscord-crew
sudo chown www-data:www-data /var/lib/ruscord-crew
sudo systemctl daemon-reload
sudo systemctl enable --now ruscord-crew.service
sudo systemctl status ruscord-crew.service
```

Убедитесь, что каталог `server/uploads` существует и доступен записи (аватары и истории): например `sudo mkdir -p /opt/ruscord-crew/server/uploads && sudo chown -R www-data:www-data /opt/ruscord-crew/server/uploads`.

### Управление службой: вкл / выкл / перезапуск

Имя юнита в примерах: **`ruscord-crew.service`** (коротко в командах: **`ruscord-crew`**).

| Действие | Команда |
|----------|---------|
| **Запустить** | `sudo systemctl start ruscord-crew` |
| **Остановить** | `sudo systemctl stop ruscord-crew` |
| **Перезапустить** (после `git pull`, сборки или правок) | `sudo systemctl restart ruscord-crew` |
| **Статус** (работает ли, последние ошибки) | `sudo systemctl status ruscord-crew` |
| **Логи в реальном времени** | `sudo journalctl -u ruscord-crew -f` (выход: **Ctrl+C**) |
| **Последние 80 строк логов** | `sudo journalctl -u ruscord-crew -n 80 --no-pager` |
| **Включить автозапуск при загрузке VPS** | `sudo systemctl enable ruscord-crew` |
| **Выключить автозапуск** | `sudo systemctl disable ruscord-crew` |

Первый запуск после создания файла службы:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ruscord-crew.service
```

Перед этим выполните **`npm run build`** в каталоге проекта (иначе при `NODE_ENV=production` не будет `client/dist`).

**Типичный цикл после внесения изменений** (на сервере):

```bash
cd /opt/ruscord-crew
git pull
npm run install:all    # только если менялись зависимости в package.json
npm run build          # если менялся фронт (client)
sudo systemctl restart ruscord-crew.service
```

Если правили **только** файлы в `server/` и зависимости не трогали — достаточно `git pull` и **`sudo systemctl restart ruscord-crew`**. Если меняли **клиент** — обязательно **`npm run build`**, затем перезапуск.

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
cd /opt/ruscord-crew
git pull
npm run install:all
npm run build
sudo systemctl restart ruscord-crew.service
```

---

## 8. Бэкапы

Регулярно копируйте файл БД (`SQLITE_PATH` или `server/data/app.db`) и каталог `server/uploads/`. См. также `docs/VPS_AND_DATA.md`.
