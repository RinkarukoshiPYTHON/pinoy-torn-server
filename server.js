/**
 * VEXON — server-ready multiplayer backend
 * ==============================================
 * Express (REST) + ws (WebSocket).
 *
 * Datastore: PostgreSQL kapag may DATABASE_URL (totoong database — hindi
 * nawawala ang progress pag nag-restart ang server), data.json lang kapag wala.
 * Sa Render, ang render.yaml ay gumagawa ng libreng PostgreSQL at naglalagay
 * ng DATABASE_URL nang kusa.
 *
 * TAKBO (local):  npm install && npm start        -> http://localhost:3000
 * CLIENT:         isang setting lang — API_URL (tingnan ang client-config.example.js)
 *
 * Auth: password = scrypt hash (Node built-in crypto), token = HMAC-signed
 * token (walang jsonwebtoken dependency). Lahat ng /api/* maliban sa
 * /api/auth/* at /api/updates ay kailangan ng `Authorization: Bearer <token>`.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-palitan-mo';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

// ---------------------------------------------------------------------------
// Torn-like tuning (isang lugar lang ang numbers, madaling i-tweak)
// ---------------------------------------------------------------------------
const REGEN = { // 1 point kada X ms — mabilis nang kaunti vs real Torn para masaya mag-test
  energy: 5 * 60 * 1000, nerve: 3 * 60 * 1000,
  happy: 10 * 60 * 1000, life: 5 * 60 * 1000,
};
const MAX = { energy: 100, nerve: 100, happy: 100, life: 100 };

const CRIMES = [
  { id: 'mandukot-jeep', name: 'Mandukot sa Jeep', nerve: 5, min: 50, max: 200, xp: 10, level: 1, jailChance: 0.12, jailMin: 5, desc: 'Dukot ng wallet sa siksikang jeep.' },
  { id: 'snatch-quiapo', name: 'Snatch sa Quiapo', nerve: 8, min: 150, max: 400, xp: 18, level: 2, jailChance: 0.16, jailMin: 10, desc: 'Hablot ng bag, takbo sa eskinita.' },
  { id: 'nakaw-motor', name: 'Nakaw ng Motor', nerve: 12, min: 400, max: 900, xp: 28, level: 4, jailChance: 0.20, jailMin: 15, desc: 'Hotwire ng motor sa parking.' },
  { id: 'budol-budol', name: 'Budol-Budol', nerve: 15, min: 800, max: 1800, xp: 40, level: 6, jailChance: 0.22, jailMin: 20, desc: 'Pang-uuto, kunwari may promo.' },
  { id: 'holdap-tricycle', name: 'Holdap sa Tricycle', nerve: 18, min: 1200, max: 2600, xp: 55, level: 8, jailChance: 0.25, jailMin: 25, desc: 'Holdap sa madilim na kanto.' },
  { id: 'akyat-bahay', name: 'Akyat-Bahay', nerve: 22, min: 2000, max: 4200, xp: 75, level: 11, jailChance: 0.28, jailMin: 30, desc: 'Pasok sa bahay habang tulog ang lahat.' },
  { id: 'nakaw-alalhas', name: 'Nakaw ng Alahas', nerve: 26, min: 3500, max: 7000, xp: 100, level: 14, jailChance: 0.30, jailMin: 40, desc: 'Alahas sa pawnshop, mabilisang galaw.' },
  { id: 'holdap-bangko', name: 'Holdap sa Bangko sa Binondo', nerve: 35, min: 8000, max: 18000, xp: 160, level: 18, jailChance: 0.35, jailMin: 60, desc: 'Ang pinakamalaking heist sa Binondo.' },
];
const JOBS = [
  { id: 'tindero', name: 'Tindero sa Sari-Sari Store', pay: 350, energy: 10, level: 1 },
  { id: 'jeepney-driver', name: 'Jeepney Driver', pay: 600, energy: 12, level: 2 },
  { id: 'security', name: 'Security Guard', pay: 900, energy: 12, level: 4 },
  { id: 'call-center', name: 'Call Center Agent', pay: 1400, energy: 10, level: 6 },
  { id: 'mekaniko', name: 'Mekaniko', pay: 1800, energy: 14, level: 8 },
  { id: 'nurse', name: 'Nurse', pay: 2600, energy: 10, level: 10 },
  { id: 'manager', name: 'Store Manager', pay: 4200, energy: 10, level: 13 },
  { id: 'ceo', name: 'CEO', pay: 9000, energy: 8, level: 17 },
];
const COURSES = [
  { id: 'basic-computer', name: 'Basic Computer', cost: 500, minutes: 60, reward: { stat: 'dex', amount: 2 } },
  { id: 'self-defense', name: 'Self Defense', cost: 800, minutes: 90, reward: { stat: 'def', amount: 3 } },
  { id: 'driving', name: 'Driving Lessons', cost: 1200, minutes: 120, reward: { stat: 'spd', amount: 3 } },
  { id: 'business', name: 'Business Management', cost: 2500, minutes: 180, reward: { stat: 'str', amount: 2 } },
  { id: 'criminology', name: 'Criminology', cost: 4000, minutes: 240, reward: { stat: 'dex', amount: 5 } },
  { id: 'law', name: 'Law Degree', cost: 8000, minutes: 360, reward: { stat: 'def', amount: 5 } },
];
const PROPERTIES = [
  { id: 'kubo', name: 'Kubo sa Probinsya', price: 5000, happyRegenBonus: 0 },
  { id: 'apartment', name: 'Apartment sa Maynila', price: 25000, happyRegenBonus: 1 },
  { id: 'condo', name: 'Condo sa Makati', price: 120000, happyRegenBonus: 2 },
  { id: 'bahay', name: 'Bahay sa Subdivision', price: 500000, happyRegenBonus: 3 },
  { id: 'mansion', name: 'Mansyon sa Forbes Park', price: 2500000, happyRegenBonus: 5 },
];
const CITIES = [
  { id: 'manila', name: 'Maynila', cost: 0 },
  { id: 'quezon-city', name: 'Quezon City', cost: 100 },
  { id: 'baguio', name: 'Baguio', cost: 500 },
  { id: 'cebu', name: 'Cebu', cost: 1500 },
  { id: 'iloilo', name: 'Iloilo', cost: 1800 },
  { id: 'davao', name: 'Davao', cost: 2500 },
  { id: 'batangas', name: 'Batangas', cost: 800 },
];
const STOCKS_SEED = [
  { symbol: 'JEEP', name: 'Jeepney Transport Corp.', price: 42 },
  { symbol: 'SRST', name: 'Sari-Sari Holdings', price: 118 },
  { symbol: 'ADBO', name: 'Adobo Foods Inc.', price: 85 },
  { symbol: 'BANKO', name: 'Bangko ng Bayan', price: 210 },
  { symbol: 'TELCO', name: 'Pinoy Telecom', price: 340 },
];
const ITEMS_SEED = [
  { id: 'pandesal', name: 'Pandesal', price: 20, effect: { bar: 'energy', amount: 5 } },
  { id: 'isaw', name: 'Isaw', price: 30, effect: { bar: 'happy', amount: 8 } },
  { id: 'energy-drink', name: 'Energy Drink', price: 120, effect: { bar: 'energy', amount: 25 } },
  { id: 'bandage', name: 'Bandage', price: 80, effect: { bar: 'life', amount: 20 } },
  { id: 'balisong', name: 'Balisong', price: 500, effect: { stat: 'str', amount: 1 } },
  { id: 'motor', name: 'Motor', price: 45000, effect: { stat: 'spd', amount: 2 } },
];
const MISSIONS = [
  { id: 'm1', name: 'Unang Dukot', desc: 'Gumawa ng 3 krimen.', type: 'crimes', target: 3, reward: 500, xp: 30 },
  { id: 'm2', name: 'Pawis sa Gym', desc: 'Mag-train ng 5 beses sa gym.', type: 'gym', target: 5, reward: 800, xp: 40 },
  { id: 'm3', name: 'May Trabaho Na', desc: 'Magtrabaho ng 5 shift.', type: 'work', target: 5, reward: 1000, xp: 50 },
  { id: 'm4', name: 'Biyahe', desc: 'Bumiyahe sa 3 magkaibang lungsod.', type: 'travel', target: 3, reward: 1500, xp: 60 },
  { id: 'm5', name: 'Unang Laban', desc: 'Manalo ng 1 PvP laban.', type: 'pvp-win', target: 1, reward: 2000, xp: 80 },
];
const CHANGELOG = [
  { version: 'v1.0 — 2004', note: 'First release: Crimes, Gym, Jobs, Factions.' },
  { version: 'v2.0 — 2008', note: 'Travel, Stocks, and Properties added.' },
  { version: 'v3.0 — 2015', note: 'Casino, Racing, and Bounties.' },
  { version: 'v25.0 — Crimes 2.0', note: 'New crime system, Organized Crimes.' },
  { version: 'v26.10 — Organized Crimes 2.0', note: 'New scenarios, faction crime boosts x2.5.' },
  { version: 'v26.11 — Ranked War', note: 'Latest: Ranked War between factions.' },
];

// ---------------------------------------------------------------------------
// JSON datastore (isang file lang — data.json)
// ---------------------------------------------------------------------------
function seedDb() {
  const bots = [
    ['Vex Marlowe', 14, 3200], ['Joey Cross', 9, 1800], ['Nena Voss', 12, 2600],
    ['Rico Slade', 16, 5400], ['Liza Kane', 7, 1200], ['Tommy Vex', 11, 2100],
    ['Dario Venn', 20, 9800], ['Troy Mercer', 5, 800], ['Faye Marlowe', 8, 1500],
    ['Dante Cole', 13, 3000], ['Ines Vale', 6, 900], ['Boss Vane', 22, 15000],
  ].map(([name, level, money], i) => ({
    id: 'bot-' + (i + 1), username: name, isBot: true,
    level, xp: level * 100, money, bank: money * 2,
    stats: { str: 10 + level, def: 10 + level, spd: 8 + level, dex: 8 + level },
    bars: { energy: 80, nerve: 80, happy: 70, life: 100 },
    lastTick: Date.now(), city: 'manila', jobId: null, factionId: null,
    propertyId: i % 3 === 0 ? 'kubo' : null, education: null,
    inventory: {}, stocks: {}, jailUntil: 0, hospitalUntil: 0,
    missions: {}, counters: { crimes: 0, gym: 0, work: 0, travel: 0, pvpWin: 0 },
    createdAt: Date.now(),
  }));
  return {
    users: bots,
    factions: [
      { id: 'fac-1', name: 'Vexon Kings', leaderId: 'bot-7', members: ['bot-7', 'bot-1', 'bot-2'], warScore: 0, createdAt: Date.now() },
      { id: 'fac-2', name: 'The Hollow Syndicate', leaderId: 'bot-4', members: ['bot-4', 'bot-6', 'bot-10'], warScore: 0, createdAt: Date.now() },
    ],
    wars: [],
    bounties: [{ id: 'bnt-1', targetId: 'bot-12', placedBy: 'bot-7', amount: 5000, claimed: false, createdAt: Date.now() }],
    chat: [{ id: 'chat-1', channel: 'global', username: 'Vex Marlowe', message: 'Welcome to Vexon City. Who wants to join the Vexon Kings?', at: Date.now() }],
    trades: [],
    stocks: STOCKS_SEED,
    nextId: 100,
  };
}

// ---------------------------------------------------------------------------
// VEXON: bot/faction renames (English syndicate names) + rank ladder
// ---------------------------------------------------------------------------
const VEXON_BOT_RENAMES = {
  MangBerto: 'Vex Marlowe', JojoBatangas: 'Joey Cross', AlingNena: 'Nena Voss',
  KuyaRico: 'Rico Slade', AteLiza: 'Liza Kane', BoyTusok: 'Tommy Vex',
  KapitanDing: 'Dario Venn', Tisoy: 'Troy Mercer', MarengFe: 'Faye Marlowe',
  Dodong: 'Dante Cole', Inday: 'Ines Vale', Bossing: 'Boss Vane',
};
const VEXON_FACTION_RENAMES = { 'Barangay Malaya': 'Vexon Kings', 'Tropa ng Quiapo': 'The Hollow Syndicate' };
// One-time migration: renames the seeded bots/factions in the live database
// (Postgres kv_store or data.json) the first time the new server boots.
function migrateVexonNames() {
  let changed = false;
  for (const u of db.users || []) {
    if (u.isBot && VEXON_BOT_RENAMES[u.username]) { u.username = VEXON_BOT_RENAMES[u.username]; changed = true; }
  }
  for (const f of db.factions || []) {
    if (VEXON_FACTION_RENAMES[f.name]) { f.name = VEXON_FACTION_RENAMES[f.name]; changed = true; }
  }
  for (const c of db.chat || []) {
    if (VEXON_BOT_RENAMES[c.username]) {
      c.username = VEXON_BOT_RENAMES[c.username];
      if (c.message && c.message.indexOf('Barangay Malaya') !== -1) c.message = 'Welcome to Vexon City. Who wants to join the Vexon Kings?';
      changed = true;
    }
  }
  if (changed) saveDb();
}

// Rank ladder - same table as the VEXON client (The Blood Ladder).
// Each tier: 3 divisions (III -> II -> I), 200 pts per division.
const RANK_LADDER = [
  { tier: 'Bronze', win: 20, loss: 10, streak: 5 },
  { tier: 'Silver', win: 18, loss: 15, streak: 4 },
  { tier: 'Gold', win: 15, loss: 20, streak: 3 },
  { tier: 'Platinum', win: 12, loss: 25, streak: 2 },
  { tier: 'Diamond', win: 9, loss: 30, streak: 1 },
  { tier: 'Master', win: 6, loss: 35, streak: 0 },
  { tier: 'Grandmaster', win: 4, loss: 40, streak: 0 },
];
const RANK_DIVISIONS = ['III', 'II', 'I'];
const RANK_DIV_PTS = 200;
function defaultRank() { return { tier: 'Bronze', division: 'III', points: 0, wins: 0, losses: 0, streak: 0 }; }
function rankIndex(r) {
  const ti = RANK_LADDER.findIndex((t) => t.tier === r.tier);
  const di = RANK_DIVISIONS.indexOf(r.division);
  return { ti: ti < 0 ? 0 : ti, di: di < 0 ? 0 : di };
}
function applyRankResult(r, won) {
  const rank = { tier: r.tier || 'Bronze', division: r.division || 'III', points: r.points || 0, wins: r.wins || 0, losses: r.losses || 0, streak: r.streak || 0 };
  const idx = rankIndex(rank);
  const table = RANK_LADDER[idx.ti];
  let delta = 0;
  let promoted = false;
  if (won) {
    rank.wins += 1;
    rank.streak += 1;
    delta = table.win + (rank.streak >= 2 ? table.streak : 0);
    rank.points += delta;
    while (rank.points >= RANK_DIV_PTS) {
      const top = idx.ti === RANK_LADDER.length - 1 && idx.di === RANK_DIVISIONS.length - 1;
      if (top) { rank.points = RANK_DIV_PTS; break; }
      rank.points -= RANK_DIV_PTS;
      if (idx.di < RANK_DIVISIONS.length - 1) idx.di += 1; else { idx.di = 0; idx.ti += 1; }
      rank.tier = RANK_LADDER[idx.ti].tier;
      rank.division = RANK_DIVISIONS[idx.di];
      promoted = true;
    }
  } else {
    rank.losses += 1;
    rank.streak = 0;
    delta = -Math.min(rank.points, table.loss);
    rank.points = Math.max(0, rank.points + delta);
  }
  return { rank, delta, promoted };
}

let db;
// ---------------------------------------------------------------------------
// Datastore: PostgreSQL kapag may DATABASE_URL, data.json kapag wala.
// Ang buong game state ay isang JSONB row (key='main') — kaya walang kailangang
// baguhin sa ibang bahagi ng server; ang saveDb() lang ang nagbago.
// Sa Postgres mode, naka-queue ang mga save para sunod-sunod sila.
// ---------------------------------------------------------------------------
let pgPool = null;
let pgMode = false;
let saveQueue = Promise.resolve();
async function initDb() {
  const url = process.env.DATABASE_URL;
  if (url) {
    try {
      const { Pool } = require('pg');
      const needsSsl = url.includes('sslmode=require') || /\.render\.com/i.test(url) || /\.onrender\.com/i.test(url);
      pgPool = new Pool({ connectionString: url, max: 3, ssl: needsSsl ? { rejectUnauthorized: false } : undefined });
      await pgPool.query('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
      const r = await pgPool.query('SELECT data FROM kv_store WHERE key = $1', ['main']);
      if (r.rows.length) {
        db = r.rows[0].data;
        if (!db.trades) db.trades = [];
        pgMode = true;
        console.log('DB: PostgreSQL — naka-load mula sa totoong database.');
        return;
      }
      db = seedDb();
      pgMode = true;
      await pgPool.query('INSERT INTO kv_store (key, data) VALUES ($1, $2)', ['main', JSON.stringify(db)]);
      console.log('DB: PostgreSQL — bagong seed na-save sa database.');
      return;
    } catch (e) {
      console.error('DB: hindi maabot ang PostgreSQL, bumabalik sa data.json:', e.message);
      pgPool = null; pgMode = false;
    }
  }
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } else {
    db = seedDb();
    saveDb();
  }
  if (!db.trades) db.trades = [];
}
function saveDb() {
  if (pgMode && pgPool) {
    const snapshot = JSON.stringify(db);
    saveQueue = saveQueue.then(() => pgPool.query(
      'INSERT INTO kv_store (key, data) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()',
      ['main', snapshot]
    )).catch((e) => console.error('DB save failed (Postgres):', e.message));
    return;
  }
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function nextId(prefix) { return prefix + '-' + (db.nextId++); }
function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function checkPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(pw, salt, 64));
}
function makeToken(userId) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 araw
  const payload = userId + '.' + exp;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(payload + '.' + sig).toString('base64url');
}
function verifyToken(token) {
  try {
    const [userId, exp, sig] = Buffer.from(token, 'base64url').toString('utf8').split('.');
    if (Date.now() > parseInt(exp, 10)) return null;
    const expect = crypto.createHmac('sha256', JWT_SECRET).update(userId + '.' + exp).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    return userId;
  } catch { return null; }
}
function publicUser(u) {
  if (!u) return null;
  const { passwordHash, email, cloudSave, ...rest } = u;
  return rest;
}
function regen(u) {
  const now = Date.now();
  const dt = now - (u.lastTick || now);
  if (dt <= 0) return;
  for (const bar of Object.keys(REGEN)) {
    const gained = Math.floor(dt / REGEN[bar]);
    if (gained > 0) u.bars[bar] = Math.min(MAX[bar], u.bars[bar] + gained);
  }
  u.lastTick = now;
}
function levelFor(xp) { return Math.floor(Math.sqrt(xp / 100)) + 1; }
function addXp(u, amount) {
  u.xp += amount;
  const lvl = levelFor(u.xp);
  if (lvl > u.level) { u.level = lvl; return true; }
  return false;
}
function statusOf(u) {
  const now = Date.now();
  return {
    jailed: u.jailUntil > now, jailEndsInSec: Math.max(0, Math.ceil((u.jailUntil - now) / 1000)),
    hospitalized: u.hospitalUntil > now, hospitalEndsInSec: Math.max(0, Math.ceil((u.hospitalUntil - now) / 1000)),
  };
}
function guard(u, res) {
  const s = statusOf(u);
  if (s.jailed) return res.status(423).json({ error: 'You are still in jail.', jailEndsInSec: s.jailEndsInSec });
  if (s.hospitalized) return res.status(423).json({ error: 'You are still in the hospital.', hospitalEndsInSec: s.hospitalEndsInSec });
  return null;
}
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}
function logEvent(username, text) {
  db.chat.push({ id: nextId('chat'), channel: 'feed', username, message: text, at: Date.now() });
  if (db.chat.length > 200) db.chat = db.chat.slice(-200);
  broadcast({ type: 'event', username, message: text, at: Date.now() });
}

// ---------------------------------------------------------------------------
// Express app + auth
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const userId = token ? verifyToken(token) : null;
  const user = userId ? db.users.find((u) => u.id === userId) : null;
  if (!user) return res.status(401).json({ error: 'You need to log in. (token missing/invalid)' });
  regen(user);
  req.user = user;
  next();
}

app.get('/', (req, res) => res.json({
  game: 'VEXON', status: 'online',
  players: db.users.length, factions: db.factions.length,
  docs: 'GET /api/updates — see README.md for all endpoints.',
}));
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString(), players: db.users.length }));
app.get('/api/updates', (req, res) => res.json({ changelog: CHANGELOG }));

// --- Auth ---
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body || {};
  const em = String(email || '').trim().toLowerCase();
  if (!username || !em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || !password || String(password).length < 4)
    return res.status(400).json({ error: 'Username, a valid email, and a password (min. 4 chars) are required.' });
  if (db.users.some((u) => u.username.toLowerCase() === String(username).toLowerCase()))
    return res.status(409).json({ error: 'That username is already taken.' });
  if (db.users.some((u) => (u.email || '').toLowerCase() === em))
    return res.status(409).json({ error: 'An account already uses that email.' });
  const u = {
    id: nextId('user'), username: String(username).slice(0, 20), email: em, passwordHash: hashPassword(String(password)),
    isBot: false, level: 1, xp: 0, money: 1000, bank: 0,
    stats: { str: 10, def: 10, spd: 10, dex: 10 },
    bars: { energy: 100, nerve: 50, happy: 80, life: 100 },
    lastTick: Date.now(), city: 'manila', jobId: null, factionId: null,
    propertyId: null, education: null, inventory: {}, stocks: {},
    jailUntil: 0, hospitalUntil: 0, missions: {},
    counters: { crimes: 0, gym: 0, work: 0, travel: 0, pvpWin: 0 },
    createdAt: Date.now(),
  };
  db.users.push(u); saveDb();
  res.status(201).json({ token: makeToken(u.id), player: { ...publicUser(u), email: u.email } });
});
app.post('/api/auth/login', (req, res) => {
  const { username, email, login, password } = req.body || {};
  const id = String(login || username || email || '').trim().toLowerCase();
  const u = db.users.find((x) => x.username.toLowerCase() === id || (x.email || '').toLowerCase() === id);
  if (!u || u.isBot || !u.passwordHash || !checkPassword(String(password || ''), u.passwordHash))
    return res.status(401).json({ error: 'Wrong email/username or password.' });
  regen(u); saveDb();
  res.json({ token: makeToken(u.id), player: { ...publicUser(u), email: u.email } });
});

// --- Profile / players ---
app.get('/api/me', auth, (req, res) => res.json({ player: publicUser(req.user), status: statusOf(req.user) }));
// Profile pic: POST /api/me/avatar {avatar} — data URL ng image (JPEG/PNG, ~<200KB).
// Naka-save sa user record kaya kasama na siya sa /api/players at /api/me
// (publicUser ay nagbabalik ng lahat ng field maliban sa passwordHash/email).
app.post('/api/me/avatar', auth, (req, res) => {
  const u = req.user;
  const { avatar } = req.body || {};
  if (avatar === null || avatar === '') { u.avatar = null; saveDb(); return res.json({ success: true, message: 'Profile pic removed.', player: publicUser(u) }); }
  if (typeof avatar !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(avatar)) return res.status(400).json({ error: 'Invalid image (JPEG/PNG only).' });
  if (avatar.length > 300000) return res.status(400).json({ error: 'Image too large (max ~200KB).' });
  u.avatar = avatar; saveDb();
  res.json({ success: true, message: 'Your profile pic has been saved.', player: publicUser(u) });
});
app.get('/api/players', auth, (req, res) => {
  const list = db.users.map((u) => { regen(u); return publicUser(u); })
    .sort((a, b) => b.level - a.level || b.money - a.money);
  saveDb();
  res.json({ players: list, online: wss ? [...wss.clients].filter((c) => c.readyState === 1).length : 0 });
});
app.get('/api/players/:id', auth, (req, res) => {
  const u = db.users.find((x) => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'No such player.' });
  regen(u); saveDb();
  res.json({ player: publicUser(u) });
});
app.get('/api/leaderboard', auth, (req, res) => {
  // Real players lang — walang bot dito. ?by=crimes | money | xp (default xp)
  const by = req.query.by === 'crimes' ? 'crimes' : req.query.by === 'money' ? 'money' : 'xp';
  const key = by === 'crimes' ? (u) => (u.counters && u.counters.crimes) || 0
    : by === 'money' ? (u) => u.money + (u.bank || 0)
    : (u) => u.xp;
  const top = [...db.users].filter((u) => !u.isBot).sort((a, b) => key(b) - key(a)).slice(0, 20)
    .map((u) => ({ id: u.id, username: u.username, level: u.level, xp: u.xp, money: u.money, bank: u.bank || 0, crimes: (u.counters && u.counters.crimes) || 0, pvpWin: (u.counters && u.counters.pvpWin) || 0, avatar: u.avatar || null, rank: u.rank || null, isBot: false }));
  res.json({ leaderboard: top, by });
});


// --- Ranked Mode (The Blood Ladder) ---
// The client POSTs each ranked fight result; the server applies the ladder
// math itself so rank is authoritative and visible to other players.
app.post('/api/rank/result', auth, (req, res) => {
  const u = req.user;
  const { opponentId, won } = req.body || {};
  if (typeof won !== 'boolean') return res.status(400).json({ error: 'won must be true or false.' });
  const opp = opponentId ? db.users.find((x) => x.id === opponentId) : null;
  if (opponentId && (!opp || opp.id === u.id)) return res.status(404).json({ error: 'No such opponent.' });
  if (!u.rank) u.rank = defaultRank();
  const out = applyRankResult(u.rank, won);
  u.rank = out.rank;
  u.counters.rankWins = (u.counters.rankWins || 0) + (won ? 1 : 0);
  u.counters.rankLosses = (u.counters.rankLosses || 0) + (won ? 0 : 1);
  saveDb();
  res.json({ success: true, rank: u.rank, delta: out.delta, promoted: out.promoted, player: publicUser(u) });
});
app.get('/api/rank/ladder', auth, (req, res) => {
  res.json({ ladder: RANK_LADDER, divisions: RANK_DIVISIONS, pointsPerDivision: RANK_DIV_PTS, myRank: req.user.rank || defaultRank() });
});

// --- Cloud save: cross-device progress ---
// The client uploads its whole game state (throttled) and downloads it on
// login, so progress survives a new phone. Top-level fields are also synced
// onto the server user so leaderboards and the player list stay truthful.
app.get('/api/me/save', auth, (req, res) => {
  res.json({ save: req.user.cloudSave || null, updatedAt: req.user.cloudSaveUpdatedAt || 0 });
});
app.post('/api/me/save', auth, (req, res) => {
  const u = req.user;
  const save = (req.body || {}).save;
  if (!save || typeof save !== 'object' || Array.isArray(save)) return res.status(400).json({ error: 'save must be an object.' });
  if (JSON.stringify(save).length > 200000) return res.status(400).json({ error: 'Save too large (max ~200KB).' });
  u.cloudSave = save;
  u.cloudSaveUpdatedAt = Date.now();
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  let v;
  if ((v = num(save.money)) !== null) u.money = clamp(Math.floor(v), 0, 100000000);
  if ((v = num(save.bank)) !== null) u.bank = clamp(Math.floor(v), 0, 100000000);
  if ((v = num(save.xp)) !== null) { u.xp = clamp(Math.floor(v), 0, 100000000); u.level = levelFor(u.xp); }
  if ((v = num(save.level)) !== null && u.level < clamp(Math.floor(v), 1, 100)) u.level = clamp(Math.floor(v), 1, 100);
  if (save.stats && typeof save.stats === 'object') {
    for (const k of ['str', 'def', 'spd', 'dex']) {
      if ((v = num(save.stats[k])) !== null) u.stats[k] = clamp(v, 0, 1000);
    }
  }
  if (save.counters && typeof save.counters === 'object') {
    u.counters = u.counters || {};
    for (const k of ['crimes', 'gym', 'work', 'travel', 'pvpWin', 'pvpLoss', 'rankWins', 'rankLosses']) {
      if ((v = num(save.counters[k])) !== null) u.counters[k] = Math.max(u.counters[k] || 0, Math.floor(v));
    }
  }
  saveDb();
  res.json({ success: true, updatedAt: u.cloudSaveUpdatedAt, player: publicUser(u) });
});

// --- PvP result recording (arena fights are played locally, turn by turn;
// the client reports the outcome so wins/losses count on the server too) ---
app.post('/api/pvp/result', auth, (req, res) => {
  const u = req.user;
  const { opponentId, won } = req.body || {};
  if (typeof won !== 'boolean') return res.status(400).json({ error: 'won must be true or false.' });
  const opp = opponentId ? db.users.find((x) => x.id === opponentId) : null;
  if (opponentId && (!opp || opp.id === u.id)) return res.status(404).json({ error: 'No such opponent.' });
  u.counters.pvpWin = (u.counters.pvpWin || 0) + (won ? 1 : 0);
  u.counters.pvpLoss = (u.counters.pvpLoss || 0) + (won ? 0 : 1);
  if (opp) {
    opp.counters = opp.counters || {};
    opp.counters.pvpWin = (opp.counters.pvpWin || 0) + (won ? 0 : 1);
    opp.counters.pvpLoss = (opp.counters.pvpLoss || 0) + (won ? 1 : 0);
  }
  saveDb();
  res.json({ success: true, player: publicUser(u) });
});

// --- Crimes ---
app.get('/api/crimes', auth, (req, res) => res.json({ crimes: CRIMES }));
app.post('/api/crimes/:id/do', auth, (req, res) => {
  const u = req.user;
  if (guard(u, res)) return;
  const crime = CRIMES.find((c) => c.id === req.params.id);
  if (!crime) return res.status(404).json({ error: 'Walang ganyang krimen.' });
  if (u.level < crime.level) return res.status(403).json({ error: `Kailangan level ${crime.level} para dito.` });
  if (u.bars.nerve < crime.nerve) return res.status(400).json({ error: 'Kulang ang Nerve mo. Magpahinga ka muna.' });
  u.bars.nerve -= crime.nerve;
  u.counters.crimes++;
  // Success chance: 55% base + DEX bonus, cap 90%
  const chance = Math.min(0.9, 0.55 + u.stats.dex * 0.008);
  if (Math.random() < crime.jailChance) {
    const mins = crime.jailMin;
    u.jailUntil = Date.now() + mins * 60 * 1000;
    saveDb();
    logEvent(u.username, `Nahuli si ${u.username} sa ${crime.name}! Kulong ng ${mins} minuto.`);
    return res.json({ success: false, outcome: 'jail', message: `Nahuli ka! Kulong ka ng ${mins} minuto.`, player: publicUser(u) });
  }
  if (Math.random() < chance) {
    const payout = rnd(crime.min, crime.max);
    u.money += payout;
    const leveled = addXp(u, crime.xp);
    saveDb();
    logEvent(u.username, `Nakakuha si ${u.username} ng ₱${payout} sa ${crime.name}.`);
    return res.json({ success: true, payout, xp: crime.xp, leveledUp: leveled, chance: Math.round(chance * 100), player: publicUser(u) });
  }
  u.bars.life = Math.max(1, u.bars.life - 10);
  addXp(u, Math.floor(crime.xp / 3));
  saveDb();
  res.json({ success: false, outcome: 'failed', message: 'Sablay! Nakakatakbo ka pa, pero nasaktan ka (-10 Life).', player: publicUser(u) });
});

// --- Gym ---
app.get('/api/gym', auth, (req, res) => res.json({
  stats: req.user.stats,
  trainable: ['str', 'def', 'spd', 'dex'],
  cost: { energy: 10 }, note: 'Bawat train: +1-3 sa stat, -10 Energy.',
}));
app.post('/api/gym/train', auth, (req, res) => {
  const u = req.user;
  if (guard(u, res)) return;
  const { stat } = req.body || {};
  if (!['str', 'def', 'spd', 'dex'].includes(stat)) return res.status(400).json({ error: 'Piliin: str, def, spd, o dex.' });
  if (u.bars.energy < 10) return res.status(400).json({ error: 'Kulang ang Energy mo.' });
  u.bars.energy -= 10;
  const gain = rnd(1, 3);
  u.stats[stat] += gain;
  u.counters.gym++;
  addXp(u, 5);
  saveDb();
  res.json({ success: true, stat, gain, stats: u.stats, player: publicUser(u) });
});

// --- Jobs ---
app.get('/api/jobs', auth, (req, res) => res.json({ jobs: JOBS, myJob: req.user.jobId }));
app.post('/api/jobs/apply', auth, (req, res) => {
  const u = req.user;
  const job = JOBS.find((j) => j.id === (req.body || {}).jobId);
  if (!job) return res.status(404).json({ error: 'Walang ganyang trabaho.' });
  if (u.level < job.level) return res.status(403).json({ error: `Kailangan level ${job.level}.` });
  u.jobId = job.id; saveDb();
  res.json({ success: true, job, player: publicUser(u) });
});
app.post('/api/jobs/work', auth, (req, res) => {
  const u = req.user;
  if (guard(u, res)) return;
  const job = JOBS.find((j) => j.id === u.jobId);
  if (!job) return res.status(400).json({ error: 'Wala ka pang trabaho. Mag-apply ka muna.' });
  if (u.bars.energy < job.energy) return res.status(400).json({ error: 'Kulang ang Energy mo para magtrabaho.' });
  u.bars.energy -= job.energy;
  const pay = job.pay + rnd(0, 100);
  u.money += pay; u.counters.work++;
  addXp(u, 8); saveDb();
  res.json({ success: true, pay, job: job.name, player: publicUser(u) });
});

// --- Education ---
app.get('/api/education', auth, (req, res) => res.json({ courses: COURSES, current: req.user.education }));
app.post('/api/education/enroll', auth, (req, res) => {
  const u = req.user;
  const course = COURSES.find((c) => c.id === (req.body || {}).courseId);
  if (!course) return res.status(404).json({ error: 'Walang ganyang kurso.' });
  if (u.education) return res.status(400).json({ error: 'May kurso ka pang tinatapos.' });
  if (u.money < course.cost) return res.status(400).json({ error: 'Kulang ang pera mo.' });
  u.money -= course.cost;
  u.education = { courseId: course.id, endsAt: Date.now() + course.minutes * 60 * 1000 };
  saveDb();
  res.json({ success: true, course, endsAt: u.education.endsAt, player: publicUser(u) });
});
app.post('/api/education/complete', auth, (req, res) => {
  const u = req.user;
  if (!u.education) return res.status(400).json({ error: 'Wala kang kurso.' });
  if (Date.now() < u.education.endsAt) return res.status(400).json({ error: 'Hindi pa tapos ang kurso mo.', endsAt: u.education.endsAt });
  const course = COURSES.find((c) => c.id === u.education.courseId);
  u.stats[course.reward.stat] += course.reward.amount;
  u.education = null; addXp(u, 50); saveDb();
  res.json({ success: true, course: course.name, reward: course.reward, player: publicUser(u) });
});

// --- Factions + Ranked War ---
app.get('/api/factions', auth, (req, res) => res.json({
  factions: db.factions.map((f) => ({ ...f, memberCount: f.members.length })),
  myFaction: req.user.factionId, wars: db.wars,
}));
app.post('/api/factions', auth, (req, res) => {
  const u = req.user;
  const { name } = req.body || {};
  if (!name || String(name).length < 3) return res.status(400).json({ error: 'Kailangan ng pangalan (min. 3 chars).' });
  if (u.factionId) return res.status(400).json({ error: 'May faction ka na. Umalis ka muna.' });
  if (u.money < 10000) return res.status(400).json({ error: 'Kailangan ₱10,000 para gumawa ng faction.' });
  u.money -= 10000;
  const f = { id: nextId('fac'), name: String(name).slice(0, 30), leaderId: u.id, members: [u.id], warScore: 0, createdAt: Date.now() };
  db.factions.push(f); u.factionId = f.id; saveDb();
  res.status(201).json({ success: true, faction: f, player: publicUser(u) });
});
app.post('/api/factions/:id/join', auth, (req, res) => {
  const u = req.user;
  const f = db.factions.find((x) => x.id === req.params.id);
  if (!f) return res.status(404).json({ error: 'Walang ganyang faction.' });
  if (u.factionId) return res.status(400).json({ error: 'May faction ka na.' });
  f.members.push(u.id); u.factionId = f.id; saveDb();
  res.json({ success: true, faction: f, player: publicUser(u) });
});
app.post('/api/factions/:id/leave', auth, (req, res) => {
  const u = req.user;
  const f = db.factions.find((x) => x.id === req.params.id);
  if (!f || u.factionId !== f.id) return res.status(400).json({ error: 'Wala ka sa faction na yan.' });
  f.members = f.members.filter((m) => m !== u.id);
  if (f.leaderId === u.id && f.members.length) f.leaderId = f.members[0];
  u.factionId = null; saveDb();
  res.json({ success: true, player: publicUser(u) });
});
app.post('/api/factions/:id/war', auth, (req, res) => {
  const u = req.user;
  const mine = db.factions.find((x) => x.id === u.factionId);
  const target = db.factions.find((x) => x.id === req.params.id);
  if (!mine || !target || mine.id === target.id) return res.status(400).json({ error: 'Kailangan ng dalawang magkaibang faction, at dapat nasa faction ka.' });
  if (mine.leaderId !== u.id) return res.status(403).json({ error: 'Leader lang ang pwedeng magdeklara ng giyera.' });
  const war = { id: nextId('war'), a: mine.id, b: target.id, scoreA: 0, scoreB: 0, endsAt: Date.now() + 24 * 60 * 60 * 1000, active: true };
  db.wars.push(war); saveDb();
  broadcast({ type: 'war', message: `Giyera! ${mine.name} vs ${target.name} — Ranked War, 24 oras!` });
  res.status(201).json({ success: true, war });
});
app.post('/api/factions/war/attack', auth, (req, res) => {
  const u = req.user;
  if (guard(u, res)) return;
  const war = db.wars.find((w) => w.active && Date.now() < w.endsAt && (w.a === u.factionId || w.b === u.factionId));
  if (!war) return res.status(400).json({ error: 'Walang aktibong giyera ang faction mo.' });
  if (u.bars.nerve < 10) return res.status(400).json({ error: 'Kulang ang Nerve mo.' });
  u.bars.nerve -= 10;
  const points = rnd(1, 5);
  if (war.a === u.factionId) war.scoreA += points; else war.scoreB += points;
  addXp(u, 20); saveDb();
  res.json({ success: true, points, war, player: publicUser(u) });
});

// --- Properties ---
app.get('/api/properties', auth, (req, res) => res.json({ properties: PROPERTIES, mine: req.user.propertyId }));
app.post('/api/properties/buy', auth, (req, res) => {
  const u = req.user;
  const p = PROPERTIES.find((x) => x.id === (req.body || {}).propertyId);
  if (!p) return res.status(404).json({ error: 'Walang ganyang ari-arian.' });
  if (u.money < p.price) return res.status(400).json({ error: 'Kulang ang pera mo.' });
  u.money -= p.price; u.propertyId = p.id; saveDb();
  res.json({ success: true, property: p, player: publicUser(u) });
});

// --- Travel ---
app.get('/api/travel/cities', auth, (req, res) => res.json({ cities: CITIES, current: req.user.city }));
app.post('/api/travel', auth, (req, res) => {
  const u = req.user;
  if (guard(u, res)) return;
  const city = CITIES.find((c) => c.id === (req.body || {}).cityId);
  if (!city) return res.status(404).json({ error: 'Walang ganyang lungsod.' });
  if (u.city === city.id) return res.status(400).json({ error: 'Nandito ka na.' });
  if (u.money < city.cost) return res.status(400).json({ error: 'Kulang ang pera mo pang-biyahe.' });
  u.money -= city.cost; u.city = city.id;
  u.counters.travel++;
  // Maliit na tsansa na may random event sa biyahe
  if (Math.random() < 0.2) { const found = rnd(50, 300); u.money += found; saveDb(); return res.json({ success: true, city, event: `May nakita kang ₱${found} sa daan!`, player: publicUser(u) }); }
  saveDb();
  res.json({ success: true, city, player: publicUser(u) });
});

// --- Bank ---
app.get('/api/bank', auth, (req, res) => res.json({ money: req.user.money, bank: req.user.bank, interest: '2% per day (added when you log in again tomorrow)' }));
app.post('/api/bank/deposit', auth, (req, res) => {
  const u = req.user; const amount = Math.floor(Number((req.body || {}).amount) || 0);
  if (amount <= 0 || amount > u.money) return res.status(400).json({ error: 'Hindi valid ang halaga.' });
  u.money -= amount; u.bank += amount; saveDb();
  res.json({ success: true, money: u.money, bank: u.bank });
});
app.post('/api/bank/withdraw', auth, (req, res) => {
  const u = req.user; const amount = Math.floor(Number((req.body || {}).amount) || 0);
  if (amount <= 0 || amount > u.bank) return res.status(400).json({ error: 'Hindi valid ang halaga.' });
  u.bank -= amount; u.money += amount; saveDb();
  res.json({ success: true, money: u.money, bank: u.bank });
});

// --- Stocks ---
app.get('/api/stocks', auth, (req, res) => res.json({ stocks: db.stocks, mine: req.user.stocks }));
app.post('/api/stocks/buy', auth, (req, res) => {
  const u = req.user; const { symbol, shares } = req.body || {};
  const s = db.stocks.find((x) => x.symbol === symbol);
  const n = Math.floor(Number(shares) || 0);
  if (!s || n <= 0) return res.status(400).json({ error: 'Hindi valid ang stock o shares.' });
  const cost = s.price * n;
  if (u.money < cost) return res.status(400).json({ error: 'Kulang ang pera mo.' });
  u.money -= cost; u.stocks[symbol] = (u.stocks[symbol] || 0) + n; saveDb();
  res.json({ success: true, symbol, shares: n, cost, player: publicUser(u) });
});
app.post('/api/stocks/sell', auth, (req, res) => {
  const u = req.user; const { symbol, shares } = req.body || {};
  const s = db.stocks.find((x) => x.symbol === symbol);
  const n = Math.floor(Number(shares) || 0);
  if (!s || n <= 0 || (u.stocks[symbol] || 0) < n) return res.status(400).json({ error: 'Wala kang sapat na shares.' });
  const gain = s.price * n;
  u.stocks[symbol] -= n; u.money += gain; saveDb();
  res.json({ success: true, symbol, shares: n, gain, player: publicUser(u) });
});

// --- Market / items ---
app.get('/api/market', auth, (req, res) => res.json({ items: ITEMS_SEED, inventory: req.user.inventory }));
app.post('/api/market/buy', auth, (req, res) => {
  const u = req.user; const { itemId, qty } = req.body || {};
  const item = ITEMS_SEED.find((x) => x.id === itemId);
  const n = Math.floor(Number(qty) || 1);
  if (!item || n <= 0) return res.status(400).json({ error: 'Walang ganyang item.' });
  if (u.money < item.price * n) return res.status(400).json({ error: 'Kulang ang pera mo.' });
  u.money -= item.price * n; u.inventory[itemId] = (u.inventory[itemId] || 0) + n; saveDb();
  res.json({ success: true, item, qty: n, inventory: u.inventory, player: publicUser(u) });
});
app.post('/api/market/sell', auth, (req, res) => {
  const u = req.user; const { itemId, qty } = req.body || {};
  const item = ITEMS_SEED.find((x) => x.id === itemId);
  const n = Math.floor(Number(qty) || 1);
  if (!item || n <= 0 || (u.inventory[itemId] || 0) < n) return res.status(400).json({ error: 'Wala kang sapat na item.' });
  const gain = Math.floor(item.price * 0.6) * n;
  u.inventory[itemId] -= n; u.money += gain; saveDb();
  res.json({ success: true, gain, inventory: u.inventory, player: publicUser(u) });
});
app.post('/api/items/use', auth, (req, res) => {
  const u = req.user; const { itemId } = req.body || {};
  const item = ITEMS_SEED.find((x) => x.id === itemId);
  if (!item || (u.inventory[itemId] || 0) < 1) return res.status(400).json({ error: 'Wala kang ganyang item.' });
  u.inventory[itemId] -= 1;
  if (item.effect.bar) u.bars[item.effect.bar] = Math.min(MAX[item.effect.bar], u.bars[item.effect.bar] + item.effect.amount);
  if (item.effect.stat) u.stats[item.effect.stat] += item.effect.amount;
  saveDb();
  res.json({ success: true, item: item.name, effect: item.effect, player: publicUser(u) });
});

// --- Casino ---
app.post('/api/casino/bet', auth, (req, res) => {
  const u = req.user;
  if (guard(u, res)) return;
  const { game, amount, choice } = req.body || {};
  const bet = Math.floor(Number(amount) || 0);
  if (!['coinflip', 'dice'].includes(game)) return res.status(400).json({ error: 'Piliin: coinflip o dice.' });
  if (bet <= 0 || bet > u.money) return res.status(400).json({ error: 'Hindi valid ang taya.' });
  if (bet > 10000) return res.status(400).json({ error: 'Max taya ₱10,000.' });
  let won = false; let detail = '';
  if (game === 'coinflip') {
    const flip = Math.random() < 0.5 ? 'heads' : 'tails';
    won = flip === choice; detail = `Lumabas: ${flip}.`;
  } else {
    const roll = rnd(1, 6);
    won = roll >= 4; detail = `Dice: ${roll} (panalo kapag 4-6).`;
  }
  u.money += won ? bet : -bet;
  addXp(u, 3); saveDb();
  res.json({ success: true, game, won, amount: won ? bet : -bet, detail, player: publicUser(u) });
});

// --- Racing ---
app.post('/api/racing/enter', auth, (req, res) => {
  const u = req.user;
  if (guard(u, res)) return;
  const bet = Math.floor(Number((req.body || {}).bet) || 0);
  if (bet < 0 || bet > u.money) return res.status(400).json({ error: 'Hindi valid ang taya.' });
  if (u.bars.energy < 10) return res.status(400).json({ error: 'Kulang ang Energy mo.' });
  u.bars.energy -= 10;
  // Bilis = SPD + konting swerte; kalaban ay 3 bot na may random speed
  const mySpeed = u.stats.spd + rnd(0, 20);
  const rivals = [rnd(5, 35), rnd(5, 35), rnd(5, 35)];
  const won = mySpeed > Math.max(...rivals);
  const prize = won ? bet * 2 + 500 : 0;
  u.money += won ? prize - bet : -bet;
  addXp(u, won ? 25 : 5); saveDb();
  res.json({ success: true, won, mySpeed, rivals, prize: won ? prize : 0, player: publicUser(u) });
});

// --- PvP: attack / mug / hospitalize ---
function pvpFight(attacker, target, intent) {
  // intent: 'attack' | 'mug' | 'hospitalize'
  const atk = attacker.stats.str + attacker.stats.spd + rnd(0, 15);
  const def = target.stats.def + target.stats.dex + rnd(0, 15);
  return { won: atk > def, atk, def };
}
app.post('/api/pvp/attack', auth, (req, res) => {
  const u = req.user;
  if (guard(u, res)) return;
  const { targetId, intent } = req.body || {};
  const target = db.users.find((x) => x.id === targetId);
  if (!target || target.id === u.id) return res.status(404).json({ error: 'No such opponent.' });
  if (u.bars.nerve < 15) return res.status(400).json({ error: 'Not enough Nerve (need 15).' });
  const st = statusOf(target);
  if (st.hospitalized) return res.status(400).json({ error: 'Your target is already in the hospital.' });
  u.bars.nerve -= 15;
  const mode = ['attack', 'mug', 'hospitalize'].includes(intent) ? intent : 'attack';
  const { won, atk, def } = pvpFight(u, target, mode);
  let loot = 0;
  if (won) {
    loot = mode === 'mug' ? Math.min(target.money, rnd(200, 1000)) : rnd(100, 500);
    target.money = Math.max(0, target.money - loot);
    u.money += loot; u.counters.pvpWin++;
    if (mode === 'hospitalize') target.hospitalUntil = Date.now() + 30 * 60 * 1000;
    addXp(u, 40);
    // Bounty claim: may bounty ba ang target?
    const bounty = db.bounties.find((b) => b.targetId === target.id && !b.claimed);
    if (bounty) { bounty.claimed = true; bounty.claimedBy = u.id; u.money += bounty.amount; loot += bounty.amount; }
    logEvent(u.username, `${u.username} defeated ${target.username} in a fight${mode === 'mug' ? ' and robbed $' + loot : ''}!`);
  } else {
    u.bars.life = Math.max(1, u.bars.life - 20);
    if (u.bars.life <= 10) u.hospitalUntil = Date.now() + 15 * 60 * 1000;
    addXp(u, 5);
  }
  saveDb();
  res.json({ success: true, won, intent: mode, atk, def, loot, player: publicUser(u), target: publicUser(target) });
});

// --- Bounties ---
app.get('/api/bounties', auth, (req, res) => res.json({ bounties: db.bounties.filter((b) => !b.claimed) }));
app.post('/api/bounties', auth, (req, res) => {
  const u = req.user;
  const { targetId, amount } = req.body || {};
  const target = db.users.find((x) => x.id === targetId);
  const amt = Math.floor(Number(amount) || 0);
  if (!target || target.id === u.id) return res.status(404).json({ error: 'No such target.' });
  if (amt < 1000 || amt > u.money) return res.status(400).json({ error: 'Min. bounty $1,000, and it must be within your money.' });
  u.money -= amt;
  const b = { id: nextId('bnt'), targetId, placedBy: u.id, amount: amt, claimed: false, createdAt: Date.now() };
  db.bounties.push(b); saveDb();
  res.status(201).json({ success: true, bounty: b, player: publicUser(u) });
});

// --- Chat (real players lang — walang bot) ---
app.get('/api/chat', auth, (req, res) => {
  const channel = req.query.channel || 'global';
  const botNames = new Set(db.users.filter((u) => u.isBot).map((u) => u.username));
  res.json({ chat: db.chat.filter((c) => c.channel === channel && !botNames.has(c.username)).slice(-50) });
});
app.post('/api/chat', auth, (req, res) => {
  const u = req.user;
  const { channel, message } = req.body || {};
  if (!message || String(message).trim().length === 0) return res.status(400).json({ error: 'Walang laman ang message.' });
  const msg = { id: nextId('chat'), channel: channel === 'faction' ? 'faction' : 'global', username: u.username, message: String(message).slice(0, 500), at: Date.now() };
  db.chat.push(msg); saveDb();
  broadcast({ type: 'chat', ...msg });
  res.status(201).json({ success: true, message: msg });
});

// --- Trade (real players lang — walang bot; item galing sa inventory ng seller) ---
app.get('/api/trade', auth, (req, res) => {
  const open = db.trades.filter((t) => t.status === 'open').map((t) => {
    const s = db.users.find((u) => u.id === t.sellerId);
    return { ...t, sellerName: s ? s.username : '?', sellerLevel: s ? s.level : 0 };
  });
  res.json({ trades: open });
});
app.post('/api/trade', auth, (req, res) => {
  const u = req.user;
  const { itemId, itemName, price } = req.body || {};
  const p = Number(price);
  if (!itemId || !p || p <= 0) return res.status(400).json({ error: 'Kulang ang detalye ng trade.' });
  if (!u.inventory || !u.inventory[itemId] || u.inventory[itemId] < 1) return res.status(400).json({ error: 'Wala ka nyan sa inventory mo.' });
  u.inventory[itemId] -= 1;
  if (u.inventory[itemId] <= 0) delete u.inventory[itemId];
  const t = { id: nextId('trd'), sellerId: u.id, itemId, itemName: String(itemName || itemId).slice(0, 80), price: p, status: 'open', createdAt: Date.now() };
  db.trades.push(t); saveDb();
  res.status(201).json({ success: true, trade: t, player: publicUser(u) });
});
app.post('/api/trade/:id/accept', auth, (req, res) => {
  const u = req.user;
  const t = db.trades.find((x) => x.id === req.params.id);
  if (!t || t.status !== 'open') return res.status(404).json({ error: 'Wala na yung trade na yan.' });
  if (t.sellerId === u.id) return res.status(400).json({ error: 'Sarili mong trade yan.' });
  if (u.money < t.price) return res.status(400).json({ error: 'Kulang ang pera mo.' });
  const seller = db.users.find((x) => x.id === t.sellerId);
  if (!seller) return res.status(404).json({ error: 'Wala na yung seller.' });
  u.money -= t.price; seller.money += t.price;
  u.inventory = u.inventory || {}; u.inventory[t.itemId] = (u.inventory[t.itemId] || 0) + 1;
  t.status = 'sold'; t.buyerId = u.id; saveDb();
  res.json({ success: true, message: `Nabili mo ang ${t.itemName} sa halagang ₱${t.price}.`, player: publicUser(u) });
});
app.post('/api/trade/:id/cancel', auth, (req, res) => {
  const u = req.user;
  const t = db.trades.find((x) => x.id === req.params.id);
  if (!t || t.status !== 'open') return res.status(404).json({ error: 'Wala na yung trade na yan.' });
  if (t.sellerId !== u.id) return res.status(403).json({ error: 'Hindi sa iyo yan.' });
  u.inventory = u.inventory || {}; u.inventory[t.itemId] = (u.inventory[t.itemId] || 0) + 1;
  t.status = 'cancelled'; saveDb();
  res.json({ success: true, message: 'Kinansela ang trade, bumalik ang item sa iyo.', player: publicUser(u) });
});

// --- Jail / hospital ---
app.get('/api/jail', auth, (req, res) => res.json({ status: statusOf(req.user) }));
app.post('/api/jail/bail', auth, (req, res) => {
  const u = req.user;
  if (u.jailUntil <= Date.now()) return res.status(400).json({ error: 'Hindi ka nakakulong.' });
  const cost = 2000;
  if (u.money < cost) return res.status(400).json({ error: `Kailangan ₱${cost} na piyansa.` });
  u.money -= cost; u.jailUntil = 0; saveDb();
  res.json({ success: true, message: 'Nakapiansa ka na. Malaya ka na!', player: publicUser(u) });
});
app.post('/api/hospital/heal', auth, (req, res) => {
  const u = req.user;
  if (u.hospitalUntil <= Date.now()) { u.bars.life = 100; saveDb(); return res.json({ success: true, player: publicUser(u) }); }
  const cost = 1500;
  if (u.money < cost) return res.status(400).json({ error: `Kailangan ₱${cost} para magpagamot agad.` });
  u.money -= cost; u.hospitalUntil = 0; u.bars.life = 100; saveDb();
  res.json({ success: true, message: 'Magaling ka na!', player: publicUser(u) });
});

// --- Missions ---
app.get('/api/missions', auth, (req, res) => res.json({ missions: MISSIONS, progress: req.user.missions, counters: req.user.counters }));
app.post('/api/missions/:id/accept', auth, (req, res) => {
  const u = req.user;
  const m = MISSIONS.find((x) => x.id === req.params.id);
  if (!m) return res.status(404).json({ error: 'Walang ganyang mission.' });
  u.missions[m.id] = { accepted: true, claimed: false };
  saveDb();
  res.json({ success: true, mission: m });
});
app.post('/api/missions/:id/claim', auth, (req, res) => {
  const u = req.user;
  const m = MISSIONS.find((x) => x.id === req.params.id);
  if (!m || !u.missions[m.id]?.accepted) return res.status(400).json({ error: 'Hindi mo pa tinanggap ang mission na yan.' });
  if (u.missions[m.id].claimed) return res.status(400).json({ error: 'Na-claim mo na yan.' });
  if ((u.counters[m.type] || 0) < m.target) return res.status(400).json({ error: `Kulang pa: ${u.counters[m.type] || 0}/${m.target}.` });
  u.missions[m.id].claimed = true;
  u.money += m.reward; addXp(u, m.xp); saveDb();
  res.json({ success: true, reward: m.reward, xp: m.xp, player: publicUser(u) });
});

// --- 404 / error ---
app.use((req, res) => res.status(404).json({ error: 'No such endpoint.', hint: 'GET /api/updates or see README.md.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error.' }); });

// ---------------------------------------------------------------------------
// Stocks tick: kada 5 minuto, gumagalaw ang presyo ng konti (para buhay ang market)
// ---------------------------------------------------------------------------
setInterval(() => {
  db.stocks.forEach((s) => { s.price = Math.max(1, Math.round(s.price * (1 + (Math.random() - 0.5) * 0.1))); });
  saveDb();
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// WebSocket: live chat + live feed + online count
// ws://host/ws?token=<token>
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const userId = verifyToken(url.searchParams.get('token') || '');
  const user = userId ? db.users.find((u) => u.id === userId) : null;
  ws.username = user ? user.username : 'Guest';
  ws.send(JSON.stringify({ type: 'welcome', username: ws.username, online: wss.clients.size }));
  broadcast({ type: 'online', online: wss.clients.size });
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());
      if (data.type === 'chat' && data.message && user) {
        const msg = { id: nextId('chat'), channel: 'global', username: user.username, message: String(data.message).slice(0, 500), at: Date.now() };
        db.chat.push(msg); saveDb();
        broadcast({ type: 'chat', ...msg });
      }
    } catch { /* ignore bad WS messages */ }
  });
  ws.on('close', () => broadcast({ type: 'online', online: wss.clients.size }));
});

initDb().then(() => {
  migrateVexonNames();
  server.listen(PORT, () => {
    console.log(`VEXON server running on http://localhost:${PORT}`);
    console.log(`Players (seeded bots + real): ${db.users.length} | Factions: ${db.factions.length}`);
    console.log('WS: ws://localhost:' + PORT + '/ws?token=...');
  });
}).catch((e) => { console.error('Server failed to start:', e); process.exit(1); });
