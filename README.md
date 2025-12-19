# Daily-Standup-Chatbot
This Repo is for our Daily Standup Chatbot

## Deploy on an Ubuntu EC2 instance

Quick steps (recommended):

1. Copy the project to the EC2 instance or clone it there.

2. Upload `scripts/setup_ec2_ubuntu.sh` and run it on the EC2 instance (provide the repo path and/or git URL):

```bash
# on the EC2 instance (run as root or with sudo)
sudo bash scripts/setup_ec2_ubuntu.sh /home/ubuntu/daily-standup-chatbot https://github.com/your/repo.git
```

3. Create a `.env` file in the project root from `.env.example` and fill in your secrets.

```bash
cp .env.example .env
# edit .env with your values (use nano, vim, or echo > .env)
```

4. Start the app (the setup script will use `pm2`):

```bash
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup systemd
```

Notes:
- The setup script installs Node.js 18, `pm2`, and starts the app. If you prefer, you can install Node.js yourself.
- Make sure port `4000` (or the port set in your `.env`) is allowed in the EC2 security group.
- For zero-downtime deploys, use `pm2 reload ecosystem.config.js --env production` after pulling updates.

A simple Slack bot that summarizes developer worklogs.

## Docker

Build the image from the project root:

```bash
docker build -t daily-standup-chatbot .
# Daily-Standup-Chatbot
This Repo is for our Daily Standup Chatbot
Run the container (you must provide required environment variables):
