const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'ai',
  description: 'Chat with AI',
  usage: 'ai [message]',
  author: 'coffee',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim() || 'Hello';

    try {
      const { data } = await axios.get(API_URL, {
        params: { 
          prompt: prompt.replace(/ /g, '+'), // Replace spaces with + for URL
          model: 'openai-large',
          user: senderId 
        },
        timeout: 15000
      });

      if (!data?.status || typeof data.data !== 'string') {
        throw new Error('Invalid API response');
      }

      const aiResponse = makeBold(data.data.trim());
      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      const reason = error.response
        ? `API error ${error.response.status}`
        : error.message ?? 'Unknown error';

      console.error(`[ai] Failed for sender ${senderId}: ${reason}`);
      await sendMessage(senderId, {
        text: HEADER + '❌ Something went wrong. Please try again.' + FOOTER
      }, token);
    }
  }
};

const API_URL = 'https://api-library-kohi-production.up.railway.app/api/pollination-ai';
const MAX_CHUNK = 1900;

const HEADER = '🔍 Responses:';
const FOOTER = 'Created by GeoDevz69';

function makeBold(text) {
  return text.replace(/\*\*(.+?)\*\*/g, (_, word) =>
    [...word].map(char => {
      if (char >= 'a' && char <= 'z') return String.fromCharCode(char.charCodeAt(0) + 0x1D41A - 97);
      if (char >= 'A' && char <= 'Z') return String.fromCharCode(char.charCodeAt(0) + 0x1D400 - 65);
      if (char >= '0' && char <= '9') return String.fromCharCode(char.charCodeAt(0) + 0x1D7CE - 48);
      return char;
    }).join('')
  );
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
    let msg = chunks[i];
    if (i === 0) msg = HEADER + msg;
    if (i === chunks.length - 1) msg += FOOTER;
    await sendMessage(senderId, { text: msg }, token);
  }
}
