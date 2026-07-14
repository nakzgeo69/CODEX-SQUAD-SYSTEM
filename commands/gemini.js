const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// Gemini API Configuration
const GEMINI_API_KEY = 'AQ.Ab8RN6ImCg2UJMZ4sMkIDszIB17v14YPE39_xIvSJte27WIgNQ';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

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
        await sendMessage(senderId, {
          text: 'Please send an image first.'
        }, token);
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

      // Prepare request for Gemini API
      const requestBody = {
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageUrl
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048
        }
      };

      console.log('[gemini] Sending request to Gemini API...');

      const response = await axios.post(
        `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      console.log('[gemini] API Response:', response.data);

      if (response.data && response.data.candidates && response.data.candidates.length > 0) {
        let cleanResponse = response.data.candidates[0].content.parts[0].text || 'No response from Gemini API.';

        // Clean the response
        cleanResponse = cleanResponse
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

      if (error.response) {
        console.error('[gemini] API Error:', error.response.data);
      }

      let errorMessage = 'Error analyzing image. ';

      if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = 'API key is invalid or expired. Please check your Gemini API key.';
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Gemini API server error. Please try again later.';
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        errorMessage = 'Request timeout. The image may be too large. Please try compressing the image.';
      } else {
        errorMessage += error.message || 'Failed to connect to the Gemini API.';
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
