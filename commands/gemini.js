const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Auto-analyze images and solve puzzles using Gemini AI',
  usage: 'Send an image and the bot will auto-analyze it',
  version: '2.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let imageUrl = await extractImageUrl(event, token);

      if (!imageUrl) {
        return;
      }

      console.log('[gemini] Processing image:', imageUrl);

      // Detect if it's a puzzle based on args or image content
      let prompt = 'Analyze this image';
      
      // Check if user specified a puzzle type
      const userPrompt = args.join(' ').toLowerCase();
      if (userPrompt.includes('sudoku') || userPrompt.includes('puzzle') || userPrompt.includes('solve')) {
        prompt = 'Solve this puzzle. Identify the numbers and provide the complete solution.';
      } else if (userPrompt.includes('math') || userPrompt.includes('equation')) {
        prompt = 'Solve this math equation and provide the answer.';
      } else if (userPrompt.includes('translate')) {
        prompt = 'Translate the text in this image to English.';
      } else if (userPrompt.includes('identify') || userPrompt.includes('what is')) {
        prompt = 'Identify what is in this image and describe it in detail.';
      }

      const encodedPrompt = encodeURIComponent(prompt);
      const encodedImageUrl = encodeURIComponent(imageUrl);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}&imageurl=${encodedImageUrl}`;

      const response = await axios.get(apiUrl, {
        timeout: 60000,
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.status === 200 && response.data) {
        const data = response.data;
        
        let cleanResponse = data.response || 'No response from Gemini API.';
        
        cleanResponse = cleanResponse
          .replace(/^I'm a Gemini.*?model.*?\n\n?/i, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/#{1,6}\s/g, '')
          .replace(/`/g, '')
          .replace(/_/g, '')
          .replace(/~{2}/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        if (!cleanResponse) {
          cleanResponse = 'No valid response from Gemini API.';
        }

        // Add formatting for puzzle solutions
        if (userPrompt.includes('sudoku') || userPrompt.includes('puzzle')) {
          cleanResponse = formatPuzzleResponse(cleanResponse);
        }

        const chunks = splitMessage(cleanResponse, 1900);
        for (const chunk of chunks) {
          await sendMessage(senderId, { text: chunk }, token);
        }
        
      } else {
        throw new Error('Invalid response from Gemini API');
      }
      
    } catch (error) {
      console.error('[gemini] Error:', error.message);

      let errorMessage = 'Error analyzing image. ';
      
      if (error.response?.status === 400) {
        errorMessage = 'Invalid image format. Please send a valid image.';
      } else if (error.response?.status === 500) {
        errorMessage = 'The API server is currently unavailable. Please try again later.';
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. The image may be too large.';
      } else {
        errorMessage += error.message || 'Failed to connect to the API.';
      }

      await sendMessage(senderId, {
        text: errorMessage
      }, token);
    }
  }
};

async function extractImageUrl(event, token) {
  try {
    if (event?.message?.reply_to?.mid) {
      return await getRepliedImage(event.message.reply_to.mid, token);
    } 
    
    if (event?.message?.attachments && event.message.attachments.length > 0) {
      for (const attachment of event.message.attachments) {
        if (attachment.type === 'image' || attachment.type === 'photo') {
          return attachment.payload?.url || attachment.url || null;
        }
      }
    }
  } catch (err) {
    console.error('[Image Extraction] Failed:', err);
  }
  return null;
}

async function getRepliedImage(mid, token) {
  try {
    const url = `https://graph.facebook.com/v21.0/${mid}/attachments`;
    const params = {
      access_token: token
    };
    const { data } = await axios.get(url, { params });
    
    if (data?.data && data.data.length > 0) {
      const attachment = data.data[0];
      return attachment?.image_data?.url || attachment?.url || null;
    }
    return null;
  } catch (err) {
    console.error('[Replied Image] Failed:', err.response?.data || err.message);
    return null;
  }
}

function formatPuzzleResponse(text) {
  // Try to extract grid/numbers from response
  const lines = text.split('\n');
  let formatted = '';
  let gridStarted = false;
  
  for (const line of lines) {
    // Check if line contains numbers in a grid pattern
    if (line.match(/\d+\s+\d+\s+\d+\s+\d+/)) {
      gridStarted = true;
      formatted += line + '\n';
    } else if (gridStarted && line.trim() === '') {
      gridStarted = false;
    } else if (!gridStarted) {
      formatted += line + '\n';
    }
  }
  
  return formatted || text;
}

function splitMessage(text, maxLength) {
  maxLength = maxLength || 1900;
  const chunks = [];
  
  if (text.length <= maxLength) {
    return [text];
  }
  
  const lines = text.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > maxLength) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}
