require("dotenv").config();
const { OpenAI } = require("openai");
const express = require("express");
const axios = require("axios");
const { WebClient } = require("@slack/web-api");

const app = express();

const botToken = process.env.SLACK_BOT_TOKEN;

const clientSecret = process.env.CLIENT_SECRET;

const port = process.env.PORT || 4000;

const clientId = process.env.CLIENT_ID;

const redirectUri = process.env.REDIRECT_URI;

const client = new WebClient(botToken);

app.use(express.json());

const scope =
  "app_mentions:read,channels:history,chat:write,groups:history,im:history,mpim:history,channels:join,channels:read,groups:read,mpim:read,im:read";

const oauthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${encodeURIComponent(
  scope
)}&redirect_uri=${encodeURIComponent(redirectUri)}`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get("/slack/oauth_redirect", async (req, res) => {
  const { code } = req.query;

  try {
    const response = await axios.post(
      "https://slack.com/api/oauth.v2.access",
      null,
      {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        },
      }
    );

    if (response.data.ok) {
      const accessToken = response.data.access_token;
      res.send("Authorization successful! You can close this window.");
    } else {
      res.send(`Error: ${response.data.error}`);
    }
  } catch (error) {
    console.error("Error during Slack OAuth:", error);
    res.status(500).send("Internal Server Error");
  }
});

const getChannelInfoById = async (client, channelId) => {
  try {
    const result = await client.conversations.info({ channel: channelId });
    return result.channel;
  } catch (error) {
    console.error("Error fetching channel info:", error);
    return null;
  }
};

app.post("/slack/events", async (req, res) => {
  if (req.body.type === "url_verification") {
    res.send({ challenge: req.body.challenge });
    return;
  }

  res.sendStatus(200);

  const { event, authorizations } = req.body;

  if (!event || event.type !== "message") {
    console.log("Event is not a message or event is undefined");
    return;
  }

  const botUserId = authorizations[0].user_id;

  if (event.user === botUserId) {
    console.log("Message is a bot message or mentions the bot itself");
    return;
  }

  const channelMentions = [];
  const channelMentionPattern = /<#(\w+)\|(\w+)>/g;

  const originChannelId = event.channel;
  const messageChunks = event.text.split(channelMentionPattern);

  const matches = event.text.match(channelMentionPattern);

  if (!matches) {
    const text = messageChunks[0]?.trim();

    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes worklogs into short paragraphs with 3 to 4 lines. The first line is the project name and always summarize the worklog in the form of a e to 4 lines short paragraph.",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const summary = summaryResponse.choices[0].message.content.trim();

    await client.chat.postMessage({
      channel: event.channel,
      text: `This is work log summary\n${summary}`,
    });
    return 0;
  }

  for (const match of matches) {
    const [, channelId, channelName] = match.match(/<#(\w+)\|(\w+)>/);
    channelMentions.push({ channelId, channelName });
  }

  for (let i = 0; i < channelMentions.length; i++) {
    const { channelId, channelName } = channelMentions[i];
    const text = messageChunks[i * 3 + 3]?.trim(); // Ensure this is defined

    if (!text) {
      console.log(`No text found for channel mention ${channelName}`);
      continue;
    }

    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes worklogs into short paragraphs. The first line is the project name and always summarize the worklog in the form of a short paragraph.",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const summary = summaryResponse.choices[0].message.content.trim();

    try {
      const channelInfo = await getChannelInfoById(client, channelId);

      if (
        channelInfo &&
        channelInfo.is_member &&
        channelId !== originChannelId
      ) {
        await client.chat.postMessage({
          channel: channelId,
          text: `This is work log summary\n${summary}`,
        });
      } else if (channelId === originChannelId) {
        await client.chat.postMessage({
          channel: originChannelId,
          text: "Cannot send message to the same channel it was sent from.",
        });
      } else {
        await client.chat.postMessage({
          channel: originChannelId,
          text: `Sorry, I am not a member of the channel named ${channelName}.`,
        });
      }
    } catch (error) {
      console.error(`Error posting message to channel ${channelName}:`, error);
      await client.chat.postMessage({
        channel: originChannelId,
        text: `Sorry, <@${event.user}>, I couldn't send a message to the channel ${channelName}.`,
      });
    }
  }
});

const server = app.listen(port, () => {
  console.log("OAuth URL:", oauthUrl);
});
