const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://api-library-kohi-production.up.railway.app/api/publicai';
const MAX_CHUNK = 2000;

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

      // Convert **text** to Messenger bold format (*text*)
      aiResponse = aiResponse.replace(/\*\*(.+?)\*\*/g, '*$1*');
      
      // Remove other markdown symbols but keep bold
      aiResponse = aiResponse.replace(/\*/g, '');
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

      // Add header for code requests
      const isCodeRequest = /<|>|\{|\}|function|class|const|let|var|<\?php|<!DOCTYPE|import|export|def|async|await|=>|#include|public class|System.out|SELECT|INSERT|UPDATE|DELETE|package|func|fn|interface|type|\.css|\.jsx|\.tsx/.test(prompt);
      if (isCodeRequest) {
        aiResponse = '' + aiResponse;
      }

      // Send full response in chunks with proper handling
      await sendChunks(senderId, aiResponse, token);

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

function splitMessage(text) {
  const chunks = [];
  // Ensure we don't cut code blocks in half
  const lines = text.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    // If adding this line would exceed MAX_CHUNK, push current chunk and start new one
    if ((currentChunk + line + '\n').length > MAX_CHUNK) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      // If a single line exceeds MAX_CHUNK, split it
      if (line.length > MAX_CHUNK) {
        for (let i = 0; i < line.length; i += MAX_CHUNK) {
          chunks.push(line.slice(i, i + MAX_CHUNK));
        }
      } else {
        currentChunk = line + '\n';
      }
    } else {
      currentChunk += line + '\n';
    }
  }
  
  // Push the last chunk if it exists
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  
  // If only one chunk, send it directly
  if (chunks.length === 1) {
    await sendMessage(senderId, { text: chunks[0] }, token);
    return;
  }
  
  // Send multiple chunks with part indicators
  for (let i = 0; i < chunks.length; i++) {
    let chunkText = chunks[i];
    
    // Add part indicator for multi-chunk responses
    if (chunks.length > 1) {
      chunkText = `[Part ${i+1}/${chunks.length}]\n${chunkText}`;
    }
    
    await sendMessage(senderId, { text: chunkText }, token);
    
    // Add delay between chunks to avoid rate limiting
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
