#! /bin/bash

# Build the docker container on gcloud

TAG="${1:-latest}"

echo "Building working image on docker-ffmpeg/node-ffmpeg-beta:${TAG}"

PYTUBE_VERSION=$(git describe --tags)

gcloud builds submit --tag us-central1-docker.pkg.dev/owl-test-auto-bot/docker-ffmpeg/node-ffmpeg-beta:${TAG} --timeout=1h --project=owl-test-auto-bot