/** @format */

const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const cors = require("cors");
const fs = require("fs");
const { Storage } = require("@google-cloud/storage");
const storage = new Storage();
const app = express();
const port = process.env.PORT || 3000;

/* Commands to build and deploy to gcloud
 gcloud builds submit --tag us-central1-docker.pkg.dev/owl-test-auto-bot/docker-ffmpeg/node-ffmpeg-gcr
 docker push us-central1-docker.pkg.dev/owl-test-auto-bot/docker-ffmpeg/node-ffmpeg-gcr
 gcloud run deploy node-ffmpeg-gcr --image us-central1-docker.pkg.dev/owl-test-auto-bot/docker-ffmpeg/node-ffmpeg-gcr --platform managed --region us-central1
*/

/* Payload object

{
  "videoPath": "user-data/WASPd41xDcPhoNzLgVFJfpY8J8t1/projects/BcO7i5gxy7zVYXPWS3BF/videos/ElonMusk-Sam-OpenAI-Firing.mp4",
  "outputPath": "output/audio.mp3",
  "bucketName": "owl-test-auto-bot.appspot.com"
}

*/

// Middleware to parse JSON and handle CORS
app.use(express.json());
app.use(cors());

// Function to download video from GCS
async function downloadVideoFromGCS(gcsUri, bucketName) {
  const videoFileName = gcsUri.split("/").pop();
  const videoFilePath = `/tmp/${videoFileName}`;

  // Download the video file from GCS to the local filesystem
  await storage
    .bucket(bucketName)
    .file(gcsUri.replace(`gs://${bucketName}/`, ""))
    .download({
      destination: videoFilePath,
    });

  return videoFilePath;
}

