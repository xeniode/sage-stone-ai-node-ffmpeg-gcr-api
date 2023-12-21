const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const { Storage } = require('@google-cloud/storage');
const storage = new Storage();
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON and handle CORS
app.use(express.json());
app.use(cors());

// Function to extract audio from video
async function extractAudioFromVideo(videoPath, outputPath, bucketName) {
    const outputFileName = outputPath.split('/').pop(); // Assumes outputPath is a path with directories
    const tempFilePath = `/tmp/${outputFileName}`;
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .output(tempFilePath)
            .noVideo()
            .audioCodec('libmp3lame')
            .on('end', async () => {
                try {
                    await storage.bucket(bucketName).upload(tempFilePath, {
                        destination: `audio/${outputFileName}`,
                    });
                    resolve(`gs://${bucketName}/audio/${outputFileName}`);
                } catch (error) {
                    reject(error);
                }
            })
            .on('error', (err) => reject(err))
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
