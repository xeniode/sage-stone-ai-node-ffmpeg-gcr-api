#!/bin/bash

# Desired output file size in bytes (20MB).
DESIRED_SIZE_BYTES=$((20 * 1024 * 1024))

# Input M4A filename.
INPUT_FILE="$1"

# Check if input file was provided.
if [[ -z "$INPUT_FILE" ]]; then
    echo "Usage: $0 <input_file.m4a>"
    exit 1
fi

# Get average bitrate of the input M4A file in kilobits per second (kbps).
BITRATE_KBPS=$(ffprobe -v error -show_entries format=bit_rate -of default=noprint_wrappers=1:nokey=1 "$INPUT_FILE")
BITRATE_KBPS=$((BITRATE_KBPS / 1000))

# Calculate approximate segment duration based on desired size and bitrate.
SEGMENT_DURATION=$(echo "scale=2; $DESIRED_SIZE_BYTES * 8 / ($BITRATE_KBPS * 1000)" | bc)

# Use FFmpeg to split the M4A into segments with calculated duration.
ffmpeg -i "$INPUT_FILE" -f segment -segment_time "$SEGMENT_DURATION" -c copy -map 0 \
       -segment_format m4a "output_chunk_%03d.m4a"

echo "Splitting complete."
