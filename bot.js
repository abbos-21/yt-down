const TelegramBot = require("node-telegram-bot-api");
const ytdl = require("@distube/ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const express = require("express");
const sanitize = require("sanitize-filename");
const path = require("path");

const TOKEN = "YOUR_TELEGRAM_BOT_TOKEN";
const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
const PORT = 3001;
const DOWNLOAD_DIR = path.resolve("./downloads");
const cache = new Map();

if (!fs.existsSync(DOWNLOAD_DIR))
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Send me a YouTube video link, and I will download it in 4K!"
  );
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text || !text.startsWith("http")) return;

  if (cache.has(text)) {
    const { link, size } = cache.get(text);
    return bot.sendMessage(
      chatId,
      `Your video is ready: ${link}\nSize: ${size} MB`
    );
  }

  bot.sendMessage(chatId, "Processing your request...");

  try {
    const info = await ytdl.getInfo(text);
    const title = sanitize(info.videoDetails.title).replace(/\s+/g, "_");
    const videoPath = path.join(DOWNLOAD_DIR, `${title}_video.mp4`);
    const audioPath = path.join(DOWNLOAD_DIR, `${title}_audio.mp3`);
    const outputFile = path.join(DOWNLOAD_DIR, `${title}.mp4`);

    const [videoFormat, audioFormat] = [
      ytdl.chooseFormat(info.formats, { quality: "highestvideo" }),
      ytdl.chooseFormat(info.formats, { quality: "highestaudio" }),
    ];

    if (!videoFormat || !audioFormat) {
      return bot.sendMessage(chatId, "No suitable video quality found.");
    }

    await Promise.all([
      ytdl(text, { format: videoFormat })
        .pipe(fs.createWriteStream(videoPath))
        .on("finish", () => {}),
      ytdl(text, { format: audioFormat })
        .pipe(fs.createWriteStream(audioPath))
        .on("finish", () => {}),
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
        const downloadLink = `http://your-server-ip:${PORT}/downloads/${encodeURIComponent(
          title
        )}.mp4`;

        bot.sendMessage(
          chatId,
          `Your video is ready: ${downloadLink}\nSize: ${fileSize} MB`
        );
        cache.set(text, { link: downloadLink, size: fileSize });
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
