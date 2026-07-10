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
      const { data } = await axios.get(API_URL, {
        params: {
          prompt: prompt,
          user: '123'
        },
        timeout: 120000
      });

      if (!data?.data) {
        throw new Error('Invalid API response');
      }

      let aiResponse = data.data.trim();

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

      if (aiResponse.length > MAX_CHUNK) {
        await sendLongMessage(senderId, aiResponse, token);
      } else {
        await sendMessage(senderId, { text: aiResponse }, token);
      }

    } catch (error) {
      const reason = error.response
        ? `API error ${error.response.status}`
        : error.message ?? 'Unknown error';

      console.error(`[codex] Failed for sender ${senderId}: ${reason}`);
      await sendMessage(senderId, {
        text: 'Server error. Please try again later.'
      }, token);
    }
  }
};

function splitIntoChunks(text) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let isInCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```') || line.trim().endsWith('```')) {
      isInCodeBlock = !isInCodeBlock;
    }

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
