/**
 * Anime Metadata Generator
 * Generates viral anime hooks, captions, descriptions, and hashtags tailored to each video.
 * Supports numbered reels (e.g., 1.mp4, 2.mp4, 003.mp4) with dynamic episodic titles.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const VIRAL_HOOKS = [
  "This scene still gives goosebumps every single time 🥶",
  "The aura in this scene was completely unmatched ⚡",
  "Peak animation quality. Rate this scene from 1 to 10 👇",
  "When the animation budget hits maximum overdrive 🤯",
  "This anime fight altered our brain chemistry ⚔️",
  "Can we all agree this was absolute cinema? 🔥",
  "The music timing with this scene was perfection 🎵",
  "Name a harder anime entrance... I will wait 🗿",
  "You cannot tell me this wasn't the best moment of the season 💥",
  "Top tier animation hitting different today 🥋",
  "The goosebumps never fade on this one 🌪️",
  "That one scene you can never skip no matter what 🏆"
];

const KNOWN_ANIME_KEYWORDS = [
  { match: /jujutsu|gojo|sukuna|itadori|megumi/i, name: "Jujutsu Kaisen", tag: "#jujutsukaisen #gojo #sukuna" },
  { match: /demon.?slayer|kimetsu|tanjiro|rengoku/i, name: "Demon Slayer", tag: "#demonslayer #kimetsunoyaiba #tanjiro" },
  { match: /attack.?on.?titan|aot|eren|levi|shingeki/i, name: "Attack on Titan", tag: "#attackontitan #aot #erenyeager" },
  { match: /dragon.?ball|dbz|dbs|goku|vegeta/i, name: "Dragon Ball", tag: "#dragonball #goku #dbz" },
  { match: /naruto|sasuke|itachi|kakashi|shippuden/i, name: "Naruto", tag: "#naruto #narutoshippuden #itachi" },
  { match: /one.?piece|luffy|zoro|sanji|gear5/i, name: "One Piece", tag: "#onepiece #luffy #zoro" },
  { match: /solo.?leveling|jinwoo|shadow.?monarch/i, name: "Solo Leveling", tag: "#sololeveling #sungjinwoo" },
  { match: /bleach|ichigo|aizen/i, name: "Bleach", tag: "#bleach #ichigo #aizen" },
  { match: /chainsaw.?man|denji|makima/i, name: "Chainsaw Man", tag: "#chainsawman #makima" },
  { match: /hunter|hxh|killua|gon/i, name: "Hunter x Hunter", tag: "#hunterxhunter #killua" }
];

export function generateMetadata(filePath) {
  const filename = path.basename(filePath, path.extname(filePath));
  
  // Extract number if named like 1.mp4, 2.mp4, reel_05.mp4
  const numberMatch = filename.match(/\d+/);
  const reelNumber = numberMatch ? parseInt(numberMatch[0], 10) : null;

  // Check if filename contains a known anime
  let detectedAnime = null;
  let customTags = "";

  for (const item of KNOWN_ANIME_KEYWORDS) {
    if (item.match.test(filename)) {
      detectedAnime = item.name;
      customTags = item.tag;
      break;
    }
  }

  // Pick a hook deterministically based on reelNumber or filename hash
  const hash = reelNumber !== null ? reelNumber : filename.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hook = VIRAL_HOOKS[hash % VIRAL_HOOKS.length];

  // Base hashtags
  const defaultHashtags = config.hashtags || [
    "#anime", "#animereels", "#animeedit", "#animeedits", "#otaku",
    "#animecommunity", "#amv", "#animelover", "#fyp", "#viral"
  ];

  const fullHashtags = Array.from(new Set([
    ...defaultHashtags,
    ...(customTags ? customTags.split(' ') : [])
  ])).join(' ');

  // 1. YouTube Shorts Title & Description
  let ytTitle = "";
  if (detectedAnime) {
    ytTitle = reelNumber 
      ? `${detectedAnime} #${reelNumber} hits different ⚡ #Shorts`
      : `${detectedAnime} edit that hits different ⚡ #Shorts`;
  } else if (reelNumber !== null) {
    ytTitle = `Anime Edit #${reelNumber} 🥶 | ${hook.slice(0, 40)} #Shorts`;
  } else {
    ytTitle = `${hook.slice(0, 50)}... #Shorts #Anime`;
  }
  
  if (ytTitle.length > 95) {
    ytTitle = ytTitle.substring(0, 92) + '...';
  }

  const ytDescription = (reelNumber !== null ? `Anime Reel #${reelNumber}\n\n` : '') +
    `${hook}\n\n` +
    `Drop your favorite anime in the comments below! 👇\n` +
    `Subscribe for daily high-quality anime clips and edits.\n\n` +
    `---\n` +
    `#Shorts #Anime #AnimeEdits #AnimeCommunity ${customTags}\n\n` +
    `*Disclaimer: All rights belong to respective studios and creators.*`;

  // 2. Instagram Reels Caption
  const igCaption = (reelNumber !== null ? `Anime Drop #${reelNumber} 🎬\n\n` : '') +
    `${hook}\n\n` +
    (detectedAnime ? `Anime: ${detectedAnime} ⚔️\n\n` : "") +
    `Rate this scene 1-10 in the comments! 💬\n` +
    `Save this reel & follow for daily anime drops 🔔\n\n` +
    `. \n. \n. \n` +
    `${fullHashtags}`;

  return {
    filename,
    reelNumber,
    detectedAnime,
    youtube: {
      title: ytTitle,
      description: ytDescription
    },
    instagram: {
      caption: igCaption
    }
  };
}
