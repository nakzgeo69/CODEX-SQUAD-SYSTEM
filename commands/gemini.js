const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// Master API List with Fallbacks
const API_LIST = [
  'https://apiv-c7yb.onrender.com/api/gemini-vision',
  'https://betadash-api-swordslush-production.up.railway.app/opera',
  'https://norch-project.gleeze.com/api/gemini'
];

module.exports = {
  name: ['gemini', 'vision', 'analyze', 'solve', 'compute', 'visualize'],
  description: 'Analyze, visualize, solve, and compute using AI',
  usage: 'Send an image or text and type "gemini"',
  version: '3.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let imageUrl = await extractImageUrl(event, token);
      const userPrompt = args.join(' ') || '';

      let prompt = buildPrompt(userPrompt);

      if (!imageUrl && !userPrompt) {
        await sendMessage(senderId, {
          text: 'Usage: gemini [question/problem]\n\nExamples:\n  gemini What is 25 x 4?\n  gemini Solve: 2x + 5 = 15\n  [send image] gemini\n  [send image] gemini Solve this puzzle'
        }, token);
        return;
      }

      if (!imageUrl && userPrompt) {
        await handleTextOnly(senderId, userPrompt, token);
        return;
      }

      console.log('[gemini] Processing image:', imageUrl);
      console.log('[gemini] Prompt:', prompt);

      let responseData = null;
      let lastError = null;

      for (const apiUrl of API_LIST) {
        try {
          console.log('[gemini] Trying API:', apiUrl);
          
          let response;
          
          if (apiUrl.includes('apiv-c7yb')) {
            const uid = senderId || 'user123';
            const apiUrlWithParams = `${apiUrl}?prompt=${encodeURIComponent(prompt)}&uid=${uid}&imgUrl=${encodeURIComponent(imageUrl)}`;
            response = await axios.get(apiUrlWithParams, {
              timeout: 60000,
              headers: { 'Accept': 'application/json' }
            });
            
            if (response.data && response.data.status === true) {
              responseData = response.data.response;
              console.log('[gemini] Success with Vision API');
              break;
            }
          } else if (apiUrl.includes('opera')) {
            const apiUrlWithParams = `${apiUrl}?ask=${encodeURIComponent(prompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
            response = await axios.get(apiUrlWithParams, {
              timeout: 30000,
              headers: { 'Accept': 'application/json' }
            });
            
            if (response.data && response.data.message) {
              responseData = response.data.message;
              console.log('[gemini] Success with Opera API');
              break;
            }
          } else {
            const apiUrlWithParams = `${apiUrl}?prompt=${encodeURIComponent(prompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
            response = await axios.get(apiUrlWithParams, {
              timeout: 30000,
              headers: { 'Accept': 'application/json' }
            });
            
            if (response.data && response.data.response) {
              responseData = response.data.response;
              console.log('[gemini] Success with Generic API');
              break;
            }
          }
        } catch (error) {
          console.error('[gemini] API failed:', apiUrl, error.message);
          lastError = error;
          continue;
        }
      }

      if (responseData) {
        let cleanResponse = cleanAndFormatResponse(responseData, userPrompt);
        
        if (cleanResponse.length < 20 || cleanResponse.includes('displays') || cleanResponse.includes('appears')) {
          cleanResponse = await forceSolve(prompt, imageUrl);
        }

        const chunks = splitMessage(cleanResponse, 1900);
        for (const chunk of chunks) {
          await sendMessage(senderId, { text: chunk }, token);
        }
      } else {
        const fallbackResponse = await forceSolve(prompt, imageUrl);
        const chunks = splitMessage(fallbackResponse, 1900);
        for (const chunk of chunks) {
          await sendMessage(senderId, { text: chunk }, token);
        }
      }

    } catch (error) {
      console.error('[gemini] Error:', error.message);
      await sendMessage(senderId, {
        text: 'Error processing request. Please try again.'
      }, token);
    }
  }
};

function buildPrompt(userPrompt) {
  const lowerPrompt = userPrompt.toLowerCase();
  
  if (lowerPrompt.includes('solve') || lowerPrompt.includes('compute') || lowerPrompt.includes('calculate')) {
    return 'Solve this problem. Provide the complete solution with steps. Include the final answer. Do not just describe. Remove all symbols like $, *, # from response. Use plain text only.';
  } else if (lowerPrompt.includes('sequence') || lowerPrompt.includes('pattern')) {
    return 'Find the pattern and solve the sequence. Provide the complete sequence, formula, and final answer. Remove all symbols like $, *, # from response. Use plain text only.';
  } else if (lowerPrompt.includes('sudoku') || lowerPrompt.includes('puzzle')) {
    return 'Solve this puzzle completely. Provide the full solution. Do not just describe. Remove all symbols like $, *, # from response. Use plain text only.';
  } else if (lowerPrompt.includes('analyze') || lowerPrompt.includes('visualize')) {
    return 'Analyze and visualize this image. Provide insights and description. Remove all symbols like $, *, # from response. Use plain text only.';
  } else if (lowerPrompt.includes('translate')) {
    return 'Translate the text in this image. Provide only the translation. Remove all symbols like $, *, # from response. Use plain text only.';
  } else {
    return 'Analyze, visualize, and solve if applicable. Provide the complete solution with steps. Remove all symbols like $, *, # from response. Use plain text only. Do not just describe.';
  }
}

