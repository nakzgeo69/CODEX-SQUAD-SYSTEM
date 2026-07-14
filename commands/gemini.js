const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_LIST = [
  'https://apiv-c7yb.onrender.com/api/gemini-vision',
  'https://betadash-api-swordslush-production.up.railway.app/opera',
  'https://norch-project.gleeze.com/api/gemini'
];

module.exports = {
  name: ['gemini', 'vision', 'analyze', 'solve', 'compute', 'visualize', 'criticize'],
  description: 'Analyze, solve, or criticize images using AI',
  usage: 'Send an image and type "gemini"',
  version: '3.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let imageUrl = await extractImageUrl(event, token);
      const userPrompt = args.join(' ') || '';

      // Detect image type
      const imageType = await detectImageType(imageUrl);
      console.log('[gemini] Detected image type:', imageType);

      let prompt = '';

      if (imageType === 'math' || imageType === 'sequence' || imageType === 'puzzle' || userPrompt.toLowerCase().includes('solve')) {
        prompt = 'Solve this problem. Provide the complete solution with steps. Include the final answer. Use plain text only. No symbols.';
      } else if (userPrompt.toLowerCase().includes('criticize') || userPrompt.toLowerCase().includes('critique')) {
        prompt = 'Provide a deep, critical analysis of this image. Examine its meaning, purpose, symbolism, and impact. Be thorough and insightful. Use plain text only.';
      } else if (userPrompt.toLowerCase().includes('analyze') || userPrompt.toLowerCase().includes('visualize')) {
        prompt = 'Analyze this image in depth. Provide detailed observations, insights, and interpretation. Use plain text only.';
      } else if (userPrompt.toLowerCase().includes('translate')) {
        prompt = 'Translate the text in this image. Provide only the translation. Use plain text only.';
      } else if (imageType === 'logo' || imageType === 'emblem' || imageType === 'symbol') {
        prompt = 'Provide a deep, critical analysis of this logo/emblem. Examine its design, symbolism, message, and overall impact. Be thorough and insightful. Use plain text only.';
      } else if (imageType === 'text' || imageType === 'document') {
        prompt = 'Extract and summarize the text in this image. Provide a clear, concise summary. Use plain text only.';
      } else if (imageType === 'object' || imageType === 'scene') {
        prompt = 'Describe this image in detail. Identify objects, people, settings, and any notable elements. Use plain text only.';
      } else {
        prompt = 'Analyze this image. Provide a comprehensive description and interpretation. Use plain text only.';
      }

      if (!imageUrl && !userPrompt) {
        await sendMessage(senderId, {
          text: 'Usage: gemini [question/problem]\n\nExamples:\n  gemini What is 25 x 4?\n  gemini Solve: 2x + 5 = 15\n  gemini criticize this logo\n  [send image] gemini'
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
          continue;
        }
      }

      if (responseData) {
        let cleanResponse = cleanAndFormatResponse(responseData, userPrompt, imageType);
        
        if (cleanResponse.length < 20 || cleanResponse.includes('displays') || cleanResponse.includes('appears') || cleanResponse.includes('Please provide')) {
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

async function detectImageType(imageUrl) {
  try {
    const prompt = 'Classify this image into one category: math, sequence, puzzle, logo, emblem, symbol, text, document, object, scene, or other. Return only the category name.';
    const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/opera?ask=${encodeURIComponent(prompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
    const response = await axios.get(apiUrl, {
      timeout: 10000,
      headers: { 'Accept': 'application/json' }
    });

    if (response.data && response.data.message) {
      const text = response.data.message.toLowerCase();
      if (text.includes('math')) return 'math';
      if (text.includes('sequence')) return 'sequence';
      if (text.includes('puzzle')) return 'puzzle';
      if (text.includes('logo')) return 'logo';
      if (text.includes('emblem')) return 'emblem';
      if (text.includes('symbol')) return 'symbol';
      if (text.includes('text')) return 'text';
      if (text.includes('document')) return 'document';
      if (text.includes('object')) return 'object';
      if (text.includes('scene')) return 'scene';
      return 'other';
    }
  } catch (error) {
    console.error('[detectImageType] Error:', error.message);
  }
  return 'other';
}

function cleanAndFormatResponse(text, originalPrompt, imageType) {
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
    .replace(/\$/g, '')
    .replace(/[^a-zA-Z0-9\s\.,\-\!\?\:\;\'\"\(\)\%\=\+\/\*\n]/g, '')
    .trim();

  // Remove describe phrases
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
    /^Please provide/i,
    /^Your request is general/i,
    /^Could you please/i
  ];

  for (const phrase of describePhrases) {
    if (cleaned.match(phrase)) {
      cleaned = cleaned.replace(phrase, '');
      cleaned = cleaned.trim();
      break;
    }
  }

  // If math/sequence, format as solution
  if (imageType === 'math' || imageType === 'sequence' || imageType === 'puzzle' || originalPrompt.toLowerCase().includes('solve')) {
    cleaned = formatMathSolution(cleaned);
  }

  return cleaned || 'No valid response.';
}

function formatMathSolution(text) {
  let formatted = 'SOLUTION\n\n';
  
  const numbers = text.match(/-?\d+/g);
  
  if (numbers && numbers.length >= 2) {
    const first = parseInt(numbers[0]);
    const second = parseInt(numbers[1]);
    const diff = second - first;
    const last = parseInt(numbers[numbers.length - 1]);
    
    if (!isNaN(diff) && diff !== 0 && !isNaN(last)) {
      const n = ((last - first) / diff) + 1;
      if (Number.isInteger(n) && n > 0) {
        const fullSequence = [];
        for (let i = 0; i < n; i++) {
          fullSequence.push(first + (i * diff));
        }
        formatted += 'Sequence: ' + fullSequence.join(', ') + '\n\n';
        formatted += 'Common Difference: ' + diff + '\n';
        formatted += 'Number of Terms: ' + n + '\n\n';
      }
    }
  }
  
  const explanation = text.replace(/[\d,\s-]+/g, '').trim();
  if (explanation && explanation.length > 10) {
    const uniqueExplanation = explanation.split('\n').filter((v, i, a) => a.indexOf(v) === i).join('\n');
    formatted += 'EXPLANATION:\n' + uniqueExplanation + '\n\n';
  }
  
  const numbers2 = text.match(/-?\d+/g);
  if (numbers2 && numbers2.length >= 2) {
    const first2 = parseInt(numbers2[0]);
    const last2 = parseInt(numbers2[numbers2.length - 1]);
    const diff2 = parseInt(numbers2[1]) - parseInt(numbers2[0]);
    if (!isNaN(first2) && !isNaN(last2) && !isNaN(diff2) && diff2 !== 0) {
      const n2 = ((last2 - first2) / diff2) + 1;
      if (Number.isInteger(n2) && n2 > 0) {
        formatted += 'FINAL ANSWER:\n';
        formatted += 'First term: ' + first2 + '\n';
        formatted += 'Common difference: ' + diff2 + '\n';
        formatted += 'Number of terms: ' + n2 + '\n';
        formatted += 'Last term: ' + last2;
      }
    }
  }
  
  return formatted || text;
}

async function forceSolve(prompt, imageUrl) {
  try {
    const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/opera?ask=${encodeURIComponent('Provide a complete solution or deep analysis. Use plain text only. No symbols.')}&imageurl=${encodeURIComponent(imageUrl)}`;
    const response = await axios.get(apiUrl, {
      timeout: 30000,
      headers: { 'Accept': 'application/json' }
    });

    if (response.data && response.data.message) {
      return cleanAndFormatResponse(response.data.message, 'solve', 'other');
    }
  } catch (error) {
    console.error('[gemini] Force solve failed:', error.message);
  }
  
  return 'Unable to analyze or solve. Please try again with a clearer image or text.';
}

async function handleTextOnly(senderId, prompt, token) {
  try {
    const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/opera?ask=${encodeURIComponent(prompt + ' Use plain text only. No symbols.')}`;
    const response = await axios.get(apiUrl, {
      timeout: 30000,
      headers: { 'Accept': 'application/json' }
    });

    if (response.data && response.data.message) {
      let cleanResponse = cleanAndFormatResponse(response.data.message, prompt, 'other');
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
