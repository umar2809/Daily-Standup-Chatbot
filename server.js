require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { WebClient } = require("@slack/web-api");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const port = process.env.PORT || 4000;

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateAI = async (systemPrompt, userContent) => {
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userContent);
  return result.response.text().trim();
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== CODE REVIEW FUNCTIONS ====================

// Supported programming languages
const SUPPORTED_LANGUAGES = [
  "JavaScript", "TypeScript", "Python", "Java", "C++", "C#", "Go", "Rust",
   "Ruby", "Swift", "Kotlin", "HTML", "CSS", "SQL", "Shell/Bash"
];

// In-memory storage for code reviews
const codeReviewStorage = new Map();

// Analyze code for errors, bugs, and improvements
const analyzeCode = async (code, language) => {
  try {
    return await generateAI(
      `You are an expert code reviewer and ${language} developer. Analyze the following code and provide:
1. **Syntax Errors**: List any syntax errors found
2. **Logic Errors**: Identify potential logic bugs
3. **Security Issues**: Point out any security vulnerabilities (SQL injection, XSS, etc.)
4. **Best Practices**: Suggest improvements based on coding standards
5. **Performance**: Identify any performance issues
6. **Overall Score**: Rate the code quality from 1-10

Format your response clearly with headers for each section. Be concise but thorough.`,
      `Language: ${language}\n\nCode:\n\`\`\`\n${code}\n\`\`\``
    );
  } catch (error) {
    console.error("Error analyzing code:", error);
    return "Unable to analyze code. Please try again.";
  }
};

// Fix code errors automatically
const fixCode = async (code, language, errors) => {
  try {
    return await generateAI(
      `You are an expert ${language} developer. Fix the following code based on the errors identified. Return ONLY the corrected code without explanations.`,
      `Language: ${language}\n\nOriginal Code:\n\`\`\`\n${code}\n\`\`\`\n\nErrors to fix:\n${errors}`
    );
  } catch (error) {
    console.error("Error fixing code:", error);
    return null;
  }
};

// Detect programming language from code
const detectLanguage = async (code) => {
  try {
    return await generateAI(
      "Identify the programming language of the following code. Respond with ONLY the language name (e.g., 'JavaScript', 'Python', 'Java').",
      code
    );
  } catch (error) {
    console.error("Error detecting language:", error);
    return "Unknown";
  }
};

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

// ==================== SLASH COMMANDS ====================

// /codereview - Open code review modal
app.post("/slack/commands/codereview", async (req, res) => {
  const { user_id, user_name, channel_id, trigger_id } = req.body;
  res.status(200).send();

  try {
    await client.views.open({
      trigger_id,
      view: {
        type: "modal",
        callback_id: "codereview_modal",
        title: { type: "plain_text", text: "Code Review" },
        submit: { type: "plain_text", text: "Analyze Code" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "*AI-Powered Code Review*\nPaste your code below to check for errors, bugs, and get improvement suggestions." },
          },
          { type: "divider" },
          {
            type: "input",
            block_id: "language_select",
            label: { type: "plain_text", text: "Programming Language" },
            element: {
              type: "static_select",
              action_id: "selected_language",
              placeholder: { type: "plain_text", text: "Select language" },
              options: SUPPORTED_LANGUAGES.map((lang) => ({
                text: { type: "plain_text", text: lang },
                value: lang.toLowerCase().replace("/", "-"),
              })),
            },
          },
          {
            type: "input",
            block_id: "code_input",
            label: { type: "plain_text", text: "Your Code" },
            element: {
              type: "plain_text_input",
              action_id: "code_text",
              multiline: true,
              min_length: 10,
              placeholder: { type: "plain_text", text: "Paste your code here..." },
            },
          },
        ],
        private_metadata: JSON.stringify({ user_id, user_name, channel_id }),
      },
    });
  } catch (error) {
    console.error("Error opening code review modal:", error);
  }
});

