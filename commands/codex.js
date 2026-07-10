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

      // Remove all explanatory text before code
      const lines = aiResponse.split('\n');
      let codeStart = -1;
      let foundCode = false;
      
      // Find first line that looks like code
      const codePatterns = [
        /^<\?php/,
        /^<!DOCTYPE/,
        /^<html/,
        /^function /,
        /^class /,
        /^const /,
        /^let /,
        /^var /,
        /^import /,
        /^export /,
        /^def /,
        /^async /,
        /^#include/,
        /^public class/,
        /^SELECT /,
        /^package /,
        /^func /,
        /^fn /,
        /^interface /,
        /^type /,
        /^using /,
        /^namespace /,
        /^#!\/usr\/bin/,
        /^#!/,
        /^# -*- coding:/,
        /^from /,
        /^require\(/,
        /^const {/,
        /^export default/
      ];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) continue;
        
        for (const pattern of codePatterns) {
          if (pattern.test(line)) {
            codeStart = i;
            foundCode = true;
            break;
          }
        }
        if (foundCode) break;
      }

      // If code found, extract from that point
      if (foundCode && codeStart !== -1) {
        aiResponse = lines.slice(codeStart).join('\n');
      }

      // Remove markdown code blocks if present
      aiResponse = aiResponse.replace(/```(\w+)?\n/g, '');
      aiResponse = aiResponse.replace(/```/g, '');
      aiResponse = aiResponse.replace(/""/g, '');
      
      // Remove markdown symbols
      aiResponse = aiResponse.replace(/\*\*(.+?)\*\*/g, '$1');
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

      // If response is empty, send error
      if (!aiResponse) {
        throw new Error('No code found in response');
      }

      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      const reason = error.response
        ? `API error ${error.response.status}`
        : error.message ?? 'Unknown error';

      console.error(`[codex] Failed for sender ${senderId}: ${reason}`);
      await sendMessage(senderId, {
        text: 'Unable to generate code. Please try again with a clearer request.'
      }, token);
    }
  }
};

function splitMessage(text) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    if ((currentChunk + line + '\n').length > MAX_CHUNK) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
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
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  
  for (let i = 0; i < chunks.length; i++) {
    await sendMessage(senderId, { text: chunks[i] }, token);
    
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }
}
