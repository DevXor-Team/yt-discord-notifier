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