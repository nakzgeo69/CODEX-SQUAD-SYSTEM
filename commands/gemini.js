const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// New Gemini Vision API (working)
const API_URL = 'https://apiv-c7yb.onrender.com/api/gemini-vision';

module.exports = {
  name: ['gemini', 'vision', 'analyze'],
  description: 'Analyze images using Gemini Vision API',
  usage: 'Send an image and type "gemini"',
  version: '1.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      // Extract image URL from event
      let imageUrl = await extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Send an image first, then type "gemini" to analyze it.'
        }, token);
        return;
      }

      console.log('[gemini] Processing image:', imageUrl);

      // Get prompt from args or use default
      const userPrompt = args.join(' ') || 'What is in this image?';
      const encodedPrompt = encodeURIComponent(userPrompt);
      const encodedImageUrl = encodeURIComponent(imageUrl);
      
      // Generate unique user ID
      const uid = senderId || 'user123';

      // Build API URL
      const apiUrl = `${API_URL}?prompt=${encodedPrompt}&uid=${uid}&imgUrl=${encodedImageUrl}`;
      
      console.log('[gemini] API URL:', apiUrl);

      const response = await axios.get(apiUrl, {
        timeout: 60000,
        headers: {
          'Accept': 'application/json'
        }
      });

      console.log('[gemini] API Response:', response.data);

      if (response.data && response.data.status === true) {
        let cleanResponse = response.data.response || 'No response from API.';

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

        if (!cleanResponse || cleanResponse.length < 5) {
          cleanResponse = 'Unable to analyze image. Please try again.';
        }

        // Send response in chunks if too long
        const chunks = splitMessage(cleanResponse, 1900);
        for (const chunk of chunks) {
          await sendMessage(senderId, { text: chunk }, token);
        }

      } else {
        throw new Error(response.data?.message || 'Invalid response from API');
      }

    } catch (error) {
      console.error('[gemini] Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      let errorMessage = 'Error analyzing image. ';

      if (error.response?.status === 500) {
        errorMessage = 'Server error. The API is currently down. Please try again later.';
      } else if (error.response?.status === 400) {
        errorMessage = 'Invalid request. Please check the image URL.';
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment.';
      } else if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
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

// --- HELPER FUNCTIONS ---

async function extractImageUrl(event, token) {
  try {
    // Check if replying to an image
    if (event?.message?.reply_to?.mid) {
      return await getRepliedImage(event.message.reply_to.mid, token);
    }
    
    // Check if message has image attachment
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
