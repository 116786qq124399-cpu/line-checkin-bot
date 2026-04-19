require("dotenv").config();
const express = require("express");
const line = require("@line/bot-sdk");

// ── 環境變數驗證 ─────────────────────────────────────────────────────────────
if (!process.env.CHANNEL_ACCESS_TOKEN || !process.env.CHANNEL_SECRET) {
  console.error("[ERROR] 缺少 CHANNEL_ACCESS_TOKEN 或 CHANNEL_SECRET，請檢查 .env");
  process.exit(1);
}

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

// ── LINE client 初始化 ────────────────────────────────────────────────────────
const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken,
});

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();

// !! 不可在 /webhook 前使用 express.json()，會破壞簽名驗證 !!

// ── 資料儲存（in-memory） ─────────────────────────────────────────────────────
// key: groupId_userId → YYYY-MM-DD（判斷今天是否已簽到）
const checkinData = {};
// key: groupId_YYYY-MM-DD → 簽到人數
const checkinCount = {};
// key: groupId_userId → { lastDate, streak }
const streakData = {};

// ── Webhook 路由 ──────────────────────────────────────────────────────────────
app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.json({ status: "ok" });
  } catch (err) {
    console.error("[handleEvent error]", err);
    res.status(500).end();
  }
});

// ── LINE middleware 錯誤處理器（4 個參數才會被當作 error handler）────────────
app.use((err, req, res, next) => {
  if (err.name === "SignatureValidationFailed") {
    console.error("[簽名驗證失敗] 請確認 CHANNEL_SECRET 是否正確", err.message);
    return res.status(400).send("Invalid signature");
  }
  if (err.name === "JSONParseError") {
    console.error("[JSON 解析錯誤]", err.message);
    return res.status(400).send("Invalid JSON");
  }
  console.error("[未知錯誤]", err);
  res.status(500).end();
});

// ── 事件處理 ──────────────────────────────────────────────────────────────────
async function handleEvent(event) {
  // 只處理文字訊息
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  // 只在群組觸發
  if (event.source.type !== "group") {
    return null;
  }

  const text = event.message.text.trim();

  if (text === "簽到") {
    return handleCheckin(event);
  }

  return null;
}

async function handleCheckin(event) {
  const groupId = event.source.groupId;
  const userId = event.source.userId;
  const key = `${groupId}_${userId}`;
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

  // 今天已簽到
  if (checkinData[key] === today) {
    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: "text", text: "❌ 今天已經簽過了啦" }],
    });
  }

  // 記錄簽到
  checkinData[key] = today;

  // 今日名次
  const countKey = `${groupId}_${today}`;
  checkinCount[countKey] = (checkinCount[countKey] || 0) + 1;
  const rank = checkinCount[countKey];

  // 連續簽到 streak
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toLocaleDateString("sv-SE");

  const prev = streakData[key];
  const streak = prev && prev.lastDate === yesterdayStr ? prev.streak + 1 : 1;
  streakData[key] = { lastDate: today, streak };

  // 時間
  const hhmm = new Date().toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // 名次稱號
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

// ── 啟動 ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[OK] Server running on port ${PORT}`);
  console.log(`[OK] channelSecret 末4碼: ...${config.channelSecret.slice(-4)}`);
});
