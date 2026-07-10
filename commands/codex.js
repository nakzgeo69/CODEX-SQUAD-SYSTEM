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
    const prompt = args.join(' ').trim();

    if (!prompt) {
      await sendMessage(senderId, { 
        text: 'Usage: codex [your code/question]' 
      }, token);
      return;
    }

    try {
      const { data } = await axios.get(API_URL, {
        params: {
          prompt: prompt,
          user: '123'
        },
        timeout: 120000
      });

      if (!data?.data) {
        throw new Error('Invalid API response structure');
      }

      let aiResponse = data.data.trim();
      
      // Clean response
      aiResponse = cleanResponse(aiResponse);
      
      // Check if response is empty after cleaning
      if (!aiResponse) {
        throw new Error('Empty response after cleaning');
      }

      // Send response in chunks
      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error(`[codex] Error for sender ${senderId}:`, error.message);
      
      const errorMessage = error.response 
        ? `API Error (${error.response.status}): Service temporarily unavailable`
        : error.code === 'ECONNABORTED' 
          ? 'Request timeout. Please try again.'
          : 'Sorry, an error occurred. Please try again later.';
      
      await sendMessage(senderId, { text: errorMessage }, token);
    }
  }
};

/**
 * Clean and format AI response text
 * @param {string} text - Raw AI response
 * @returns {string} - Cleaned text
 */
function cleanResponse(text) {
  return text
    // Remove bold markers but keep content
    .replace(/\*\*(.+?)\*\*/g, '$1')
    
    // Remove italic markers (single asterisk) but preserve multiplication and pointers
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    
    // Remove headers (lines starting with #)
    .replace(/^#{1,6}\s/gm, '')
    
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    
    // Remove code block markers (triple backticks)
    .replace(/```\w*\n?/g, '')
    
    // Remove inline code markers (single backtick) but preserve content
    .replace(/`(.+?)`/g, '$1')
    
    // Remove bold/italic with underscores but preserve variable names
    .replace(/___(.+?)___/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1')
    
    // Remove emoji and special unicode characters
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation Selectors
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols
    .replace(/[\u{1F018}-\u{1F270}]/gu, '') // Various symbols
    
    // Clean up whitespace
    .replace(/\n{3,}/g, '\n\n')             // Multiple newlines to double
    .replace(/[ \t]{2,}/g, ' ')             // Multiple spaces to single
    .replace(/^\s+|\s+$/gm, '')             // Trim each line
    .trim();
}

/**
 * Split long text into chunks without breaking lines
 * @param {string} text - Text to split
 * @returns {string[]} - Array of text chunks
 */
function splitMessage(text) {
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    const lineWithNewline = line + '\n';
    
    // If adding this line would exceed max chunk size
    if ((currentChunk.length + lineWithNewline.length) > MAX_CHUNK) {
      // Save current chunk if not empty
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // If single line is longer than MAX_CHUNK, split it
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

  // Add remaining chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Send message in multiple chunks with delay
 * @param {string} senderId - Recipient ID
 * @param {string} text - Full message text
 * @param {string} token - Authentication token
 */
async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  
  for (let i = 0; i < chunks.length; i++) {
    try {
      await sendMessage(senderId, { text: chunks[i] }, token);
      
      // Add delay between chunks (except last one)
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    } catch (error) {
      console.error(`[codex] Failed to send chunk ${i + 1}/${chunks.length}:`, error.message);
      // Continue sending remaining chunks even if one fails
    }
  }
}