// Function to extract audio from video
async function extractAudioFromVideo(gcsUri, outputPath, bucketName) {
  const outputFileName = outputPath.split("/").pop();
  const tempOutputPath = `/tmp/${outputFileName}`;

  // Download the video file from GCS
  const videoFilePath = await downloadVideoFromGCS(gcsUri, bucketName);

  return new Promise((resolve, reject) => {
    ffmpeg(videoFilePath)
      .output(tempOutputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .on("end", async () => {
        try {
          // Upload the extracted audio file to GCS
          await storage.bucket(bucketName).upload(tempOutputPath, {
            destination: `audio/${outputFileName}`,
          });
          // Clean up the temporary files
          fs.unlinkSync(videoFilePath);
          fs.unlinkSync(tempOutputPath);
          resolve(`gs://${bucketName}/audio/${outputFileName}`);
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (err) => {
        // Clean up the temporary files in case of an error
        if (fs.existsSync(videoFilePath)) {
          fs.unlinkSync(videoFilePath);
        }
        if (fs.existsSync(tempOutputPath)) {
          fs.unlinkSync(tempOutputPath);
        }
        reject(err);
      })
      .run();
  });
}

// Function to generate a thumbnail from video
async function generateThumbnail(gcsUri, thumbnailTime, bucketName) {
  const videoFileName = gcsUri.split("/").pop();
  const thumbnailFileName = `thumbnail-${Date.now()}.png`;
  const videoFilePath = await downloadVideoFromGCS(gcsUri, bucketName);
  const thumbnailFilePath = `/tmp/${thumbnailFileName}`;

  return new Promise((resolve, reject) => {
    ffmpeg(videoFilePath)
      .screenshots({
        timestamps: [thumbnailTime],
        filename: thumbnailFileName,
        folder: "/tmp",
        size: "320x240",
      })
      .on("end", async () => {
        try {
          // Upload the thumbnail image to GCS
          await storage.bucket(bucketName).upload(thumbnailFilePath, {
            destination: `thumbnails/${thumbnailFileName}`,
          });
          // Clean up the temporary files
          fs.unlinkSync(videoFilePath);
          fs.unlinkSync(thumbnailFilePath);
          resolve(`gs://${bucketName}/thumbnails/${thumbnailFileName}`);
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (err) => {
        // Clean up the temporary files in case of an error
        if (fs.existsSync(videoFilePath)) {
          fs.unlinkSync(videoFilePath);
        }
        if (fs.existsSync(thumbnailFilePath)) {
          fs.unlinkSync(thumbnailFilePath);
        }
        reject(err);
      });
  });
}

// Function to take a screenshot of the video at a given interval
async function takeScreenshotAtInterval(gcsUri, interval, bucketName) {
  const videoFileName = gcsUri.split("/").pop();
  const screenshotFileName = `screenshot-${Date.now()}.png`;
  const videoFilePath = await downloadVideoFromGCS(gcsUri, bucketName);
  const screenshotFilePath = `/tmp/${screenshotFileName}`;

  return new Promise((resolve, reject) => {
    ffmpeg(videoFilePath)
      .screenshots({
        timestamps: [interval + "s"],
        filename: screenshotFileName,
        folder: "/tmp",
        size: "320x240",
      })
      .on("end", async () => {
        try {
          // Upload the screenshot image to GCS
          await storage.bucket(bucketName).upload(screenshotFilePath, {
            destination: `screenshots/${screenshotFileName}`,
          });
          // Clean up the temporary files
          fs.unlinkSync(videoFilePath);
          fs.unlinkSync(screenshotFilePath);
          resolve(`gs://${bucketName}/screenshots/${screenshotFileName}`);
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (err) => {
        // Clean up the temporary files in case of an error
        if (fs.existsSync(videoFilePath)) {
          fs.unlinkSync(videoFilePath);
        }
        if (fs.existsSync(screenshotFilePath)) {
          fs.unlinkSync(screenshotFilePath);
        }
        reject(err);
      });
  });
}

// Function to split M4A audio file into chunks
async function splitM4aAudio(gcsUri, bucketName) {
  const audioFileName = gcsUri.split("/").pop();
  const prefix = audioFileName.split('_')[0];
  const audioFilePath = await downloadVideoFromGCS(gcsUri, bucketName);
  const desiredSizeBytes = 20 * 1024 * 1024; // 20MB in bytes
  const audioFileDir = gcsUri.substring(0, gcsUri.lastIndexOf("/") + 1);
  console.log(audioFileDir);

  // Get average bitrate of the input M4A file in kilobits per second (kbps)
  const bitrateKbps = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioFilePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.bit_rate / 1000);
    });
  });

  // Calculate approximate segment duration based on desired size and bitrate
  const segmentDuration = (desiredSizeBytes * 8) / (bitrateKbps * 1000);

  // Use FFmpeg to split the M4A into segments with calculated duration
  return new Promise((resolve, reject) => {
    ffmpeg(audioFilePath)
      .output(`/tmp/${prefix}_chunk_%03d.m4a`)
      .outputOptions([
        "-f segment",
        `-segment_time ${segmentDuration}`,
        "-c copy",
        "-map 0",
        "-segment_format m4a",
      ])
      .on("end", async () => {
        try {
          // Upload the audio chunks to GCS
          const files = fs
            .readdirSync("/tmp")
            .filter((file) => file.startsWith(`${prefix}_chunk_`));
          const uploadPromises = files.map((file) => {
            return storage.bucket(bucketName).upload(`/tmp/${file}`, {
              destination: `${audioFileDir}audio_chunks/${file}`,
              destination: `${audioFileDir}audio_chunks/${file}`,
            });
          });
          await Promise.all(uploadPromises);
          // Clean up the temporary files
          files.forEach((file) => fs.unlinkSync(`/tmp/${file}`));
          resolve(files.map((file) => `gs://${bucketName}/${audioFileDir}audio_chunks/${file}`));
          resolve(files.map((file) => `gs://${bucketName}/${audioFileDir}audio_chunks/${file}`));
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (err) => {
        reject(err);
      })
      .run();
  });
}

// Function to split MP3 audio file into chunks
async function splitMp3Audio(gcsUri, bucketName) {
  const audioFileName = gcsUri.split("/").pop();
  const prefix = audioFileName.split('_')[0];
  const audioFilePath = await downloadVideoFromGCS(gcsUri, bucketName);
  const desiredSizeBytes = 20 * 1024 * 1024; // 20MB in bytes
  const audioFileDir = gcsUri.substring(0, gcsUri.lastIndexOf("/") + 1);

  // Get average bitrate of the input MP3 file in kilobits per second (kbps)
  const bitrateKbps = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioFilePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.bit_rate / 1000);
    });
  });

  // Calculate approximate segment duration based on desired size and bitrate
  const segmentDuration = (desiredSizeBytes * 8) / (bitrateKbps * 1000);

  // Use FFmpeg to split the MP3 into segments with calculated duration
  return new Promise((resolve, reject) => {
    ffmpeg(audioFilePath)
      .output(`/tmp/${prefix}_chunk_%03d.mp3`)
      .outputOptions([
        "-f segment",
        `-segment_time ${segmentDuration}`,
        "-c copy",
        "-map 0",
        "-segment_format mp3",
      ])
      .on("end", async () => {
        try {
          // Upload the audio chunks to GCS
          const files = fs
            .readdirSync("/tmp")
            .filter((file) => file.startsWith(`${prefix}_chunk_`));
          const uploadPromises = files.map((file) => {
            return storage.bucket(bucketName).upload(`/tmp/${file}`, {
              destination: `${audioFileDir}audio_chunks/${file}`,
              destination: `${audioFileDir}audio_chunks/${file}`,
            });
          });
          await Promise.all(uploadPromises);
          // Clean up the temporary files
          files.forEach((file) => fs.unlinkSync(`/tmp/${file}`));
          resolve(files.map((file) => `gs://${bucketName}/${audioFileDir}audio_chunks/${file}`));
          resolve(files.map((file) => `gs://${bucketName}/${audioFileDir}audio_chunks/${file}`));
        } catch (error) {
          reject(error);
        }
      })
      .on("error", (err) => {
        reject(err);
      })
      .run();
  });
}

