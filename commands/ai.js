const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'gpt4',
  description: 'Chat with Teacher Arlene',
  usage: 'gpt4 [message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim() || 'Hello';

    try {
      const { data } = await axios.get(API_URL, {
        params: { 
          prompt: prompt,
          model: 'chatgpt4'
        },
        timeout: 15000
      });

      if (!data?.answer) {
        throw new Error('Invalid API response');
      }

      let aiResponse = data.answer.trim();
      
      // Convert **text** to Messenger bold format (*text*)
      aiResponse = aiResponse.replace(/\*\*(.+?)\*\*/g, '*$1*');
      
      // Remove other markdown symbols but keep bold
      aiResponse = aiResponse.replace(/\*/g, ''); // Remove single asterisks
      aiResponse = aiResponse.replace(/#{1,6}\s/g, '');
      aiResponse = aiResponse.replace(/---+/g, '');
      aiResponse = aiResponse.replace(/__/g, '');
      aiResponse = aiResponse.replace(/_/g, '');
      
      // Remove emojis
      aiResponse = aiResponse.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
      aiResponse = aiResponse.replace(/[\u{2600}-\u{27BF}]/gu, '');
      aiResponse = aiResponse.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
      
      // Clean up extra spaces and newlines
      aiResponse = aiResponse.replace(/\n{3,}/g, '\n\n');
      aiResponse = aiResponse.replace(/[ \t]+/g, ' ');
      aiResponse = aiResponse.trim();

      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      const reason = error.response
        ? `API error ${error.response.status}`
        : error.message ?? 'Unknown error';

      console.error(`[ai] Failed for sender ${senderId}: ${reason}`);
      await sendMessage(senderId, {
        text: 'Server error. Please try again after 15.0s.'
      }, token);
    }
  }
};

const API_URL = 'https://yin-api.vercel.app/ai/chatgptfree';
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