// /quickreview - Quick code review from message
app.post("/slack/commands/quickreview", async (req, res) => {
  const { user_id, channel_id, text } = req.body;
  res.status(200).send();

  if (!text || text.trim().length < 10) {
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: "Please provide code to review. Usage: `/quickreview <your code>`\nFor better experience, use `/codereview` instead.",
    });
    return;
  }

  try {
    await client.chat.postEphemeral({
      channel: channel_id,
      user: user_id,
      text: "Analyzing your code... Please wait.",
    });

    const detectedLang = await detectLanguage(text);
    const analysis = await analyzeCode(text, detectedLang);

    // Store for auto-fix
    const reviewId = `${user_id}-${Date.now()}`;
    codeReviewStorage.set(reviewId, { code: text, language: detectedLang, analysis });

    // Get score from analysis
    const scoreMatch = analysis.match(/(\d+)\/10|Score[:\s]*(\d+)/i);
    const score = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : 5;
    const scoreEmoji = score >= 8 ? ":large_green_circle:" : score >= 5 ? ":large_yellow_circle:" : ":red_circle:";

    await client.chat.postMessage({
      channel: channel_id,
      blocks: [
        { type: "header", text: { type: "plain_text", text: "Code Review Results", emoji: true } },
        { type: "section", text: { type: "mrkdwn", text: `*Language:* ${detectedLang} | *Score:* ${scoreEmoji} ${score}/10` } },
        { type: "divider" },
        { type: "section", text: { type: "mrkdwn", text: analysis.length > 2900 ? analysis.substring(0, 2900) + "..." : analysis } },
        { type: "divider" },
        {
          type: "actions",
          elements: [
            { type: "button", text: { type: "plain_text", text: "Auto-Fix Code" }, style: "primary", action_id: "autofix_code", value: reviewId },
            { type: "button", text: { type: "plain_text", text: "Review Again" }, action_id: "review_again", value: reviewId },
          ],
        },
        { type: "context", elements: [{ type: "mrkdwn", text: `_Reviewed for <@${user_id}> | ${new Date().toLocaleString()}_` }] },
      ],
    });
  } catch (error) {
    console.error("Error in quick review:", error);
    await client.chat.postMessage({ channel: channel_id, text: "Sorry, couldn't analyze the code. Please try again." });
  }
});

// /help - Show all commands
app.post("/slack/commands/help", async (req, res) => {
  const { channel_id } = req.body;
  res.status(200).send();

  await client.chat.postMessage({
    channel: channel_id,
    blocks: [
      { type: "header", text: { type: "plain_text", text: "Daily Standup Bot - Help", emoji: true } },
      { type: "section", text: { type: "mrkdwn", text: "*Worklog Commands:*\n• Send any message to get an AI-powered summary\n• Mention `#channel` to send summary to that channel" } },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: "*Code Review Commands:*\n• `/codereview` - Open code editor modal\n• `/quickreview <code>` - Quick review from message" } },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: "*Code Review Features:*\n• 16+ languages supported\n• Syntax & logic error detection\n• Security vulnerability scanning\n• Best practices suggestions\n• Auto-fix code with AI\n• Quality score (1-10)" } },
      { type: "divider" },
      { type: "section", text: { type: "mrkdwn", text: "*Other Commands:*\n• `/help` - Show this help message" } },
    ],
  });
});

// ==================== INTERACTIVE COMPONENTS ====================

