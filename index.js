require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");

const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// 每日簽到紀錄，key 格式：groupId_userId，value：YYYY-MM-DD（判斷今天是否已簽到）
const checkinData = {};

// 每日簽到人數，key 格式：groupId_YYYY-MM-DD，value：簽到人數
const checkinCount = {};

// 連續簽到紀錄，key 格式：groupId_userId，value：{ lastDate, streak }
const streakData = {};

app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.json({ status: "ok" });
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  // 只在群組觸發
  if (event.source.type !== "group") {
    return null;
  }

  const text = event.message.text;

  if (text === "簽到") {
    const groupId = event.source.groupId;
    const userId = event.source.userId;
    const key = `${groupId}_${userId}`;
    const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

    if (checkinData[key] === today) {
      return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: "text", text: "❌ 今天已經簽過了啦" }],
      });
    }

    checkinData[key] = today;

    const countKey = `${groupId}_${today}`;
    checkinCount[countKey] = (checkinCount[countKey] || 0) + 1;
    const rank = checkinCount[countKey];

    // 計算連續簽到 streak
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString("sv-SE");

    const prev = streakData[key];
    let streak;
    if (prev && prev.lastDate === yesterdayStr) {
      streak = prev.streak + 1;
    } else {
      streak = 1;
    }
    streakData[key] = { lastDate: today, streak };

    const now = new Date();
    const hhmm = now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

    const rankTitles = {
      1: ["🏆 今日第一名！！", "🧘 仙人模式"],
      2: ["🏆 今日第 2 名",   "⚡ 忍住大師"],
      3: ["🏆 今日第 3 名",   "🤡 我是小廢物"],
      4: ["🏆 今日第 4 名",   "🫣 褲子脫一半"],
      5: ["🏆 今日第 5 名",   "💀 狗柏豪都比你強"],
    };
    const [rankLine, titleLine] = rankTitles[rank] ?? [`🏆 今日第 ${rank} 名`, "🐟 後段班選手"];

    const replyText = `今天我沒尻喔 😏\n🕒 ${hhmm}\n\n${rankLine}\n${titleLine}\n\n🔥 連續 ${streak} 天沒尻`;

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: replyText }],
    });
  }

  return null;
}

app.listen(3000, () => {
  console.log("Server running on port 3000");
});