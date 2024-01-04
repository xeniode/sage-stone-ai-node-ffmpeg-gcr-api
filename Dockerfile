# Use the official Node.js 16 image as a parent image
FROM node:16

# Install FFmpeg
RUN apt-get update && \
    apt-get install -y ffmpeg libmp3lame0 && \
    apt-get clean

# Set the working directory in the container
ENV APP_HOME /usr/src/app
ENV PORT 3001
WORKDIR $APP_HOME

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Bundle the app's source code inside the Docker image
COPY . .

# Your application's default port
EXPOSE $PORT

# Define the command to run the app
CMD ["node", "app.js"]
