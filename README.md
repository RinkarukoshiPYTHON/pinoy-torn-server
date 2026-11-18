# Pinoy Torn — Multiplayer Server (server-ready)

Text-based crime MMORPG na Pinoy version, hango sa sistema ng Torn — pero
sariling code, sariling content, at sariling pangalan. **Preparation lang ito:
hindi ito naka-deploy, hindi ito live, at wala pang totoong server na binili.**
Kapag bumili na si mavs ng server, ito ang folder na i-upload doon.

## Ano ang laman

| File | Para saan |
|---|---|
| `server.js` | Buong backend: Express REST API + WebSocket (`ws`). 759 lines. |
| `package.json` | Dalawang dependency lang: `express` at `ws`. Walang mabigat na library. |
| `data.json` | Ang buong mundo: players, factions, bounties, chat, stocks. JSON file lang — walang external database. Auto-seed ng 12 bot players kapag wala pa ang file. |
| `.env.example` | Kopyahin bilang `.env` sa server. May `PORT`, `JWT_SECRET`, `DATA_FILE`, `API_URL`. |
| `client-config.example.js` | Ang **isang setting** na babaguhin sa web game client: `API_URL`. |
| `package-lock.json` | Para pare-pareho ang versions sa `npm install`. |

## Ano ang kaya ng server (Torn-like loop, kuhang-kuha ang sistema)

- **Auth:** register/login, password = scrypt hash, token = HMAC-signed (7 araw). Lahat ng `/api/*` maliban sa auth at updates ay kailangan ng `Authorization: Bearer <token>`.
- **Bars:** Energy / Nerve / Happy / Life, may timed regen (Energy 1 kada 5 min, Nerve 1 kada 3 min, Happy 1 kada 10 min, Life 1 kada 5 min). Bumabalik ang bars kahit offline ka, base sa oras.
- **8 Krimen:** Mandukot sa Jeep hanggang Holdap sa Bangko sa Binondo — may nerve cost, payout range, XP, level requirement, at tsansa ng kulong o sablay.
- **Gym:** train STR / DEF / SPD / DEX, -10 Energy, +1–3 stat.
- **Laban (PvP):** attack / mug / hospitalize laban sa ibang players (totoo o bot). Nakabatay sa stats + swerte. Ang talo, pwedeng ma-ospital; ang nanalo, may loot at XP. Kapag may bounty ang target, makukuha mo ang bounty.
- **Trabaho:** 8 jobs, mula Tindero hanggang CEO, may level requirement at pay per shift.
- **Edukasyon:** 6 na kurso, may bayad at oras ng pagtatapos; kapag natapos, +stat.
- **Barangay Faction + Ranked War:** gumawa/sumali/umalis, magdeklara ng giyera (leader lang), mag-ambag ng war points.
- **Properties:** kubo hanggang mansyon sa Forbes Park.
- **Biyahe:** 7 lungsod (Maynila, Quezon City, Baguio, Cebu, Iloilo, Davao, Batangas), may pamasahe at random event.
- **Bangko:** deposit/withdraw.
- **Stocks:** 5 stocks, bili/benta, gumagalaw ang presyo kada 5 minuto.
- **Palengke / Items:** bili/benta/gamit ng items (pandesal, energy drink, balisong, motor…).
- **Casino:** coinflip at dice, max taya ₱10,000.
- **Karera:** race laban sa 3 bot, base sa SPD + swerte.
- **Bounties:** maglagay ng bounty (min. ₱1,000), ma-claim kapag natalo ang target sa PvP.
- **Chat:** global chat (REST + WebSocket live), at activity feed.
- **Kulungan / Ospital:** timers na humaharang sa aksyon; may piyansa (₱2,000) at magpagamot (₱1,500).
- **Missions:** 5 missions na may progress counters at rewards.
- **Updates:** `GET /api/updates` — changelog mula 2004 hanggang v26.11 Ranked Barangay War.
- **WebSocket (`/ws?token=...`):** live chat, live feed, online count. Ito ang magpaparamdam na buhay ang mundo kahit walang totoong players pa — may 12 bot players na naka-seed (MangBerto, JojoBatangas, KapitanDing, Bossing, atbp.), 2 faction, at 1 bounty.

