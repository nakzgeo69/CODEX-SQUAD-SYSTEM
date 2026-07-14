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

      // Build prompt based on user input
      const userPrompt = args.join(' ').toLowerCase();
      let prompt = '';

      // Detect puzzle type
      if (userPrompt.includes('sudoku') || userPrompt.includes('soduko')) {
        prompt = 'This is a Sudoku puzzle. Solve it completely. Provide ONLY the solved grid in this exact format:\nRow 1: number number number...\nRow 2: number number number...\n(up to Row 9). Do not include any analysis, explanations, or descriptions. Just the solved grid.';
      } else if (userPrompt.includes('sequence') || userPrompt.includes('sequential') || userPrompt.includes('order')) {
        prompt = 'This is a sequence/ordering puzzle. Provide ONLY the correct sequence or order of events. Do not include any analysis or explanations. Just the sequence.';
      } else if (userPrompt.includes('math') || userPrompt.includes('equation') || userPrompt.includes('calculate')) {
        prompt = 'Solve this math problem. Provide ONLY the final answer. Do not include any explanations.';
      } else if (userPrompt.includes('translate')) {
        prompt = 'Translate the text in this image to English. Provide ONLY the translation. Do not include any explanations.';
      } else if (userPrompt.includes('identify') || userPrompt.includes('what is') || userPrompt.includes('object')) {
        prompt = 'Identify what is in this image. Provide ONLY the name and brief description. Do not include extra text.';
      } else if (userPrompt.includes('logic') || userPrompt.includes('reasoning')) {
        prompt = 'Solve this logic puzzle. Provide ONLY the final answer or solution. Do not include any analysis or explanations.';
      } else if (userPrompt.includes('pattern') || userPrompt.includes('next')) {
        prompt = 'Find the next item in the pattern. Provide ONLY the answer. Do not include any explanations.';
      } else if (userPrompt.includes('crossword') || userPrompt.includes('word')) {
        prompt = 'Solve this word puzzle. Provide ONLY the answers. Do not include any explanations.';
      } else if (userPrompt.includes('memory') || userPrompt.includes('recall')) {
        prompt = 'Analyze this memory/recall puzzle. Provide ONLY the correct recall sequence. Do not include any explanations.';
      } else if (userPrompt.includes('tower') || userPrompt.includes('hanoi')) {
        prompt = 'Solve this Tower of Hanoi puzzle. Provide ONLY the step-by-step moves. Do not include any explanations.';
      } else if (userPrompt.includes('chess') || userPrompt.includes('checkmate')) {
        prompt = 'Solve this chess puzzle. Provide ONLY the winning move or sequence. Do not include any explanations.';
      } else if (userPrompt.includes('riddle')) {
        prompt = 'Solve this riddle. Provide ONLY the answer. Do not include any explanations.';
      } else {
        prompt = 'Analyze this image. Provide ONLY the direct answer or solution. If it is a puzzle, solve it. Do not include any analysis, explanations, or descriptions. Just give the answer.';
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

        // Format based on puzzle type
        if (userPrompt.includes('sudoku')) {
          cleanResponse = formatSudokuResponse(cleanResponse);
        } else if (userPrompt.includes('sequence') || userPrompt.includes('sequential')) {
          cleanResponse = formatSequenceResponse(cleanResponse);
        } else if (userPrompt.includes('tower') || userPrompt.includes('hanoi')) {
          cleanResponse = formatTowerResponse(cleanResponse);
        } else if (userPrompt.includes('chess')) {
          cleanResponse = formatChessResponse(cleanResponse);
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

function formatSudokuResponse(text) {
  // Extract numbers from text
  const numbers = text.match(/\d+/g);
  if (numbers && numbers.length >= 81) {
    let formatted = 'Solved Sudoku:\n\n';
    for (let i = 0; i < 9; i++) {
      const row = numbers.slice(i * 9, (i + 1) * 9);
      formatted += 'Row ' + (i + 1) + ': ' + row.join('   ') + '\n';
    }
    return formatted;
  }
  return text;
}

function formatSequenceResponse(text) {
  // Clean up sequence response
  const lines = text.split('\n');
  let formatted = 'Sequence:\n\n';
  let sequenceFound = false;
  
  for (const line of lines) {
    if (line.match(/\d+/) || line.match(/step|event|order/i)) {
      formatted += line.trim() + '\n';
      sequenceFound = true;
    }
  }
  
  return sequenceFound ? formatted : text;
}

function formatTowerResponse(text) {
  // Format Tower of Hanoi steps
  const moves = text.match(/\d+\s*->\s*\d+/g);
  if (moves && moves.length > 0) {
    let formatted = 'Tower of Hanoi Solution:\n\n';
    moves.forEach((move, index) => {
      formatted += 'Step ' + (index + 1) + ': Move ' + move + '\n';
    });
    return formatted;
  }
  return text;
}

function formatChessResponse(text) {
  // Extract chess moves
  const moves = text.match(/[KQRBNP]?[a-h][1-8][x-]?[a-h][1-8]|[O-O-O]|[O-O]/g);
  if (moves && moves.length > 0) {
    let formatted = 'Chess Solution:\n\n';
    moves.forEach((move, index) => {
      formatted += (index + 1) + '. ' + move + ' ';
      if ((index + 1) % 2 === 0) formatted += '\n';
    });
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
