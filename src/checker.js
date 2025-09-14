const RSSParser = require("rss-parser");
const parser = new RSSParser();
const fs = require("fs");


const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "300000", 10); // 5 minutes default
const channels = JSON.parse(fs.readFileSync("./Json/channels.json", "utf-8"));

async function checkOnce(client) {
    for (const { channelId, webhook } of channels) {
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        // ! https://www.tunepocket.com/youtube-channel-id-finder/#channle-id-finder-form to get channel ID


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