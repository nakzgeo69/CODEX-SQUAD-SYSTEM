const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Auto-analyze images using Gemini AI',
  usage: 'Send an image and the bot will auto-analyze it',
  version: '1.0.0',
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

      const encodedImageUrl = encodeURIComponent(imageUrl);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=Analyze%20this%20image&imageurl=${encodedImageUrl}`;

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
