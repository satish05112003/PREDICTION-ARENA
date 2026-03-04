# Use official Ubuntu image as base
FROM ubuntu:22.04

# Prevent interactive TZ config during apt-get
ENV DEBIAN_FRONTEND=noninteractive

# Update and install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js v20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean

# Install global PM2 to manage both processes
RUN npm install -g pm2

# Create the working directory
WORKDIR /app

# Copy the frontend package.json to install node deps
# (Even though frontend isn't hosted here, we need the server deps like ws)
COPY package*.json ./
RUN npm install --production --force

# Copy the Python requirements
COPY requirements.txt ./
# For Ubuntu environments pip breakages, we add --break-system-packages (safe in Docker)
RUN pip3 install -r requirements.txt --break-system-packages || pip3 install -r requirements.txt

# Copy all the remaining project code
COPY . .

# Ensure required runtime directories exist
RUN mkdir -p dataset models logs/ml logs/server

# Expose ONLY the Node.js websocket server since Vercel connects to Node (which talks to Python locally inside container)
ENV PORT=8080
EXPOSE $PORT

# Instead of 'pm2 start', we use 'pm2-runtime' to keep the Docker container alive
CMD ["pm2-runtime", "ecosystem.backend.config.js"]
