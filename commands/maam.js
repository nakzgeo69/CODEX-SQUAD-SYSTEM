const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://api-library-kohi-production.up.railway.app/api/copilot';
const MAX_CHUNK = 1900;

const userCooldowns = new Map();
const COOLDOWN_TIME = 5000;

module.exports = {
  name: ['maam', 'copilot', 'ask'],
  description: 'Chat with Copilot AI',
  usage: 'maam [message]',
  version: '1.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim();

    if (!prompt) {
      await sendMessage(senderId, {
        text: 'Usage: maam [message]\n\nExamples:\n  maam what is machine learning\n  maam sino ang pumatay kay lapu-lapu'
      }, token);
      return;
    }

    const now = Date.now();
    const lastUsed = userCooldowns.get(senderId);

    if (lastUsed && (now - lastUsed) < COOLDOWN_TIME) {
      const remaining = Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000);
      await sendMessage(senderId, {
        text: 'Please wait ' + remaining + ' seconds.'
      }, token);
      return;
    }

    userCooldowns.set(senderId, now);

    try {
      const response = await callAPI(prompt);

      if (response) {
        const cleaned = cleanResponse(response);
        await sendChunks(senderId, cleaned, token);
      } else {
        await sendMessage(senderId, {
          text: 'No response. Please try again.'
        }, token);
      }

    } catch (error) {
      console.error('[maam] Error:', error.message);

      let errorMessage = 'Server error. Please try again.';

      if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server down. Please try again later.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Please try again.';
      }

      await sendMessage(senderId, {
        text: errorMessage
      }, token);
    }
  }
};

async function callAPI(prompt, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const encodedPrompt = encodeURIComponent(prompt);
      const url = API_URL + '?prompt=' + encodedPrompt;

      const { data } = await axios.get(url, {
        timeout: 30000,
        headers: {
          'Accept': 'application/json'
        }
      });

      if (data?.status === true && data?.data?.text) {
        return data.data.text;
      }

      if (data?.data?.response) {
        return data.data.response;
      }

      if (data?.answer) {
        return data.answer;
      }

      if (typeof data === 'string') {
        return data;
      }

      throw new Error('Invalid response format');

    } catch (error) {
      console.error('[maam] Attempt ' + attempt + ' failed:', error.message);
      lastError = error;

      if (attempt < maxRetries) {
        const delay = attempt * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed.');
}

function cleanResponse(text) {
  if (!text) return 'No response.';

  let cleaned = text.trim();

  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
  cleaned = cleaned.replace(/#{1,6}\s*/g, '');
  cleaned = cleaned.replace(/---+/g, '');
  cleaned = cleaned.replace(/__/g, '');
  cleaned = cleaned.replace(/_/g, '');
  cleaned = cleaned.replace(/`/g, '');
  cleaned = cleaned.replace(/```/g, '');
  cleaned = cleaned.replace(/~~/g, '');
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  
  // Remove all emojis
  cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F700}-\u{1F77F}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F780}-\u{1F7FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F800}-\u{1F8FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F900}-\u{1F9FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{1FA00}-\u{1FA6F}]/gu, '');
  cleaned = cleaned.replace(/[\u{1FA70}-\u{1FAFF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/[\u{24C2}-\u{1F251}]/gu, '');
  
  cleaned = cleaned.trim();

  return cleaned || 'No response.';
}

function splitMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }
  return chunks;
}

async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    await sendMessage(senderId, { text: chunks[i] }, token);
  }
}
