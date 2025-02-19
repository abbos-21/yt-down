const TelegramBot = require("node-telegram-bot-api");
const ytdl = require("@distube/ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const express = require("express");
const sanitize = require("sanitize-filename");

const TOKEN = "6065635181:AAG2pNqB9rNsV8VZsCfvIs4poJxeHRzU8qk";
const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
const PORT = 3001;
const DOWNLOAD_DIR = "./downloads/";
const cache = new Map();

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR);

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Send me a YouTube video link, and I will download it in 4K!"
  );
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text.startsWith("http")) return;

  // Check cache before processing
  if (cache.has(text)) {
    const cachedData = cache.get(text);
    if (!cachedData.sent) {
      bot.sendMessage(
        chatId,
        `Your video is ready: ${cachedData.link}\nSize: ${cachedData.size} MB`
      );
      cachedData.sent = true;
    }
    return;
  }

  bot.sendMessage(chatId, "Processing your request...");

  try {
    const info = await ytdl.getInfo(text);
    const title = sanitize(info.videoDetails.title);

    const videoPath = `${DOWNLOAD_DIR}${title}_video.mp4`;
    const audioPath = `${DOWNLOAD_DIR}${title}_audio.mp3`;
    const outputFile = `${DOWNLOAD_DIR}${title}.mp4`;

    // Try fetching formats
    const videoFormat = ytdl.chooseFormat(info.formats, {
      quality: "highestvideo",
    });
    const audioFormat = ytdl.chooseFormat(info.formats, {
      quality: "highestaudio",
    });

    if (!videoFormat || !audioFormat) {
      bot.sendMessage(chatId, "No suitable video quality found.");
      return;
    }

    // Download video and audio
    await Promise.all([
      new Promise((resolve, reject) => {
        ytdl(text, { format: videoFormat })
          .pipe(fs.createWriteStream(videoPath))
          .on("finish", resolve)
          .on("error", reject);
      }),
      new Promise((resolve, reject) => {
        ytdl(text, { format: audioFormat })
          .pipe(fs.createWriteStream(audioPath))
          .on("finish", resolve)
          .on("error", reject);
      }),
    ]);

    bot.sendMessage(chatId, "Merging video and audio...");

    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(["-c:v copy", "-c:a aac", "-strict experimental"])
      .save(outputFile)
      .on("end", () => {
        fs.unlinkSync(videoPath);
        fs.unlinkSync(audioPath);
        const fileSize = (fs.statSync(outputFile).size / (1024 * 1024)).toFixed(
          2
        );
        const encodedTitle = encodeURIComponent(title);
        const downloadLink = `http://85.209.2.38:${PORT}/downloads/${encodedTitle}.mp4`;

        bot.sendMessage(
          chatId,
          `Your video is ready: ${downloadLink}\nSize: ${fileSize} MB`
        );
        cache.set(text, { link: downloadLink, size: fileSize, sent: false });
      })
      .on("error", (err) =>
        bot.sendMessage(chatId, `FFmpeg Error: ${err.message}`)
      );
  } catch (error) {
    bot.sendMessage(chatId, `Error processing video: ${error.message}`);
  }
});

app.use("/downloads", express.static(DOWNLOAD_DIR));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
