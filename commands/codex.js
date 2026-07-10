const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'codex',
  description: 'Chat with Codex AI',
  usage: 'codex [message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim() || 'Hello';

    try {
      const { data } = await axios.get(API_URL, {
        params: { 
          prompt: prompt,
          model: 'codex'
        },
        timeout: 15000
      });

      if (!data?.answer) {
        throw new Error('Invalid API response');
      }

      const cleanResponse = cleanText(data.answer.trim());
      await sendChunks(senderId, cleanResponse, token);

    } catch (error) {
      const reason = error.response
        ? `API error ${error.response.status}`
        : error.message ?? 'Unknown error';

      console.error(`[codex] Failed for sender ${senderId}: ${reason}`);
      await sendMessage(senderId, {
        text: 'Server error. Please try again after 15.0s.'
      }, token);
    }
  }
};

const API_URL = 'https://yin-api.vercel.app/ai/chatgptfree';
const MAX_CHUNK = 1900;

function cleanText(text) {
  let cleaned = text;
  
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*/g, '');
  cleaned = cleaned.replace(/#{1,6}\s/g, '');
  cleaned = cleaned.replace(/---+/g, '');
  cleaned = cleaned.replace(/__/g, '');
  cleaned = cleaned.replace(/_/g, '');
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
  cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2000}-\u{206F}]/gu, '');
  cleaned = cleaned.replace(/[\u{2500}-\u{257F}]/gu, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.replace(/^[\s\n]+|[\s\n]+$/g, '');
  cleaned = cleaned.replace(/[^\x20-\x7E\n]/g, '');
  
  return cleaned.trim();
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
