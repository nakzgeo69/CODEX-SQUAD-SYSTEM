const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'ai',
  description: 'Chat with AI',
  usage: 'gpt4 [message]',
  author: 'coffee',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim() || 'Hello';

    try {
      // Using the new publicai endpoint
      const { data } = await axios.get(API_URL, {
        params: { 
          prompt: prompt,
          user: senderId 
        },
        timeout: 15000
      });

      // Check for a successful response with the 'data' field
      if (!data?.status || typeof data.data !== 'string') {
        console.error('Unexpected API response:', data);
        throw new Error('Invalid response structure from API');
      }

      const aiResponse = makeBold(data.data.trim());
      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error(`[ai] Error for sender ${senderId}:`, error.message);
      
      let userMessage = '❌ Something went wrong. Please try again.';
      if (error.response) {
        userMessage = `❌ API Error: ${error.response.status}`;
      } else if (error.code === 'ECONNABORTED') {
        userMessage = '❌ Request timed out. Please try again.';
      }

      await sendMessage(senderId, {
        text: HEADER + userMessage + FOOTER
      }, token);
    }
  }
};

// Updated to the new publicai endpoint
const API_URL = 'https://api-library-kohi-production.up.railway.app/api/publicai';
const MAX_CHUNK = 1900;

const HEADER = '\n';
const FOOTER = '';

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
