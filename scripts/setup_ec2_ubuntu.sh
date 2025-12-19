#!/usr/bin/env bash
set -euo pipefail

# setup_ec2_ubuntu.sh
# Usage: sudo bash setup_ec2_ubuntu.sh [REPO_DIR] [GIT_REPO_URL]
# If REPO_DIR exists it will be used; otherwise the script will clone GIT_REPO_URL into REPO_DIR.

REPO_DIR=${1:-/home/ubuntu/daily-standup-chatbot}
GIT_REPO_URL=${2:-}
NODE_SETUP_VERSION=18

echo "==> Updating apt and installing prerequisites"
apt update -y
apt upgrade -y
apt install -y curl git build-essential

echo "==> Installing Node.js ${NODE_SETUP_VERSION}"
curl -fsSL https://deb.nodesource.com/setup_${NODE_SETUP_VERSION}.x | bash -
apt install -y nodejs

echo "==> Node and npm versions"
node -v
npm -v

if [ ! -d "$REPO_DIR" ]; then
  if [ -z "$GIT_REPO_URL" ]; then
    echo "Repository folder $REPO_DIR does not exist and no GIT_REPO_URL provided."
    echo "Either create the folder and put your app there, or re-run with a git URL:"
    echo "  sudo bash setup_ec2_ubuntu.sh $REPO_DIR https://github.com/you/your-repo.git"
    exit 1
  fi
  echo "==> Cloning repository"
  git clone "$GIT_REPO_URL" "$REPO_DIR"
fi

cd "$REPO_DIR"

echo "==> Installing app dependencies (production)"
npm ci --only=production || npm install --production

echo "==> Installing pm2 process manager globally"
npm install -g pm2

echo "==> Starting application with pm2"
if [ -f ecosystem.config.js ]; then
  pm2 start ecosystem.config.js --env production
else
  pm2 start server.js --name daily-standup-chatbot --env production
fi

echo "==> Saving pm2 process list and enabling startup"
pm2 save
PM2_STARTUP_CMD=$(pm2 startup systemd -u $(whoami) --hp $(eval echo ~$(whoami)) | tail -n1)
echo "Run the following command as root (pm2 startup output):"
echo "$PM2_STARTUP_CMD"

echo "==> Deployment complete."
echo "Remember to create a .env file in $REPO_DIR with required environment variables (see .env.example)."
