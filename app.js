const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON and handle CORS
app.use(express.json());
app.use(cors());

// Function to extract audio from video
function extractAudioFromVideo(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .output(outputPath)
            .noVideo()
            .audioCodec('libmp3lame')
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .run();
    });
}

// POST endpoint to trigger audio extraction
app.post('/extract-audio', async (req, res) => {
    try {
        const { videoPath, outputPath } = req.body;
        const audioPath = await extractAudioFromVideo(videoPath, outputPath);
        res.send({ message: 'Audio extracted successfully', audioPath });
    } catch (error) {
        res.status(500).send({ message: 'Error extracting audio', error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