## Buong listahan ng endpoints

```
GET  /                        health + info
GET  /api/health              ok / oras / bilang ng players
GET  /api/updates             changelog (2004 → v26.11)
POST /api/auth/register       { username, password }            -> token + player
POST /api/auth/login          { username, password }            -> token + player
GET  /api/me                  profile + jail/hospital status
GET  /api/players             lahat ng players (leaderboard order)
GET  /api/players/:id         isang player
GET  /api/leaderboard         top 20 by XP
GET  /api/crimes              listahan ng 8 krimen
POST /api/crimes/:id/do      gawin ang krimen
GET  /api/gym                 stats + trainable
POST /api/gym/train           { stat: str|def|spd|dex }
GET  /api/jobs                8 trabaho
POST /api/jobs/apply          { jobId }
POST /api/jobs/work           mag-shift (may sweldo)
GET  /api/education           6 kurso
POST /api/education/enroll    { courseId }
POST /api/education/complete  tapusin kapag oras na
GET  /api/factions            factions + aktibong giyera
POST /api/factions            { name } — gumawa (₱10,000)
POST /api/factions/:id/join
POST /api/factions/:id/leave
POST /api/factions/:id/war    magdeklara ng giyera (leader lang)
POST /api/factions/war/attack mag-ambag ng war points
GET  /api/properties
POST /api/properties/buy      { propertyId }
GET  /api/travel/cities
POST /api/travel              { cityId }
GET  /api/bank
POST /api/bank/deposit        { amount }
POST /api/bank/withdraw       { amount }
GET  /api/stocks
POST /api/stocks/buy          { symbol, shares }
POST /api/stocks/sell        { symbol, shares }
GET  /api/market
POST /api/market/buy          { itemId, qty }
POST /api/market/sell        { itemId, qty }
POST /api/items/use           { itemId }
POST /api/casino/bet          { game: coinflip|dice, amount, choice }
POST /api/racing/enter        { bet }
POST /api/pvp/attack          { targetId, intent: attack|mug|hospitalize }
GET  /api/bounties
POST /api/bounties            { targetId, amount }
GET  /api/chat?channel=global
POST /api/chat                { channel, message }
GET  /api/jail                jail/hospital status
POST /api/jail/bail           piyansa ₱2,000
POST /api/hospital/heal       magpagamot ₱1,500
GET  /api/missions
POST /api/missions/:id/accept
POST /api/missions/:id/claim
WS   /ws?token=...            live chat / feed / online count
```

## Local test (ginawa na — tingnan ang "Na-verify" sa ibaba)

```bash
cd pinoy-torn-server
npm install
npm start
# -> Pinoy Torn server running on http://localhost:3000
```

Halimbawa:

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"Juan","password":"secret123"}'
# -> { "token": "...", "player": { ... } }

curl -X POST http://localhost:3000/api/crimes/mandukot-jeep/do \
  -H "Authorization: Bearer <token>"
```

## Paano i-deploy kapag bumili ka na ng server (VPS)

> Hindi pa ito ginagawa. Kapag may server ka na, ito ang steps — walang ibang
> kailangang bilhin maliban sa VPS mismo at (optional) domain.

1. **Bumili ng VPS** — kahit pinakamura, hal. 1 GB RAM, Ubuntu 22.04/24.04.
   (Halimbawa: DigitalOcean, Hetzner, Vultr, o kahit anong mura.)
2. **Kumonekta sa VPS** (SSH) at mag-install ng Node 20+:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   node --version   # dapat v20 o mas mataas
   ```
3. **I-upload ang folder na ito** sa VPS (hal. gamit ang `scp`, SFTP, o `git clone`
   kung ilalagay mo ito sa GitHub):
   ```bash
   scp -r pinoy-torn-server root@IP-NG-VPS:/root/
   ```
4. **Mag-setup sa VPS:**
   ```bash
   cd /root/pinoy-torn-server
   cp .env.example .env
   nano .env        # palitan ang JWT_SECRET ng mahaba at random na secret
   npm install
   ```
