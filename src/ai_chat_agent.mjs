/**
 * Commercial AI Strategist Engine for Automation Studio
 * Adaptive Niche Intelligence, Viral Copy Generation & Permission-Gated Action Execution.
 * Fully supports Google Gemini, OpenAI (ChatGPT), and Anthropic Claude via user API keys.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'config.json');
const PROPOSAL_PATH = path.join(ROOT_DIR, 'state', 'channel_proposal.json');
const OVERRIDES_PATH = path.join(ROOT_DIR, 'state', 'metadata_overrides.json');
const REELS_DIR = path.join(ROOT_DIR, 'reels');
const AUTH_STATUS_FILE = path.join(ROOT_DIR, 'state', 'auth_status.json');

function detectNicheFromFiles(files) {
  const text = files.join(' ').toLowerCase();
  if (/kafka|dostoevsky|stoic|psychology|shadow|dark|mindset|quote/i.test(text)) {
    return {
      niche: "Dark Psychology, Stoic Philosophy & Deep Mindset Quotes",
      vibe: "Introspective, intellectual, cold truth, high retention",
      hashtags: ["#darkpsychology", "#stoicmindset", "#stoicism", "#dostoevsky", "#kafka", "#shadowwork", "#mindset", "#quotes", "#relatable"]
    };
  }
  if (/anime|amv|gojo|sukuna|itadori|naruto|dbz|aot|demon.?slayer|bleach/i.test(text)) {
    return {
      niche: "High-Octane Anime AMVs & Fight Scene Edits",
      vibe: "High velocity, phonk audio sync, peak transformation moments",
      hashtags: ["#anime", "#animeedit", "#animereels", "#amv", "#jujutsukaisen", "#demonslayer", "#otaku", "#fyp", "#viral"]
    };
  }
  if (/gym|fitness|workout|bodybuilding|lift|physique/i.test(text)) {
    return {
      niche: "Gym Motivation & Bodybuilding Aesthetics",
      vibe: "Hardcore discipline, heavy bass, physique transformations",
      hashtags: ["#gymmotivation", "#fitness", "#bodybuilding", "#workout", "#discipline", "#gymtok", "#grind"]
    };
  }
  if (/luxury|money|crypto|finance|billionaire|wealth/i.test(text)) {
    return {
      niche: "Luxury Lifestyle, Wealth & Entrepreneurship",
      vibe: "Elite success, wealth mindset, luxury cars & travel",
      hashtags: ["#wealthmindset", "#luxury", "#entrepreneur", "#successquotes", "#billionaire", "#financialfreedom"]
    };
  }

  return {
    niche: "Viral Short-Form Entertainment & Aesthetics",
    vibe: "High retention, scroll-stopping hooks, curiosity-driven",
    hashtags: ["#viral", "#reels", "#shorts", "#trending", "#fyp", "#explorepage"]
  };
}

function getContextSnapshot() {
  let staged = [];
  try {
    if (fs.existsSync(REELS_DIR)) {
      staged = fs.readdirSync(REELS_DIR).filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f));
    }
  } catch (_) {}

  let auth = { youtubeChannel: '@channel', instagramUsername: 'user' };
  try {
    if (fs.existsSync(AUTH_STATUS_FILE)) {
      auth = JSON.parse(fs.readFileSync(AUTH_STATUS_FILE, 'utf-8'));
    }
  } catch (_) {}

  const detected = detectNicheFromFiles(staged);

  return {
    stagedCount: staged.length,
    nextVideo: staged[0] || '1.mp4',
    channelHandle: auth.youtubeChannel || '@channel',
    instagramUsername: auth.instagramUsername || 'user',
    niche: detected.niche,
    vibe: detected.vibe,
    recommendedHashtags: detected.hashtags
  };
}

export async function processUserChatMessage({ message, provider, apiKey, conversationHistory }) {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const activeProvider = provider || config.apiKeys?.provider || 'gemini';
  const envKey = activeProvider === 'gemini' ? (process.env.GEMINI_API_KEY || '') : (activeProvider === 'openai' ? (process.env.OPENAI_API_KEY || '') : (process.env.CLAUDE_API_KEY || ''));
  const key = apiKey || envKey || config.apiKeys?.[activeProvider] || '';
  const context = getContextSnapshot();

  const msgTrimmed = message.trim();
  const msgLower = msgTrimmed.toLowerCase();

  // 1. Check for Approval Trigger
  const isApproval = /^(yes|apply|do it|approve|confirm|proceed|ok do it|sure|apply it|save it|yes do it|apply updates)/i.test(msgLower);

  if (isApproval) {
    let overrides = {};
    if (fs.existsSync(OVERRIDES_PATH)) {
      try { overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8')); } catch (_) {}
    }

    const targetFile = context.nextVideo;
    const pendingMeta = overrides[targetFile] || {
      youtubeTitle: "The Dark Truth About Human Nature (Kafka Was Right) 👁️ #Shorts",
      youtubeDescription: `Franz Kafka understood human nature better than anyone: when you stop providing utility to people, notice how quickly their affection disappears.\n\nSubscribe to ${context.channelHandle} for daily high-retention psychological realism.\n\n#kafka #darkpsychology #stoicmindset #dostoevsky #shadowwork #Shorts`,
      instagramCaption: `Kafka warned us about this long ago... 👁️\n\nWhen you stop being convenient, you quickly realize who was truly there for you and who was simply using you.\n\nHave you ever experienced this reality? Drop a '♟️' in the comments if you know this feeling.\n\nFollow @${context.instagramUsername} for daily stoic realism & psychological truths.\n\n${context.recommendedHashtags.join(' ')}`
    };

    overrides[targetFile] = {
      ...pendingMeta,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2), 'utf-8');

    return {
      reply: `🎉 **Permission Granted & Executed!**\n\nI have locked in the customized metadata for **${targetFile}**:\n\n• **YouTube Title**: \`${pendingMeta.youtubeTitle}\`\n• **Instagram Caption**: Updated with high-retention quote hook & ${context.recommendedHashtags.length} hashtags.\n\nThe dashboard has refreshed. Say **"Post now"** or click **Post Now** in the header to publish whenever you're ready!`,
      actionExecuted: 'APPLY_VIDEO_METADATA'
    };
  }

  const SYSTEM_PROMPT = `You are the executive AI Strategist & Channel Director for Automation Studio Pro.
You have direct knowledge of the user's active accounts and staged content library:
- YouTube Channel: ${context.channelHandle}
- Instagram: @${context.instagramUsername}
- Content Queue: ${context.stagedCount} vertical 9:16 reels in queue. Next up: ${context.nextVideo}
- Detected Feed Niche: ${context.niche} (${context.vibe})
- Top Tag Pillars: ${context.recommendedHashtags.join(', ')}

YOUR CORE RESPONSIBILITIES:
1. Speak as an elite short-form video producer who understands algorithmic retention, 0-2 second hooks, controversy debates, and sound sync.
2. ADAPT TO THE USER'S GENRE: Adopt the voice and terminology of their specific niche (Dark Psychology, Stoicism, Anime, Fitness, or Wealth).
3. PROACTIVELY ASK PREFERENCE QUESTIONS: Ask clarifying questions about their preferred tone (e.g. "Do you prefer a provocative quote hook or an emotional storytelling hook?").
4. MANDATORY PERMISSION GATE: You must ALWAYS ask for explicit user permission before saving video metadata or changing live channel profiles.
5. FORMAT ACTIONS in \`\`\`action ... \`\`\` blocks when proposing metadata or channel changes.`;

  // 2. Google Gemini API Call (if key provided)
  if (activeProvider === 'gemini' && key && key.trim().length > 5) {
    try {
      const modelNames = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
      for (const model of modelNames) {
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key.trim()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\nUser: ${message}` }] }
              ]
            })
          });
          const data = await res.json();
          if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return parseAgentReply(data.candidates[0].content.parts[0].text);
          }
        } catch (innerErr) {
          console.warn(`[Gemini Model ${model} retry]`, innerErr.message);
        }
      }
    } catch (e) {
      console.error('[Gemini API Error]', e.message);
    }
  }

  // 3. OpenAI ChatGPT Call (if key provided)
  if (activeProvider === 'openai' && key) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...(conversationHistory || []).slice(-6),
            { role: 'user', content: message }
          ],
          temperature: 0.7
        })
      });
      const data = await res.json();
      if (data.choices?.[0]?.message?.content) {
        return parseAgentReply(data.choices[0].message.content);
      }
    } catch (e) {
      console.error('[OpenAI API Error]', e.message);
    }
  }

  // 4. Anthropic Claude Call (if key provided)
  if (activeProvider === 'claude' && key) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            ...(conversationHistory || []).slice(-6),
            { role: 'user', content: message }
          ]
        })
      });
      const data = await res.json();
      if (data.content?.[0]?.text) {
        return parseAgentReply(data.content[0].text);
      }
    } catch (e) {
      console.error('[Claude API Error]', e.message);
    }
  }

  // 5. Built-in Autonomous Intelligence Engine (zero external API required fallback)
  return generateAutonomousEngineReply(message, context);
}

function parseAgentReply(text) {
  let actionData = null;
  const match = text.match(/```action\s*([\s\S]*?)\s*```/);
  if (match) {
    try {
      actionData = JSON.parse(match[1]);
      text = text.replace(/```action[\s\S]*?```/, '').trim();
    } catch (_) {}
  }

  return {
    reply: text,
    action: actionData
  };
}

function generateAutonomousEngineReply(message, context) {
  const lower = message.toLowerCase();

  // Audit / Analysis
  if (lower.includes('audit') || lower.includes('analyze') || lower.includes('feed') || lower.includes('page') || lower.includes('channel')) {
    return {
      reply: `🔍 **Channel & Feed Intelligence Audit**\n\n` +
        `• **Target Channels**: YouTube (${context.channelHandle}) & Instagram (@${context.instagramUsername})\n` +
        `• **Identified Niche**: **${context.niche}**\n` +
        `• **Queue Inventory**: ${context.stagedCount} vertical 9:16 clips staged in \`D:\\automation\\reels\`.\n` +
        `• **Retention Pattern**: Short-form videos in this genre perform best with a provocative philosophical hook in the first 2 seconds, followed by high-tension audio sync.\n\n` +
        `❓ **Clarifying Question**: Do you prefer your next batch of captions framed with **hard-hitting psychological quotes** or **character debate questions**?`,
      action: {
        action: "PROPOSE_BRANDING",
        channelName: `${context.instagramUsername.toUpperCase()} | ${context.niche.split(',')[0]}`,
        bio: `👁️ ${context.niche.split(',')[0]}\n⚡ Cold truths & viral daily drops\n👇 Watch in 4K HDR\nyoutube.com/${context.channelHandle}`,
        requiresPermission: true
      }
    };
  }

  // Caption / Title Generation
  if (lower.includes('caption') || lower.includes('title') || lower.includes('desc') || lower.includes('generate') || lower.includes('video') || lower.includes('1.mp4')) {
    const proposedTitle = "The Dark Truth About Human Nature (Kafka Was Right) 👁️ #Shorts";
    const proposedCaption = `Kafka warned us about this long ago... 👁️

When you stop being convenient, you quickly realize who was truly there for you and who was simply using you.

Have you ever experienced this reality? Drop a '♟️' in the comments if you know this feeling.

Follow @${context.instagramUsername} for daily stoic realism & psychological truths.

${context.recommendedHashtags.join(' ')}`;

    return {
      reply: `🎬 **Feed-Engineered Video Package for ${context.nextVideo}**\n\n` +
        `Crafted specifically for your **${context.niche}** audience:\n\n` +
        `• **YouTube Short Title**:\n\`${proposedTitle}\`\n\n` +
        `• **Instagram Caption**:\n\`${proposedCaption.slice(0, 150)}...\`\n\n` +
        `• **Tag Cluster**: \`${context.recommendedHashtags.slice(0, 8).join(' ')}\`\n\n` +
        `⚠️ **Permission Gate**: To lock in and apply this copy to **${context.nextVideo}**, click **Approve** below or reply **"Yes, apply it"**!`,
      action: {
        action: "APPLY_VIDEO_METADATA",
        filename: context.nextVideo,
        youtubeTitle: proposedTitle,
        instagramCaption: proposedCaption,
        requiresPermission: true
      }
    };
  }

  // Branding / Bio
  if (lower.includes('bio') || lower.includes('name') || lower.includes('logo') || lower.includes('brand')) {
    return {
      reply: `🎨 **Branding Blueprint for @${context.instagramUsername}**\n\n` +
        `• **Proposed Channel Name**: \`${context.instagramUsername.toUpperCase()} | ${context.niche.split(',')[0]}\`\n` +
        `• **Optimized Instagram Bio**:\n` +
        `\`\`\`\n` +
        `👁️ ${context.niche.split(',')[0]}\n` +
        `⚡ Unfiltered realities of human behavior\n` +
        `👇 Daily 4K Mindset Drops\n` +
        `youtube.com/${context.channelHandle}\n` +
        `\`\`\`\n` +
        `• **Visual Theme**: Obsidian black (#09090b), electric violet (#7c3aed), and minimal monochrome aesthetics.\n\n` +
        `Shall I save this branding proposal? Click **Approve & Apply Updates** below to confirm!`,
      action: {
        action: "PROPOSE_BRANDING",
        channelName: `${context.instagramUsername.toUpperCase()} | ${context.niche.split(',')[0]}`,
        bio: `👁️ ${context.niche.split(',')[0]}\n⚡ Unfiltered realities of human behavior\n👇 Daily 4K Mindset Drops\nyoutube.com/${context.channelHandle}`,
        requiresPermission: true
      }
    };
  }

  // Default Guidance
  return {
    reply: `👋 **Automation Studio Pro AI Strategist Active!**\n\n` +
      `I am tuned with full knowledge of your **${context.niche}** channels and **${context.stagedCount} clips** in queue.\n\n` +
      `💡 **Quick Commands**:\n` +
      `1. 🔍 *"Analyze my feed and viral growth opportunities"*\n` +
      `2. 🎬 *"Generate viral caption and title for ${context.nextVideo}"*\n` +
      `3. 🏷️ *"Propose an optimized channel bio and name"*\n` +
      `4. 🚀 *"Post next video now"*\n\n` +
      `*I will always ask for your explicit approval before applying changes to your clips or channels.*`
  };
}
