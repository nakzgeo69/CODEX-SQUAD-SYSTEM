const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'realtime',
  description: 'Chat with AI',
  usage: 'realtime [message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    const message = args.join(' ').trim() || 'Hello';

    try {
      const { data } = await axios.get(API_URL, {
        params: { 
          message: message,
          model: 'gpt-5'
        },
        timeout: 15000
      });

      if (!data?.answer) {
        throw new Error('Invalid API response');
      }

      const aiResponse = data.answer.trim();
      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      const reason = error.response
        ? `API error ${error.response.status}`
        : error.message ?? 'Unknown error';

      console.error(`[ai] Failed for sender ${senderId}: ${reason}`);
      await sendMessage(senderId, {
        text: 'Please try again after 15.0s.'
      }, token);
    }
  }
};

const API_URL = 'https://yin-api.vercel.app/ai/copilot';
const MAX_CHUNK = 1900;

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
