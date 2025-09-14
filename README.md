# yt-discord-notifier

A tiny Node.js service that watches YouTube channels via RSS and posts new uploads / live events to Discord via webhooks.

* Detects **new videos**, **live** and **upcoming** livestreams
* Posts to **Discord Webhooks** (mentions everyone by default — configurable)
* Simple **key–value store** persisted to disk (no DB needed)
* Lightweight (polls every 5 minutes by default)

---

## Project Tree

```
yt-discord-notifier/
├─ src/
│  ├─ checker.js
│  ├─ index.js
│  └─ kv.js
├─ Json/
│  └─ channels.json
├─ .env.example
├─ package.json
├─ README.md  ← (this file)
└─ LICENSE
```

---

## Quick Start

### 1) Clone & Install

```bash
git clone https://github.com/DevXor-Team/yt-discord-notifier.git
cd yt-discord-notifier
npm install
```

### 2) Configure Channels

Edit `Json/channels.json` and add your YouTube channel IDs with matching Discord webhook URLs.

> Tip: Find a channel’s ID from its URL (e.g. `https://www.youtube.com/channel/UCxxxx`), or use any online Channel ID finder.

```jsonc
[
  { "channelId": "UC_x5XG1OV2P6uZZ5FSM9Ttw", "webhook": "https://discord.com/api/webhooks/111..." },
  { "channelId": "UCVHFbqXqoYvEWM1Ddxl0QDg", "webhook": "https://discord.com/api/webhooks/222..." }
]
```

### 3) (Optional) Environment Variables

Copy `.env.example` to `.env` and tweak:

```bash
cp .env.example .env
```

* `POLL_INTERVAL_MS` — how often to poll (default 5 minutes)
* `DISCORD_PING` — text to prepend in messages (default `@everyone`, set to empty to disable)

### 4) Run

```bash
npm start
```

The service creates a `.data/store.json` to remember the last posted video per channel.

---

## How It Works

* Fetches `https://www.youtube.com/feeds/videos.xml?channel_id=...` using **rss-parser**
* Looks at the latest item only (position `0`)
* Determines `yt:liveBroadcastContent` → `live | upcoming | none`
* Compares the `videoId` with last saved value in the KV store
* If different → posts to Discord webhook and updates state

---

## Files

### `src/checker.js`

```js
const RSSParser = require("rss-parser");
const parser = new RSSParser();
const fs = require("fs");

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "300000", 10); // 5 minutes default
const channels = JSON.parse(fs.readFileSync("./Json/channels.json", "utf-8"));

async function checkOnce(client) {
  for (const { channelId, webhook } of channels) {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

    try {
      const feed = await parser.parseURL(feedUrl);
      if (!feed.items || feed.items.length === 0) continue;

      const latest = feed.items[0];
      const videoId = (latest.id || '').split(":").pop();
      const lastVideoId = (await client.cd.get(`lastVideoId_${channelId}`)) || { videoId: null };
      const liveStatus = latest["yt:liveBroadcastContent"] || "none";

      if (lastVideoId.videoId !== videoId) {
        const videoUrl = `https://youtu.be/${videoId}`;
        const ping = process.env.DISCORD_PING ?? "@everyone";

        let messageText;
        if (liveStatus === "live") {
          messageText = `*|| ${ping} || A livestream just started!* ${videoUrl}`;
        } else if (liveStatus === "upcoming") {
          messageText = `*|| ${ping} || Upcoming livestream scheduled!* ${videoUrl}`;
        } else {
          messageText = `*|| ${ping} || A new video is live!* ${videoUrl}`;
        }

        const content = { content: messageText, username: "YouTube Notifier" };

        await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(content),
        });

        await client.cd.set(`lastVideoId_${channelId}`, { videoId });
        console.log(`[${channelId}] Posted new video: ${latest.title} (${liveStatus})`);
      } else {
        console.log(`[${channelId}] No new video. Last was ${lastVideoId.videoId}`);
      }
    } catch (err) {
      console.error(`Error checking channel ${channelId}:`, err.message);
    }
  }
}

module.exports = { checkOnce, POLL_INTERVAL_MS };
```

### `src/kv.js`

```js
const fs = require("fs");
const path = require("path");

class KV {
  constructor(filePath = ".data/store.json") {
    this.filePath = filePath;
    this.dir = path.dirname(this.filePath);
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, "{}", "utf-8");
    this._load();
  }

  _load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
    } catch {
      this.data = {};
    }
  }

  async get(key) {
    this._load();
    return this.data[key];
  }

  async set(key, value) {
    this.data[key] = value;
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }
}

module.exports = { KV };
```

### `src/index.js`

```js
require("dotenv").config();
const { KV } = require("./kv");
const { checkOnce, POLL_INTERVAL_MS } = require("./checker");

// Minimal client shim to match the original API
const client = { cd: new KV() };

(async () => {
  console.log(`yt-discord-notifier starting. Poll interval: ${POLL_INTERVAL_MS} ms`);
  await checkOnce(client); // run immediately
  setInterval(() => checkOnce(client), POLL_INTERVAL_MS);
})();
```

### `Json/channels.json`

```json
[
  { "channelId": "", "webhook": "" }
]
```

### `.env.example`

```dotenv
# Polling every 5 minutes by default
POLL_INTERVAL_MS=300000

# What to prepend in Discord messages (set empty to disable)
DISCORD_PING=@everyone
```

### `package.json`

```json
{
  "name": "yt-discord-notifier",
  "version": "1.0.0",
  "description": "Watch YouTube channels via RSS and post new uploads/live events to Discord webhooks.",
  "main": "src/index.js",
  "type": "commonjs",
  "scripts": {
    "start": "node src/index.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "rss-parser": "^3.13.0"
  }
}
```

### `LICENSE`

```text
MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Deploy Notes

* **Node 18+** required (for global `fetch`).
* To run as a service, consider **PM2**:

  ```bash
  npm i -g pm2
  pm2 start src/index.js --name yt-discord-notifier
  pm2 save && pm2 startup
  ```
* Make sure your Discord Webhooks are valid and not rate-limited.

---

## Customization

* Change the `messageText` formatting in `src/checker.js` to localize or adjust mentions.
* Add thumbnails or embeds by expanding the webhook payload (Discord embeds object).

---

## Troubleshooting

* **No posts?**

  * Check `channels.json` is valid JSON
  * Ensure the channel **has at least one video**
  * Confirm the webhook URL is correct
* **Duplicate posts?**

  * The KV store tracks only the latest video per channel; if you wipe `.data/store.json`, the next run will repost the latest item
* **Live detection**

  * Uses `yt:liveBroadcastContent` from RSS (`live | upcoming | none`)

---

## Credits

Based on a simple polling approach using [rss-parser](https://www.npmjs.com/package/rss-parser) and Discord webhooks.