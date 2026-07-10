const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://api-library-kohi-production.up.railway.app/api/publicai';
const MAX_CHUNK = 8000;
const CHUNK_DELAY = 1000;

module.exports = {
  name: 'codex',
  description: 'Advanced Code Assistant & Debugger',
  usage: 'codex [code/message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim() || 'Hello';

    try {
      const response = await axios.get(API_URL, {
        params: {
          prompt: prompt,
          user: '123'
        },
        timeout: 120000
      });

      console.log('API Response Status:', response.status);
      console.log('API Response Data:', JSON.stringify(response.data).substring(0, 200));

      if (!response.data) {
        throw new Error('No data received from API');
      }

      if (!response.data.data) {
        console.error('Invalid response structure:', response.data);
        throw new Error('Invalid API response structure');
      }

      let aiResponse = response.data.data.trim();

      if (!aiResponse || aiResponse.length < 10) {
        console.error('Empty or too short response:', aiResponse);
        throw new Error('API returned empty response');
      }

      aiResponse = aiResponse.replace(/\*\*(.+?)\*\*/g, '$1');
      aiResponse = aiResponse.replace(/\*/g, '');
      aiResponse = aiResponse.replace(/#{1,6}\s/g, '');
      aiResponse = aiResponse.replace(/---+/g, '');
      aiResponse = aiResponse.replace(/__/g, '');
      aiResponse = aiResponse.replace(/_/g, '');
      aiResponse = aiResponse.replace(/```/g, '');
      aiResponse = aiResponse.replace(/""/g, '');
      aiResponse = aiResponse.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
      aiResponse = aiResponse.replace(/[\u{2600}-\u{27BF}]/gu, '');
      aiResponse = aiResponse.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
      aiResponse = aiResponse.replace(/\n{3,}/g, '\n\n');
      aiResponse = aiResponse.replace(/[ \t]+/g, ' ');
      aiResponse = aiResponse.trim();

      console.log('Processed response length:', aiResponse.length);

      if (aiResponse.length > MAX_CHUNK) {
        await sendLongMessage(senderId, aiResponse, token);
      } else {
        await sendMessage(senderId, { text: aiResponse }, token);
      }

    } catch (error) {
      console.error('[codex] Full error:', error);
      console.error('[codex] Error message:', error.message);
      console.error('[codex] Error stack:', error.stack);

      let errorMessage = 'Server error. Please try again later.';

      if (error.response) {
        console.error('[codex] Response status:', error.response.status);
        console.error('[codex] Response data:', error.response.data);
        errorMessage = `API Error ${error.response.status}: ${error.response.data?.message || 'Unknown error'}`;
      } else if (error.request) {
        console.error('[codex] No response received');
        errorMessage = 'No response from API server. Please try again.';
      } else {
        console.error('[codex] Request setup error:', error.message);
        errorMessage = `Request error: ${error.message}`;
      }

      await sendMessage(senderId, {
        text: errorMessage
      }, token);
    }
  }
};

function splitIntoChunks(text) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    const lineWithNewline = line + '\n';
    
    if ((currentChunk + lineWithNewline).length > MAX_CHUNK) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }

      if (line.length > MAX_CHUNK) {
        for (let i = 0; i < line.length; i += MAX_CHUNK) {
          chunks.push(line.slice(i, i + MAX_CHUNK));
        }
      } else {
        currentChunk = lineWithNewline;
      }
    } else {
      currentChunk += lineWithNewline;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function sendLongMessage(senderId, text, token) {
  const chunks = splitIntoChunks(text);
  const totalChunks = chunks.length;

  for (let i = 0; i < totalChunks; i++) {
    let messageText = chunks[i];

    if (totalChunks > 1) {
      messageText = `[Part ${i + 1}/${totalChunks}]\n\n${messageText}`;
    }

    await sendMessage(senderId, { text: messageText }, token);

    if (i < totalChunks - 1) {
      await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));
    }
  }
}
