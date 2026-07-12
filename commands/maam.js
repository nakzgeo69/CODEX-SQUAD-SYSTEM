const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://api-library-kohi-production.up.railway.app/api/copilot';
const MAX_CHUNK = 1900;

const userCooldowns = new Map();
const COOLDOWN_TIME = 5000;

module.exports = {
  name: ['maam', 'copilot', 'ask'],
  description: 'Chat with Teacher Arlene',
  usage: 'maam [message]',
  version: '1.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim();

    if (!prompt) {
      await sendMessage(senderId, {
        text: 'Copilot AI\n\nUsage: maam [message]\n\nExamples:\n  maam what is machine learning\n  maam sino ang pumatay kay lapu-lapu\n  maam explain quantum physics'
      }, token);
      return;
    }

    const now = Date.now();
    const lastUsed = userCooldowns.get(senderId);

    if (lastUsed && (now - lastUsed) < COOLDOWN_TIME) {
      const remaining = Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000);
      await sendMessage(senderId, {
        text: 'Please wait ' + remaining + ' seconds before using this command again.'
      }, token);
      return;
    }

    userCooldowns.set(senderId, now);

    await sendMessage(senderId, {
      text: ''
    }, token);

    try {
      const response = await callCopilotAPI(prompt);

      if (response) {
        const cleaned = cleanResponse(response);
        await sendChunks(senderId, cleaned, token);
      } else {
        await sendMessage(senderId, {
          text: 'No response from API. Please try again later.'
        }, token);
      }

    } catch (error) {
      console.error('[maam] Error:', error.message);

      let errorMessage = 'Server error. Please try again later.';

      if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Access denied. API key may be invalid.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. The API is currently down.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Please try again.';
      }

      await sendMessage(senderId, {
        text: errorMessage
      }, token);
    }
  }
};

async function callCopilotAPI(prompt, maxRetries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log('[maam] Attempt ' + attempt + ' for:', prompt);

      const encodedPrompt = encodeURIComponent(prompt);
      const url = API_URL + '?prompt=' + encodedPrompt;

      const { data } = await axios.get(url, {
        timeout: 30000,
        headers: {
          'Accept': 'application/json'
        }
      });

      console.log('[maam] Response status:', data?.status);

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
        console.log('[maam] Waiting ' + delay + 'ms before retry...');
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
