const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'gemini',
  description: 'Chat with Gemini 2.5 Flash',
  usage: 'gemini [prompt]',
  author: 'codex',

  async execute(senderId, args, token, attachment) {
    let prompt = args.join(' ').trim();
    let imageUrl = null;

    if (attachment && attachment.type === 'image') {
      imageUrl = attachment.payload.url;
    }

    if (!prompt) {
      await sendMessage(senderId, {
        text: 'Please provide a prompt.'
      }, token);
      return;
    }

    try {
      const response = await axios.post('https://api.gemini.com/api/send', {
        model: 'gemini-2.5-flash',
        prompt: prompt,
        imageurl: imageUrl || null
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response?.data?.response) {
        throw new Error('Invalid API response');
      }

      let aiResponse = response.data.response.trim();
      
      aiResponse = aiResponse.replace(/\*\*(.+?)\*\*/g, '*$1*');
      aiResponse = aiResponse.replace(/#{1,6}\s/g, '');
      aiResponse = aiResponse.replace(/---+/g, '');
      aiResponse = aiResponse.replace(/__/g, '');
      aiResponse = aiResponse.replace(/_/g, '');
      aiResponse = aiResponse.replace(/\*{3,}/g, '**');
      aiResponse = aiResponse.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
      aiResponse = aiResponse.replace(/[\u{2600}-\u{27BF}]/gu, '');
      aiResponse = aiResponse.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
      aiResponse = aiResponse.replace(/\n{3,}/g, '\n\n');
      aiResponse = aiResponse.replace(/[ \t]+/g, ' ');
      aiResponse = aiResponse.trim();

      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      const reason = error.response
        ? `API error ${error.response.status}`
        : error.message ?? 'Unknown error';

      console.error(`[Gemini] Failed for sender ${senderId}: ${reason}`);
      await sendMessage(senderId, {
        text: 'Server error. Please try again after 15.0s.'
      }, token);
    }
  }
};

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
