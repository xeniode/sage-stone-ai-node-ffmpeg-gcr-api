#! /bin/bash

# deploy the docker container on gcloud

TAG="${1:-latest}"

echo "Deploying working container on docker-ffmpeg/node-ffmpeg-beta:${TAG}"

PYTUBE_VERSION=$(git describe --tags)

# gcloud builds submit --tag us-central1-docker.pkg.dev/owl-test-auto-bot/docker-ffmpeg/pytube-beta

gcloud run deploy node-ffmpeg-beta --image us-central1-docker.pkg.dev/owl-test-auto-bot/docker-ffmpeg/node-ffmpeg-beta --platform managed --region us-central1