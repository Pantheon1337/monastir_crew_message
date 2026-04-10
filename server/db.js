import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.SQLITE_PATH || path.join(__dirname, 'data', 'app.db');

const SCHEMA_VERSION = 10;

let db;

function getSchemaVersion(database) {
  try {
    const row = database.prepare(`SELECT v FROM meta WHERE k = 'schema_version'`).get();
    return row ? Number(row.v) || 0 : 0;
  } catch {
    return 0;
  }
}

function setSchemaVersion(database, v) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY NOT NULL, v TEXT NOT NULL);
  `);
  database.prepare(`INSERT INTO meta (k, v) VALUES ('schema_version', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(String(v));
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
  `);

  const info = database.prepare('PRAGMA table_info(users)').all();
  const names = new Set(info.map((row) => row.name));
  if (!names.has('first_name')) {
    database.exec('ALTER TABLE users ADD COLUMN first_name TEXT;');
  }
  if (!names.has('last_name')) {
    database.exec('ALTER TABLE users ADD COLUMN last_name TEXT;');
  }
  if (!names.has('nickname')) {
    database.exec('ALTER TABLE users ADD COLUMN nickname TEXT;');
  }
  if (!names.has('password_hash')) {
    database.exec('ALTER TABLE users ADD COLUMN password_hash TEXT;');
  }
  if (!names.has('avatar_path')) {
    database.exec('ALTER TABLE users ADD COLUMN avatar_path TEXT;');
  }

  const needNick = database.prepare(`SELECT id FROM users WHERE nickname IS NULL OR trim(nickname) = ''`).all();
  for (const row of needNick) {
    const nick = 'm_' + row.id.replace(/-/g, '').slice(0, 24);
    database
      .prepare(
        `UPDATE users SET first_name = coalesce(nullif(trim(first_name), ''), '—'), last_name = coalesce(nullif(trim(last_name), ''), '—'), nickname = ? WHERE id = ?`
      )
      .run(nick, row.id);
  }

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
  `);

  /** Всегда создаём при отсутствии: иначе при рассинхроне meta (v=4 без таблиц) API падает с 500. */
  database.exec(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY NOT NULL,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_friend_in ON friend_requests(to_user_id, status);
    CREATE TABLE IF NOT EXISTS direct_chats (
      id TEXT PRIMARY KEY NOT NULL,
      user_a TEXT NOT NULL,
      user_b TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_a, user_b)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      chat_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_msg_chat ON messages(chat_id, created_at);
    CREATE TABLE IF NOT EXISTS chat_last_read (
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      last_read_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, chat_id)
    );
  `);

  let ver = getSchemaVersion(database);
  if (ver < 3) {
    database.exec('DELETE FROM users');
    setSchemaVersion(database, 3);
    ver = 3;
  }

  if (ver < 4) {
    setSchemaVersion(database, 4);
    ver = 4;
  }

  if (ver < 5) {
    try {
      database.exec(`
        INSERT OR IGNORE INTO chat_last_read (user_id, chat_id, last_read_at)
        SELECT user_a, id, (strftime('%s','now') * 1000) FROM direct_chats;
        INSERT OR IGNORE INTO chat_last_read (user_id, chat_id, last_read_at)
        SELECT user_b, id, (strftime('%s','now') * 1000) FROM direct_chats;
      `);
    } catch {
      /* нет direct_chats на чистой БД — ок */
    }
    setSchemaVersion(database, 5);
    ver = 5;
  }

  if (ver < 6) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY NOT NULL,
        author_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
      CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        body TEXT,
        media_path TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id);
      CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);
    `);
    setSchemaVersion(database, 6);
    ver = 6;
  }

  if (ver < 7) {
    const msgInfo = database.prepare('PRAGMA table_info(messages)').all();
    const msgNames = new Set(msgInfo.map((row) => row.name));
    if (!msgNames.has('kind')) {
      database.exec(`ALTER TABLE messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text';`);
    }
    if (!msgNames.has('media_path')) {
      database.exec(`ALTER TABLE messages ADD COLUMN media_path TEXT;`);
    }
    if (!msgNames.has('duration_ms')) {
      database.exec(`ALTER TABLE messages ADD COLUMN duration_ms INTEGER;`);
    }
    setSchemaVersion(database, 7);
    ver = 7;
  }

  if (ver < 8) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS story_views (
        viewer_id TEXT NOT NULL,
        story_id TEXT NOT NULL,
        viewed_at INTEGER NOT NULL,
        PRIMARY KEY (viewer_id, story_id)
      );
      CREATE INDEX IF NOT EXISTS idx_story_views_viewer ON story_views(viewer_id);
      CREATE TABLE IF NOT EXISTS message_reactions (
        message_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        reaction TEXT NOT NULL CHECK(reaction IN ('up','down','fire','poop')),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (message_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_msg_react_msg ON message_reactions(message_id);
    `);
    const msgInfo8 = database.prepare('PRAGMA table_info(messages)').all();
    const msgNames8 = new Set(msgInfo8.map((row) => row.name));
    if (!msgNames8.has('ref_story_id')) {
      database.exec(`ALTER TABLE messages ADD COLUMN ref_story_id TEXT;`);
    }
    if (!msgNames8.has('story_reaction_key')) {
      database.exec(`ALTER TABLE messages ADD COLUMN story_reaction_key TEXT;`);
    }
    setSchemaVersion(database, 8);
    ver = 8;
  }

  if (ver < 9) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
    `);
    setSchemaVersion(database, 9);
    ver = 9;
  }

  if (ver < 10) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS room_messages (
        id TEXT PRIMARY KEY NOT NULL,
        room_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        kind TEXT NOT NULL DEFAULT 'text',
        media_path TEXT,
        duration_ms INTEGER,
        ref_story_id TEXT,
        story_reaction_key TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_room_msg_room ON room_messages(room_id, created_at);
      CREATE TABLE IF NOT EXISTS room_last_read (
        user_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        last_read_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, room_id)
      );
    `);
    setSchemaVersion(database, 10);
  }
}

export function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    migrate(db);
  }
  return db;
}

/** Только цифры, длина 10–15 (E.164 без +). */
export function normalizePhone(input) {
  const d = String(input ?? '').replace(/\D/g, '');
  if (d.length < 10 || d.length > 15) return null;
  return d;
}

/**
 * Ник в формате @user: латиница, цифры, подчёркивание, 3–30 символов без @.
 */
export function normalizeNickname(input) {
  let s = String(input ?? '').trim();
  if (s.startsWith('@')) s = s.slice(1);
  s = s.toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(s)) return null;
  return s;
}

export function mapPublicUser(row) {
  if (!row) return null;
  const avatarPath = row.avatarPath ?? row.avatar_path;
  return {
    id: row.id,
    phone: row.phone,
    firstName: row.firstName,
    lastName: row.lastName,
    nickname: row.nickname,
    createdAt: row.createdAt,
    avatarUrl: avatarPath ? `/uploads/${avatarPath}` : null,
  };
}

export function findUserByPhone(phone) {
  const row = getDb()
    .prepare(
      `SELECT id, phone, first_name AS firstName, last_name AS lastName, nickname, created_at AS createdAt, avatar_path AS avatarPath FROM users WHERE phone = ?`
    )
    .get(phone);
  return mapPublicUser(row);
}

export function findUserByNickname(nickname) {
  const row = getDb()
    .prepare(
      `SELECT id, phone, first_name AS firstName, last_name AS lastName, nickname, created_at AS createdAt, avatar_path AS avatarPath FROM users WHERE nickname = ?`
    )
    .get(nickname);
  return mapPublicUser(row);
}

export function findUserById(id) {
  const row = getDb()
    .prepare(
      `SELECT id, phone, first_name AS firstName, last_name AS lastName, nickname, created_at AS createdAt, avatar_path AS avatarPath FROM users WHERE id = ?`
    )
    .get(id);
  return mapPublicUser(row);
}

/** Для входа: включает password_hash (не отдавать клиенту). */
export function findUserWithSecretByNickname(nickname) {
  return getDb()
    .prepare(
      `SELECT id, phone, first_name AS firstName, last_name AS lastName, nickname, created_at AS createdAt, avatar_path AS avatarPath, password_hash AS passwordHash FROM users WHERE nickname = ?`
    )
    .get(nickname);
}

export function createUser({ phone, firstName, lastName, nickname, passwordHash }) {
  const id = randomUUID();
  const createdAt = Date.now();
  getDb()
    .prepare(
      `INSERT INTO users (id, phone, first_name, last_name, nickname, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, phone, firstName.trim(), lastName.trim(), nickname, passwordHash, createdAt);
  return {
    id,
    phone,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    nickname,
    createdAt,
    avatarUrl: null,
  };
}

export function setUserAvatarPath(userId, relativePath) {
  getDb().prepare(`UPDATE users SET avatar_path = ? WHERE id = ?`).run(relativePath, userId);
}
