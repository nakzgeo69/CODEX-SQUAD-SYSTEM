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
      // Log the request URL for debugging
      const requestUrl = `${API_URL}?prompt=${encodeURIComponent(prompt)}&model=openai-large&user=${senderId}`;
      console.log('Fetching:', requestUrl);

      const { data } = await axios.get(API_URL, {
        params: { 
          prompt: prompt,
          model: 'openai-large',
          user: senderId 
        },
        timeout: 15000
      });

      // Log the full response for debugging
      console.log('API Response:', JSON.stringify(data, null, 2));

      // Check different possible response structures
      let aiResponse = null;
      
      if (data?.data) {
        aiResponse = data.data;
      } else if (data?.response) {
        aiResponse = data.response;
      } else if (data?.result) {
        aiResponse = data.result;
      } else if (typeof data === 'string') {
        aiResponse = data;
      } else if (data?.message) {
        aiResponse = data.message;
      }

      if (!aiResponse) {
        console.error('Unexpected response structure:', data);
        throw new Error('Could not extract AI response');
      }

      const formattedResponse = makeBold(aiResponse.trim());
      await sendChunks(senderId, formattedResponse, token);

    } catch (error) {
      let errorMessage = '❌ Something went wrong. Please try again.';
      
      if (error.response) {
        // The request was made and the server responded with a status code
        console.error('API Error Response:', {
          status: error.response.status,
          data: error.response.data
        });
        errorMessage = `❌ API Error: ${error.response.status}`;
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received:', error.request);
        errorMessage = '❌ No response from API server';
      } else {
        // Something happened in setting up the request
        console.error('Request Error:', error.message);
      }

      await sendMessage(senderId, {
        text: HEADER + errorMessage + FOOTER
      }, token);
    }
  }
};

const API_URL = 'https://api-library-kohi-production.up.railway.app/api/pollination-ai';
const MAX_CHUNK = 1900;

const HEADER = '💬 | 𝙶𝚛𝚘𝚔 𝙰𝚒\n・────────────・\n';
const FOOTER = '\n・──── >ᴗ< ─────・';

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