5. **Patakbuhin nang tuloy-tuloy** (hindi mamamatay kapag nagsara ang SSH):
   ```bash
   npm install -g pm2
   pm2 start server.js --name pinoy-torn
   pm2 save
   pm2 startup      # sundin ang lalabas na command para mag-auto-start sa reboot
   ```
6. **Buksan ang port sa firewall:**
   ```bash
   sudo ufw allow 3000/tcp
   # o sa control panel ng VPS provider mo, buksan ang port 3000
   ```
7. **Ituro ang web game client sa server:**
   Sa Pinoy Torn client, isang setting lang ang babaguhin — `API_URL`
   (tingnan ang `client-config.example.js`):
   ```js
   const API_URL = 'http://IP-NG-VPS:3000';
   ```
   Lahat ng tawag ng client ay `${API_URL}/api/...`, kaya ito lang ang kailangan.

## Ano pa ang kailangang ayusin bago mag-live sa totoong players

- **Domain + HTTPS:** bumili ng domain (hal. `pinoytorn.ph`), ituro ang DNS sa VPS
  IP, at maglagay ng Nginx + Let's Encrypt (libre) sa harap ng port 3000.
  Hangga't `http://IP:3000` lang, gumagana ito, pero hindi ito ligtas o
  propesyonal — at hihingian ng HTTPS ang ibang browser features.
- **JWT_SECRET:** palitan ng mahaba at random sa `.env` bago mag-live.
  Huwag i-commit ang totoong `.env` (nasa `.gitignore` na).
- **Backups:** ang buong mundo ay `data.json` lang. Mag-schedule ng kopya araw-araw:
  `cp data.json backup/data-$(date +%F).json` (o `cron` job). Kapag nawala ang
  file na ito, nawala ang lahat ng players.
- **Rate limiting / abuse:** wala pang limit sa login attempts o chat spam.
  Para sa maliit na simula ayos lang ito, pero kapag dumami ang players,
  kailangan ng limit (hal. `express-rate-limit`) at ng paglilinis ng chat.
- **Scale:** ang JSON file ay ayos para sa daan-daang players. Kapag libo-libo
  na, kailangan nang lumipat sa totoong database (SQLite/Postgres) — pero
  hindi ito kailangan sa simula, at ang API ay hindi na kailangang baguhin
  sa client side.
- **Hindi ito ang web game mismo:** server lang ito. Ang Pinoy Torn web
  artifact (ang laro sa browser) ay kailangan pang ikonekta sa `API_URL`
  na ito — isang hiwalay na trabaho iyon.

## Na-verify (local test, 2026-11-18)

- `npm install` — ok, 69 packages.
- `node --check server.js` — syntax ok.
- Server umandar sa port 3000; `GET /api/health` → `{"ok":true,"players":12}`.
- Register ng test user → may token.
- Crime: unang test user nahuli (kulong 5 min — gumagana ang jail guard,
  kaya blocked ang gym na may 423). Pangalawang batch: crime success,
  payout **₱137**; gym train **STR 10 → 11**; job work **₱372**;
  `GET /api/me` — pera ₱1,000 → **₱1,509**, XP 23, counters crimes 1 / gym 1 / work 1.
  Lahat ng pagbabago ay nakasulat sa `data.json`.
- Lahat ng GET endpoints (crimes, jobs, education, factions, properties,
  travel, bank, stocks, market, bounties, missions, leaderboard, players) → HTTP 200.
- WebSocket: connect gamit ang token → `welcome`, at ang chat message ay
  na-broadcast pabalik (echo) — live chat gumagana.
- Pagkatapos ng test, ang `data.json` ay ni-reset sa malinis na seed
  (12 bots, 2 factions, 1 bounty, 5 stocks). Walang test users na naiwan.

**Hindi pa na-verify / hindi pa ginagawa:**
- Walang deploy, walang VPS, walang domain, walang HTTPS — local test lang.
- Ang web game client ay hindi pa nakakonekta sa API na ito (kailangan pang
  gawin ang `API_URL` wiring sa artifact).
- Hindi pa nasubukan sa totoong maraming sabay-sabay na players (load test).
- Ang stock-price tick (kada 5 min) at ang education completion ay logic lang
  sa code; hindi pa sila na-obserbahan sa loob ng mahabang takbo.
