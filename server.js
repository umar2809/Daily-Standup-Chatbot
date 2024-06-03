require("dotenv").config();
const { OpenAI } = require("openai");
const { App } = require("@slack/bolt");

const signingSecret = process.env.SLACK_SIGNING_SECRET;
const botToken = process.env.SLACK_BOT_TOKEN;
const port = process.env.PORT || 4000;

const app = new App({
  signingSecret: signingSecret,
  token: botToken,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

app.message(async ({ message, say, context, client }) => {
  if (message.subtype && message.subtype === "bot_message") {
    return;
  }

  if (message.text && message.text.includes(`<@${context.botUserId}>`)) {
    return;
  }

  const channelMentions = [];
  const channelMentionPattern = /<#(\w+)\|(\w+)>/g;

  const matches = message.text.match(channelMentionPattern);
  if (!matches) {
    await say("No channels mentioned.");
    return;
  }

  for (const match of matches) {
    const [, channelId, channelName] = match.match(/<#(\w+)\|(\w+)>/);
    channelMentions.push({ channelId, channelName });
  }

  const originChannelId = message.channel;

  const messageChunks = message.text.split(channelMentionPattern);

  for (let i = 0; i < channelMentions.length; i++) {
    const { channelId, channelName } = channelMentions[i];
    const text = messageChunks[i * 3 + 3].trim();

    const summaryResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that summarizes worklogs into short paragraphs. The first line is the project name",
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    console.log(summaryResponse.choices);

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
        await say("Cannot send message to the same channel it was sent from.");
      } else {
        await say(
          `Sorry, I am not a member of the channel named ${channelName}.`
        );
      }
    } catch (error) {
      console.error(error);
      await say(
        `Sorry, <@${message.user}>, I couldn't send a message to the channel.`
      );
    }
  }
});

(async () => {
  try {
    await app.start(port);
    console.log(`Server running on port ${port}`);
  } catch (error) {
    console.error(`Failed to start server: ${error}`);
  }
})();
