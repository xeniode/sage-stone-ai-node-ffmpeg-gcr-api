const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON and handle CORS
app.use(express.json());
app.use(cors());

// Function to extract audio from video
async function extractAudioFromVideo(gcsUri, outputPath, bucketName) {
    const videoFileName = gcsUri.split('/').pop();
    const videoFilePath = `/tmp/${videoFileName}`;
    const outputFileName = outputPath.split('/').pop();
    const tempOutputPath = `/tmp/${outputFileName}`;

    // Download the video file from GCS to the local filesystem
    await storage.bucket(bucketName).file(gcsUri.replace(`gs://${bucketName}/`, '')).download({
        destination: videoFilePath,
    });

    return new Promise((resolve, reject) => {
        ffmpeg(videoFilePath)
            .output(tempOutputPath)
            .noVideo()
            .audioCodec('libmp3lame')
            .on('end', async () => {
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
            .on('error', (err) => {
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

// POST endpoint to trigger audio extraction
app.post('/extract-audio', async (req, res) => {
    try {
        const { videoPath, outputPath, bucketName } = req.body;
        if (!bucketName) {
            throw new Error('Bucket name is required');
        }
        const gcsAudioPath = await extractAudioFromVideo(videoPath, outputPath, bucketName);
        res.send({ message: 'Audio extracted and uploaded successfully', audioPath: gcsAudioPath });
    } catch (error) {
        res.status(500).send({ message: 'Error extracting audio', error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
