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

      const userPrompt = args.join(' ').toLowerCase();
      let prompt = '';

      if (userPrompt.includes('sudoku') || userPrompt.includes('soduko')) {
        prompt = 'This is a Sudoku puzzle. Solve it completely. Provide the FULL SOLVED GRID with Row 1 to Row 9. Then briefly explain the key steps. The answer must include the complete solved grid.';
      } else if (userPrompt.includes('sequence') || userPrompt.includes('arithmetic')) {
        prompt = 'This is an arithmetic sequence. Solve it completely. Find the common difference, the number of terms, and provide the COMPLETE SEQUENCE. Show the formula and final answer.';
      } else if (userPrompt.includes('math') || userPrompt.includes('equation')) {
        prompt = 'Solve this math problem. Show the solution steps and provide the FINAL ANSWER.';
      } else if (userPrompt.includes('logic')) {
        prompt = 'Solve this logic puzzle. Explain the reasoning and provide the FINAL ANSWER.';
      } else if (userPrompt.includes('pattern')) {
        prompt = 'Find the pattern and provide the next items.';
      } else {
        prompt = 'Analyze this image. If it is a puzzle, SOLVE it and provide the COMPLETE SOLUTION. Provide the FINAL ANSWER.';
      }

      const encodedPrompt = encodeURIComponent(prompt);
      const encodedImageUrl = encodeURIComponent(imageUrl);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}&imageurl=${encodedImageUrl}`;

      // Shorter timeout para iwas tagal
      const response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.status === 200 && response.data) {
        const data = response.data;
        
        let cleanResponse = data.response || 'No response from Gemini API.';
        
        cleanResponse = cleanResponse
          .replace(/^I'm a Gemini.*?model.*?\n\n?/i, '')
          .replace(/^Here is.*?\n/i, '')
          .replace(/^The image displays.*?\n/i, '')
          .replace(/^This is a.*?\n/i, '')
          .replace(/^Let me analyze.*?\n/i, '')
          .replace(/^Based on my analysis.*?\n/i, '')
          .replace(/^I can see that.*?\n/i, '')
          .replace(/^Upon examination.*?\n/i, '')
          .replace(/^After analyzing.*?\n/i, '')
          .replace(/^The image shows.*?\n/i, '')
          .replace(/^It appears to be.*?\n/i, '')
          .replace(/^Looking at this.*?\n/i, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/#{1,6}\s/g, '')
          .replace(/`/g, '')
          .replace(/_/g, '')
          .replace(/~{2}/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        if (userPrompt.includes('sudoku')) {
          cleanResponse = formatSudokuResponse(cleanResponse);
        } else if (userPrompt.includes('sequence')) {
          cleanResponse = formatSequenceResponse(cleanResponse);
        }

        if (!cleanResponse || cleanResponse.length < 10) {
          cleanResponse = 'Unable to solve. Please try again with a clearer image.';
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

      // Specific error for timeout
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        await sendMessage(senderId, {
          text: 'The image is too large. Please send a smaller image or try again with a compressed image.'
        }, token);
        return;
      }

      let errorMessage = 'Error analyzing image. ';
      
      if (error.response?.status === 400) {
        errorMessage = 'Invalid image format. Please send a valid image.';
      } else if (error.response?.status === 500) {
        errorMessage = 'The API server is currently unavailable. Please try again later.';
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment.';
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

function formatSudokuResponse(text) {
  let formatted = 'SOLVED SUDOKU\n\n';
  
  const numbers = text.match(/\d+/g);
  
  if (numbers && numbers.length >= 81) {
    formatted += 'COMPLETE SOLUTION:\n';
    for (let i = 0; i < 9; i++) {
      const row = numbers.slice(i * 9, (i + 1) * 9);
      formatted += 'Row ' + (i + 1) + ': ' + row.join('  ') + '\n';
    }
    formatted += '\n';
    
    const explanation = text.replace(/[\d\s]+/g, '').trim();
    if (explanation && explanation.length > 10) {
      formatted += 'EXPLANATION:\n' + explanation.substring(0, 300) + '\n';
    }
  } else if (numbers && numbers.length >= 36) {
    formatted += 'COMPLETE SOLUTION:\n';
    for (let i = 0; i < 6; i++) {
      const row = numbers.slice(i * 6, (i + 1) * 6);
      formatted += 'Row ' + (i + 1) + ': ' + row.join('  ') + '\n';
    }
    formatted += '\n';
    
    const explanation = text.replace(/[\d\s]+/g, '').trim();
    if (explanation && explanation.length > 10) {
      formatted += 'EXPLANATION:\n' + explanation.substring(0, 300) + '\n';
    }
  } else {
    formatted += text;
  }
  
  return formatted;
}

function formatSequenceResponse(text) {
  let formatted = 'SEQUENCE SOLUTION\n\n';
  
  const numbers = text.match(/-?\d+/g);
  
  if (numbers && numbers.length >= 2) {
    formatted += 'COMPLETE SEQUENCE:\n' + numbers.join(', ') + '\n\n';
    
    const diff = parseInt(numbers[1]) - parseInt(numbers[0]);
    if (!isNaN(diff) && numbers.length >= 2) {
      formatted += 'Common Difference: ' + diff + '\n';
      formatted += 'Number of Terms: ' + numbers.length + '\n';
      
      const last = parseInt(numbers[numbers.length - 1]);
      const next1 = last + diff;
      const next2 = next1 + diff;
      const next3 = next2 + diff;
      formatted += 'Next Terms: ' + next1 + ', ' + next2 + ', ' + next3 + '\n';
    }
    
    const explanation = text.replace(/[\d,\s-]+/g, '').trim();
    if (explanation && explanation.length > 10) {
      formatted += '\nEXPLANATION:\n' + explanation.substring(0, 300);
    }
  } else {
    formatted += text;
  }
  
  return formatted;
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