// Handle button clicks and modal submissions
app.post("/slack/interactions", async (req, res) => {
  const payload = JSON.parse(req.body.payload);
  res.status(200).send();

  try {
    // Handle modal submission
    if (payload.type === "view_submission" && payload.view.callback_id === "codereview_modal") {
      const values = payload.view.state.values;
      const code = values.code_input.code_text.value;
      const language = values.language_select.selected_language.selected_option.text.text;
      const metadata = JSON.parse(payload.view.private_metadata);
      const { user_id, channel_id } = metadata;

      const analysis = await analyzeCode(code, language);

      // Store for auto-fix
      const reviewId = `${user_id}-${Date.now()}`;
      codeReviewStorage.set(reviewId, { code, language, analysis });

      // Get score
      const scoreMatch = analysis.match(/(\d+)\/10|Score[:\s]*(\d+)/i);
      const score = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : 5;
      const scoreColor = score >= 8 ? "#36a64f" : score >= 5 ? "#f2c744" : "#e01e5a";
      const scoreEmoji = score >= 8 ? ":large_green_circle:" : score >= 5 ? ":large_yellow_circle:" : ":red_circle:";

      await client.chat.postMessage({
        channel: channel_id,
        attachments: [{
          color: scoreColor,
          blocks: [
            { type: "header", text: { type: "plain_text", text: `Code Review - ${language}`, emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: `*Submitted by:* <@${user_id}> | *Score:* ${scoreEmoji} ${score}/10` } },
            { type: "divider" },
            { type: "section", text: { type: "mrkdwn", text: `*Your Code:*\n\`\`\`${code.length > 500 ? code.substring(0, 500) + "..." : code}\`\`\`` } },
            { type: "divider" },
            { type: "section", text: { type: "mrkdwn", text: `*Analysis:*\n${analysis.length > 2500 ? analysis.substring(0, 2500) + "..." : analysis}` } },
            { type: "divider" },
            {
              type: "actions",
              elements: [
                { type: "button", text: { type: "plain_text", text: "Auto-Fix Code" }, style: "primary", action_id: "autofix_code", value: reviewId },
                { type: "button", text: { type: "plain_text", text: "Review Again" }, action_id: "review_again", value: reviewId },
                { type: "button", text: { type: "plain_text", text: "Approve" }, action_id: "approve_code", value: reviewId },
              ],
            },
            { type: "context", elements: [{ type: "mrkdwn", text: `_${new Date().toLocaleString()}_` }] },
          ],
        }],
      });
    }

    // Handle button clicks
    if (payload.type === "block_actions") {
      const action = payload.actions[0];
      const user = payload.user;

      // Auto-Fix Code
      if (action.action_id === "autofix_code") {
        const reviewId = action.value;
        const reviewData = codeReviewStorage.get(reviewId);

        if (!reviewData) {
          await client.chat.postEphemeral({ channel: payload.channel.id, user: user.id, text: "Review data expired. Please submit a new code review." });
          return;
        }

        await client.chat.postEphemeral({ channel: payload.channel.id, user: user.id, text: "Auto-fixing your code... Please wait." });

        const fixedCode = await fixCode(reviewData.code, reviewData.language, reviewData.analysis);

        if (fixedCode) {
          await client.chat.postMessage({
            channel: payload.channel.id,
            thread_ts: payload.message.ts,
            blocks: [
              { type: "header", text: { type: "plain_text", text: "Auto-Fixed Code", emoji: true } },
              { type: "section", text: { type: "mrkdwn", text: `*Language:* ${reviewData.language}` } },
              { type: "section", text: { type: "mrkdwn", text: `\`\`\`${fixedCode.length > 2800 ? fixedCode.substring(0, 2800) + "..." : fixedCode}\`\`\`` } },
              { type: "context", elements: [{ type: "mrkdwn", text: `_Fixed for <@${user.id}> | ${new Date().toLocaleString()}_` }] },
            ],
          });
        } else {
          await client.chat.postEphemeral({ channel: payload.channel.id, user: user.id, text: "Couldn't auto-fix the code. The issues might require manual intervention." });
        }
      }

      // Review Again
      if (action.action_id === "review_again") {
        const reviewId = action.value;
        const reviewData = codeReviewStorage.get(reviewId);

        if (!reviewData) {
          await client.chat.postEphemeral({ channel: payload.channel.id, user: user.id, text: "Review data expired. Please submit a new code review." });
          return;
        }

        await client.chat.postEphemeral({ channel: payload.channel.id, user: user.id, text: "Re-analyzing your code..." });

        const newAnalysis = await analyzeCode(reviewData.code, reviewData.language);
        reviewData.analysis = newAnalysis;
        codeReviewStorage.set(reviewId, reviewData);

        await client.chat.postMessage({
          channel: payload.channel.id,
          thread_ts: payload.message.ts,
          blocks: [
            { type: "header", text: { type: "plain_text", text: "Re-Analysis Results", emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: newAnalysis.length > 2800 ? newAnalysis.substring(0, 2800) + "..." : newAnalysis } },
            { type: "context", elements: [{ type: "mrkdwn", text: `_Re-reviewed for <@${user.id}> | ${new Date().toLocaleString()}_` }] },
          ],
        });
      }

      // Approve Code
      if (action.action_id === "approve_code") {
        await client.reactions.add({ channel: payload.channel.id, timestamp: payload.message.ts, name: "white_check_mark" });
        await client.chat.postMessage({
          channel: payload.channel.id,
          thread_ts: payload.message.ts,
          text: `<@${user.id}> approved this code!`,
        });
      }
    }
  } catch (error) {
    console.error("Error handling interaction:", error);
  }
});

// ==================== SLACK EVENTS ====================

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

    const summary = await generateAI(
      "Summarize the following worklog into exactly 6–7 clear bullet points. Each point should represent a distinct task or update.",
      cleanedText
    );
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

    const summary = await generateAI(
      "Summarize the following worklog into 6–7 clear bullet points.",
      cleanedText
    );
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
    text: `Couldn't send summary to #${channelName}.`,
  });
}
  }
});
//  Server Listen
app.listen(port, () => {
  console.log("Slack bot server running");
  console.log("OAuth URL:", oauthUrl);
});
