/**
 * PM2: лимит памяти Node и авто-перезапуск.
 *
 * Важно: не поднимайте instances > 1 для этого приложения без доработок:
 * — SQLite и in-memory WebSocket (socketsByUser) не разделены между процессами;
 * — балансировка Nginx на несколько Node потребует sticky-сессий и Redis/pub-sub для WS.
 *
 * Видео: пережатие FFmpeg — вне процесса Node (отдельная очередь/воркер), иначе RSS взлетит.
 */
module.exports = {
  apps: [
    {
      name: 'monastir-crew',
      cwd: __dirname + '/server',
      script: 'index.js',
      interpreter: 'node',
      node_args: '--max-old-space-size=768',
      max_memory_restart: '850M',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 30,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
