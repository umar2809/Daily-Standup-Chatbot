# Daily Standup Chatbot

> An AI-powered Slack bot that automates daily standup summaries and provides intelligent code review for development teams.

---

## Overview

Daily Standup Chatbot integrates directly into your Slack workspace to streamline engineering workflows. It uses the Groq API (LLaMA 3.3 70B) to deliver fast, accurate worklog summaries and in-depth code analysis — all without leaving Slack.

---

## Features

| Feature | Description |
|---|---|
| Worklog Summary | Automatically summarizes messages into 6–7 concise bullet points |
| AI Code Review | Analyzes code for syntax errors, logic bugs, security vulnerabilities, and best practices |
| Quick Review | Inline code review via `/quickreview <code>` |
| Auto-Fix | AI-generated fixes for detected code issues |
| Multi-language Support | JavaScript, TypeScript, Python, Java, C++, C#, Go, Rust, Ruby, Swift, Kotlin, HTML, CSS, SQL, Shell/Bash |
| Quality Score | Rates code quality from 1–10 with color-coded feedback |

---

## Tech Stack

- **Runtime:** Node.js 18 (Alpine)
- **Framework:** Express.js
- **AI Provider:** [Groq](https://groq.com) — LLaMA 3.3 70B via OpenAI-compatible SDK
- **Slack SDK:** `@slack/web-api`
- **Containerization:** Docker + Docker Compose
- **Cloud:** AWS EC2 — `t3.medium`, `ap-south-1`
- **Domain:** No-IP DDNS (`dailychat.ddns.net`)
- **Process Manager:** PM2 (inside container)
- **IaC:** Terraform

---

## Prerequisites

- Docker & Docker Compose installed on the server
- A [Slack App](https://api.slack.com/apps) with bot token and signing secret
- A [Groq API key](https://console.groq.com)
- A domain pointing to your server (or use No-IP DDNS)

---

## Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```env
PORT=4000
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
GROQ_API_KEY=gsk_your-groq-api-key
CLIENT_ID=your-slack-client-id
CLIENT_SECRET=your-slack-client-secret
REDIRECT_URI=https://your-domain/slack/oauth_redirect
```

---

## Deployment

### Clone & Configure

```bash
git clone https://github.com/umar2809/Daily-Standup-Chatbot.git
cd Daily-Standup-Chatbot
cp .env.example .env
nano .env   # fill in all values
```

### Build & Start

```bash
docker-compose build --no-cache
docker-compose up -d
docker-compose logs -f
```

### Update to Latest Version

```bash
git pull origin features
docker rm -f daily-standup-chatbot
docker-compose build --no-cache
docker-compose up -d
```

---

## Slack App Configuration

Configure the following in your [Slack App settings](https://api.slack.com/apps):

### Slash Commands

| Command | Request URL | Description |
|---|---|---|
| `/codereview` | `https://your-domain/slack/commands/codereview` | Open AI code review modal |
| `/quickreview` | `https://your-domain/slack/commands/quickreview` | Quick inline code review |
| `/help` | `https://your-domain/slack/commands/help` | Show available commands |

### Interactivity & Shortcuts

**Request URL:**
```
https://your-domain/slack/interactions
```

### Event Subscriptions

**Request URL:**
```
https://your-domain/slack/events
```

**Subscribe to bot events:**
- `message.channels`
- `message.groups`
- `message.im`
- `app_mention`

### OAuth & Permissions

**Redirect URL:**
```
https://your-domain/slack/oauth_redirect
```

**Bot Token Scopes:**
`app_mentions:read`, `channels:history`, `chat:write`, `groups:history`, `im:history`, `mpim:history`, `channels:join`, `channels:read`, `groups:read`, `mpim:read`, `im:read`, `users:read`

---

## Usage

### Worklog Summary

Simply send a message in any channel where the bot is present:

```
worked on authentication module, fixed login bug, reviewed 3 PRs, updated API docs
```

The bot will reply with a structured bullet-point summary.

To send the summary to another channel, mention the channel in your message:

```
#standup worked on authentication module, fixed login bug
```

### Code Review

Use `/codereview` to open the review modal, select your language, paste your code, and click **Analyze Code**.

Or use quick review:

```
/quickreview const x = 1; console.log(x)
```

---

## Nginx & SSL

Nginx acts as a reverse proxy in front of the app on port 4000, handling HTTPS termination via Let's Encrypt.

### Install Nginx & Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Nginx Configuration

Create `/etc/nginx/sites-available/dailychat`:

```nginx
server {
    listen 80;
    server_name dailychat.ddns.net;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/dailychat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Obtain SSL Certificate

```bash
sudo certbot --nginx -d dailychat.ddns.net
```

Certbot automatically updates the Nginx config with HTTPS and sets up auto-renewal. Verify renewal works:

```bash
sudo certbot renew --dry-run
```

---

## CI/CD Pipeline

Automated deployments are configured via GitHub Actions (`.github/workflows/deploy-ec2.yml`).

### How It Works

Every push to the `features` branch (excluding `infra/` and `.tf` files) triggers an automatic deployment to the EC2 instance:

1. **Checkout** — pulls latest code
2. **SSH into EC2** — connects using a stored deploy key
3. **Pull & Build** — runs `git pull` and rebuilds the Docker image
4. **Restart Container** — stops old container, starts new one with `--env-file .env`
5. **Verify** — hits the `/slack/events` endpoint to confirm the app is live

### GitHub Secrets Required

| Secret | Description |
|---|---|
| `AWS_SSH_KEY` | Private SSH key for EC2 access |
| `AWS_USER` | EC2 username (e.g. `ubuntu`) |
| `AWS_HOST` | EC2 public IP or domain |

### Setup

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Add the three secrets above
3. Push to `features` branch — deployment runs automatically

---

## Infrastructure

Provisioned with Terraform in `infra/`:

- **Region:** `ap-south-1` (Mumbai)
- **Instance:** `t3.medium`, Ubuntu, 20GB gp2
- **Security Group:** Ports 22, 80, 443, 4000

```bash
cd infra
terraform init
terraform apply
```

---

## License

ISC