// POST endpoint to trigger audio extraction
app.post("/extract-audio", async (req, res) => {
  try {
    const { videoPath, outputPath, bucketName } = req.body;
    if (!bucketName) {
      throw new Error("Bucket name is required");
    }
    const gcsAudioPath = await extractAudioFromVideo(
      videoPath,
      outputPath,
      bucketName
    );
    res.send({
      message: "Audio extracted and uploaded successfully",
      audioPath: gcsAudioPath,
    });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Error extracting audio", error: error.message });
  }
});

// POST endpoint to generate a thumbnail
app.post("/generate-thumbnail", async (req, res) => {
  try {
    const { videoPath, thumbnailTime, bucketName } = req.body;
    if (!bucketName) {
      throw new Error("Bucket name is required");
    }
    const gcsThumbnailPath = await generateThumbnail(
      videoPath,
      thumbnailTime,
      bucketName
    );
    res.send({
      message: "Thumbnail generated and uploaded successfully",
      thumbnailPath: gcsThumbnailPath,
    });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Error generating thumbnail", error: error.message });
  }
});

// POST endpoint to take a screenshot at a given interval
app.post("/take-screenshot-interval", async (req, res) => {
  try {
    const { videoPath, interval, bucketName } = req.body;
    if (!bucketName) {
      throw new Error("Bucket name is required");
    }
    const gcsScreenshotPath = await takeScreenshotAtInterval(
      videoPath,
      interval,
      bucketName
    );
    res.send({
      message: "Screenshot taken and uploaded successfully",
      screenshotPath: gcsScreenshotPath,
    });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Error taking screenshot", error: error.message });
  }
});

// POST endpoint to split M4A audio file into chunks
app.post("/split-m4a-audio", async (req, res) => {
  try {
    const { audioPath, bucketName } = req.body;
    if (!bucketName) {
      throw new Error("Bucket name is required");
    }
    const gcsAudioChunkPaths = await splitM4aAudio(audioPath, bucketName);
    res.send({
      message: "Audio split into chunks and uploaded successfully",
      audioChunkPaths: gcsAudioChunkPaths,
    });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Error splitting audio", error: error.message });
  }
});

// POST endpoint to split MP3 audio file into chunks
app.post("/split-mp3-audio", async (req, res) => {
  try {
    const { audioPath, bucketName } = req.body;
    if (!bucketName) {
      throw new Error("Bucket name is required");
    }
    const gcsAudioChunkPaths = await splitMp3Audio(audioPath, bucketName);
    res.send({
      message: "Audio split into chunks and uploaded successfully",
      audioChunkPaths: gcsAudioChunkPaths,
    });
  } catch (error) {
    res
      .status(500)
      .send({ message: "Error splitting audio", error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
