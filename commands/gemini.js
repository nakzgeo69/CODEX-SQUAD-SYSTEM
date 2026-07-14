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

      // Detect puzzle type from args
      const userPrompt = args.join(' ').toLowerCase();
      let prompt = '';

      if (userPrompt.includes('sudoku') || userPrompt.includes('soduko')) {
        prompt = 'This is a Sudoku puzzle. Solve it. Provide ONLY the solved grid in this format: Row 1: numbers, Row 2: numbers, etc. No explanations.';
      } else if (userPrompt.includes('sequence') || userPrompt.includes('sequential')) {
        prompt = 'Find the pattern and provide the next numbers in the sequence. Provide ONLY the answer. No explanations.';
      } else if (userPrompt.includes('math') || userPrompt.includes('equation')) {
        prompt = 'Solve this math problem. Provide ONLY the final answer. No explanations.';
      } else if (userPrompt.includes('logic')) {
        prompt = 'Solve this logic puzzle. Provide ONLY the final answer. No explanations.';
      } else if (userPrompt.includes('pattern')) {
        prompt = 'Find the next item in the pattern. Provide ONLY the answer. No explanations.';
      } else {
        prompt = 'Analyze this image. Provide a direct, concise answer. No explanations.';
      }

      const encodedPrompt = encodeURIComponent(prompt);
      const encodedImageUrl = encodeURIComponent(imageUrl);
      
      // Use faster API endpoint
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}&imageurl=${encodedImageUrl}`;

      const response = await axios.get(apiUrl, {
        timeout: 30000, // Reduced from 60s to 30s
        headers: {
          'Accept': 'application/json'
        }
      });

      if (response.status === 200 && response.data) {
        const data = response.data;
        
        let cleanResponse = data.response || 'No response from Gemini API.';
        
        // Clean the response
        cleanResponse = cleanResponse
          .replace(/^I'm a Gemini.*?model.*?\n\n?/i, '')
          .replace(/^Here is.*?\n/i, '')
          .replace(/^The image displays.*?\n/i, '')
          .replace(/^Initial Observations.*?\n/i, '')
          .replace(/^Analyzing Potential.*?\n/i, '')
          .replace(/^Testing the Core.*?\n/i, '')
          .replace(/^Conclusion.*?\n/i, '')
          .replace(/^Therefore.*?\n/i, '')
          .replace(/^\*\*/g, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/#{1,6}\s/g, '')
          .replace(/`/g, '')
          .replace(/_/g, '')
          .replace(/~{2}/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

        // Format response based on puzzle type
        if (userPrompt.includes('sudoku')) {
          cleanResponse = formatSudokuResponse(cleanResponse);
        } else if (userPrompt.includes('sequence')) {
          cleanResponse = formatSequenceResponse(cleanResponse);
        }

        if (!cleanResponse) {
          cleanResponse = 'No valid response from Gemini API.';
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
      
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        errorMessage = 'The image is too large or the server is taking too long. Please try compressing the image or using a smaller file.';
      } else if (error.response?.status === 400) {
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
  // Extract numbers from text
  const numbers = text.match(/\d+/g);
  if (numbers && numbers.length >= 81) {
    let formatted = 'Solved Sudoku:\n\n';
    for (let i = 0; i < 9; i++) {
      const row = numbers.slice(i * 9, (i + 1) * 9);
      formatted += 'Row ' + (i + 1) + ': ' + row.join(' ') + '\n';
    }
    return formatted;
  }
  return text;
}

function formatSequenceResponse(text) {
  // Extract sequence numbers
  const numbers = text.match(/-?\d+/g);
  if (numbers && numbers.length > 0) {
    let formatted = 'Sequence Solution:\n\n';
    formatted += 'Numbers: ' + numbers.join(', ') + '\n';
    
    // Try to find pattern
    if (numbers.length >= 3) {
      const diff1 = parseInt(numbers[1]) - parseInt(numbers[0]);
      const diff2 = parseInt(numbers[2]) - parseInt(numbers[1]);
      if (diff1 === diff2) {
        const next = parseInt(numbers[numbers.length - 1]) + diff1;
        formatted += 'Pattern: Add ' + diff1 + ' each step\n';
        formatted += 'Next number: ' + next;
      } else {
        formatted += 'Pattern: ' + text;
      }
    }
    return formatted;
  }
  return text;
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
