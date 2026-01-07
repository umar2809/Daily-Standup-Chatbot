require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { WebClient } = require("@slack/web-api");
const { OpenAI } = require("openai");

const app = express();
const port = process.env.PORT || 4000;

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json());

// Slack OAuth installation URL
const scope = [
  "app_mentions:read",
  "channels:history",
  "chat:write",
  "groups:history",
  "im:history",
  "mpim:history",
  "channels:join",
  "channels:read",
  "groups:read",
  "mpim:read",
  "im:read",
  "users:read"
].join(",");
const oauthUrl = `https://slack.com/oauth/v2/authorize?client_id=${process.env.CLIENT_ID}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}`;

// OAuth redirect Handler and Slack redirects back to this URL
app.get("/slack/oauth_redirect", async (req, res) => {
  const { code } = req.query;
  try {
    const response = await axios.post("https://slack.com/api/oauth.v2.access", null, {
      params: {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code,
        redirect_uri: process.env.REDIRECT_URI,
      },
    });
    res.send(response.data.ok ? "Authorization successful!" : `Error: ${response.data.error}`);
  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Fetch channel name
const getChannelInfoById = async (channelId) => {
  try {
    const res = await client.conversations.info({ channel: channelId });
    return res.channel;
  } catch (error) {
    console.error("Channel info error:", error);
    return null;
  }
};

// Fetch user display name
const getUserNameById = async (userId) => {
  if (!userId) return "Unknown User";
  try {
    const res = await client.users.info({ user: userId });
    return res.user?.real_name || res.user?.name || "Unknown User";
  } catch (error) {
    console.error("User info error:", error);
    return "Unknown User";
  }
};

// Slack Events Webhook 
app.post("/slack/events", async (req, res) => {
  if (req.body.type === "url_verification") {
    return res.send({ challenge: req.body.challenge });
  }

  res.sendStatus(200);

  const { event, authorizations } = req.body;
  const botUserId = authorizations?.[0]?.user_id;

  if (
    !event || event.type !== "message" || event.subtype === "bot_message" ||
    event.user === botUserId || !event.text || event.text.startsWith("[SUMMARY]")
  ) {
    return;
  }

  const originChannelId = event.channel;
  const rawText = event.text;
  const userId = event.user;
  const userName = await getUserNameById(userId);
  const botMentioned = rawText.includes(`<@${botUserId}>`);
  const channelMentionPattern = /<#(\w+)\|?([^>]*)>/g;
  const matches = [...rawText.matchAll(channelMentionPattern)];

 //Handle Simple Message 
  if (matches.length === 0) {
    const cleanedText = rawText
      .replace(/<@[^>]+>/g, "")
      .replace(/<#([^>]+)>/g, "")
      .trim();

    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant that summarizes worklogs into 3–4 lines." },
        { role: "user", content: cleanedText },
      ],
    });

    const summary = summaryResponse.choices[0].message.content.trim();
    const prefix = botMentioned ? "[SUMMARY] This is work log summary\n" : "";

    await client.chat.postMessage({
      channel: originChannelId,
      text: `${prefix}User: ${userName}\n${summary}`,
    });
    return;
  }

// Handle Messages with #channel Mentions

  for (const match of matches) {
    const channelId = match[1];
    const channelInfo = await getChannelInfoById(channelId);
    const channelName = channelInfo?.name || "Unknown Channel";

    const mentionEndIndex = match.index + match[0].length;
    const remainingText = event.text.slice(mentionEndIndex).trim();

    const cleanedText = remainingText
      .replace(/<@[^>]+>/g, "")
      .replace(/<#([^>]+)>/g, "")
      .trim();

    if (!cleanedText) continue;

    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Summarize developer worklog into 6–7 clear bullet points." },
        { role: "user", content: cleanedText },
      ],
    });

    const summary = summaryResponse.choices[0].message.content.trim();
    const prefix = botMentioned ? "[SUMMARY] This is work log summary\n" : "";
    const finalSummary = `${prefix}User: ${userName}\nProject: #${channelName}\n${summary}`;

    try {
      if (channelInfo?.is_member && channelId !== originChannelId) {
        await client.chat.postMessage({ channel: channelId, text: finalSummary });
      } else if (channelId === originChannelId) {
        console.log(`Skipping repost to same channel: #${channelName}`);
      } else {
        await client.chat.postMessage({
          channel: originChannelId,
          text: `I'm not a member of #${channelName}. Please invite me.`,
        });
      }
    } catch (error) {
      console.error(`Error sending to #${channelName}:`, error);
      await client.chat.postMessage({
        channel: originChannelId,
        text: `Couldn't send summary to #${channelName}`,
      });
    }
  }
});
//  Server Listen
app.listen(port, () => {
  console.log("Slack bot server running");
  console.log("OAuth URL:", oauthUrl);
});
