const fs = require("fs");
const ytdl = require("@distube/ytdl-core");
const ffmpeg = require("fluent-ffmpeg");
const sanitize = require("sanitize-filename"); // Ensure safe filenames

async function download4KVideo(videoUrl) {
  try {
    const info = await ytdl.getInfo(videoUrl);
    const videoTitle = sanitize(info.videoDetails.title); // Get and sanitize the title

    // Define output file names
    const videoPath = `${videoTitle}_video.mp4`;
    const audioPath = `${videoTitle}_audio.mp3`;
    const outputFile = `${videoTitle}.mp4`;

    // Get the highest quality video & audio
    const videoFormat = ytdl.chooseFormat(info.formats, {
      quality: "highestvideo",
    });
    const audioFormat = ytdl.chooseFormat(info.formats, {
      quality: "highestaudio",
    });

    if (!videoFormat || !audioFormat) {
      console.log("No suitable formats found.");
      return;
    }

    console.log(`🎥 Downloading Video: ${videoFormat.qualityLabel}`);
    console.log(`🎵 Downloading Audio: ${audioFormat.audioBitrate} kbps`);

    // Download video and audio simultaneously
    await Promise.all([
      new Promise((resolve, reject) => {
        ytdl(videoUrl, { format: videoFormat })
          .pipe(fs.createWriteStream(videoPath))
          .on("finish", resolve)
          .on("error", reject);
      }),
      new Promise((resolve, reject) => {
        ytdl(videoUrl, { format: audioFormat })
          .pipe(fs.createWriteStream(audioPath))
          .on("finish", resolve)
          .on("error", reject);
      }),
    ]);

    console.log("✅ Video and audio downloaded. Merging...");

    // Merge video + audio using FFmpeg
    ffmpeg()
      .input(videoPath)
      .input(audioPath)
      .outputOptions(["-c:v copy", "-c:a aac", "-strict experimental"])
      .save(outputFile)
      .on("end", () => {
        console.log(`🎉 Merging complete! Saved as: ${outputFile}`);
        fs.unlinkSync(videoPath);
        fs.unlinkSync(audioPath);
      })
      .on("error", (err) => console.error("❌ FFmpeg Error:", err));
  } catch (error) {
    console.error("❌ Error:", error);
  }
}

// Example usage
const videoUrl = "https://youtu.be/B7-BunbsXu8"; // Replace with actual video URL
download4KVideo(videoUrl);