async function handleTextOnly(senderId, prompt, token) {
  try {
    const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/opera?ask=${encodeURIComponent(prompt + ' Remove all symbols like $, *, # from response. Use plain text only.')}`;
    const response = await axios.get(apiUrl, {
      timeout: 30000,
      headers: { 'Accept': 'application/json' }
    });

    if (response.data && response.data.message) {
      let cleanResponse = cleanAndFormatResponse(response.data.message, prompt);
      const chunks = splitMessage(cleanResponse, 1900);
      for (const chunk of chunks) {
        await sendMessage(senderId, { text: chunk }, token);
      }
    } else {
      await sendMessage(senderId, {
        text: 'Unable to process text. Please try again.'
      }, token);
    }
  } catch (error) {
    console.error('[gemini] Text only error:', error.message);
    await sendMessage(senderId, {
      text: 'Error processing text. Please try again.'
    }, token);
  }
}

function cleanAndFormatResponse(text, originalPrompt) {
  if (!text) return 'No response.';

  let cleaned = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/`/g, '')
    .replace(/_/g, '')
    .replace(/~{2}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Remove $ signs
  cleaned = cleaned.replace(/\$/g, '');

  // Remove unusual characters
  cleaned = cleaned.replace(/[^a-zA-Z0-9\s\.,\-\!\?\:\;\'\"\(\)\%\=\+\/\*]/g, '');

  // Remove common "describe" phrases
  const describePhrases = [
    /^The image displays/i,
    /^Here's a breakdown/i,
    /^The overall image/i,
    /^This image shows/i,
    /^The image shows/i,
    /^It appears to be/i,
    /^This appears to be/i,
    /^Looking at this image/i,
    /^Upon examination/i,
    /^Analyze the Given Information/i,
    /^Substitute the Known Values/i,
    /^Solve for n/i,
    /^Complete Solution/i,
    /^Visualization/i
  ];

  for (const phrase of describePhrases) {
    if (cleaned.match(phrase)) {
      cleaned = cleaned.replace(phrase, '');
      cleaned = cleaned.trim();
      break;
    }
  }

  // If it's a math/sequence problem, format accordingly
  const lowerPrompt = originalPrompt.toLowerCase();
  if (lowerPrompt.includes('sequence') || lowerPrompt.includes('solve') || lowerPrompt.includes('compute')) {
    cleaned = formatMathSolution(cleaned);
  }

  return cleaned || 'No valid response.';
}

function formatMathSolution(text) {
  let formatted = 'SOLUTION\n\n';
  
  // Extract numbers
  const numbers = text.match(/-?\d+/g);
  
  if (numbers && numbers.length >= 2) {
    formatted += 'Sequence: ' + numbers.join(', ') + '\n\n';
    
    // Find pattern
    if (numbers.length >= 3) {
      const diff = parseInt(numbers[1]) - parseInt(numbers[0]);
      if (!isNaN(diff) && diff !== 0) {
        formatted += 'Common Difference: ' + diff + '\n';
        
        const last = parseInt(numbers[numbers.length - 1]);
        if (!isNaN(last) && diff !== 0) {
          const n = ((last - parseInt(numbers[0])) / diff) + 1;
          if (Number.isInteger(n) && n > 0) {
            formatted += 'Number of Terms: ' + n + '\n';
          }
        }
      }
    }
    formatted += '\n';
  }
  
  // Add explanation
  const explanation = text.replace(/[\d,\s-]+/g, '').trim();
  if (explanation && explanation.length > 10) {
    formatted += 'EXPLANATION:\n' + explanation + '\n\n';
  }
  
  // Add final answer
  if (!text.includes('answer') && !text.includes('Answer')) {
    formatted += 'FINAL ANSWER:\n' + text.substring(0, 300);
  }
  
  return formatted;
}

async function forceSolve(prompt, imageUrl) {
  try {
    const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/opera?ask=${encodeURIComponent('Solve this problem. Provide complete solution. Remove all symbols like $, *, #. Use plain text only. Do not describe.')}&imageurl=${encodeURIComponent(imageUrl)}`;
    const response = await axios.get(apiUrl, {
      timeout: 30000,
      headers: { 'Accept': 'application/json' }
    });

    if (response.data && response.data.message) {
      return cleanAndFormatResponse(response.data.message, 'solve');
    }
  } catch (error) {
    console.error('[gemini] Force solve failed:', error.message);
  }
  
  return 'Unable to solve. Please try again with a clearer image or text.';
}

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
