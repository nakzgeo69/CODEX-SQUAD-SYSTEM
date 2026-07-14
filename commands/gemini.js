const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images using Gemini AI',
  usage: 'gemini [prompt] (with image attachment)',
  version: '1.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      // Get prompt from args
      let prompt = args.join(' ').trim() || 'Analyze this image';
      
      // Extract image URL from event
      let imageUrl = await extractImageUrl(event, token);
      
      // Check if prompt contains image URL (fallback)
      if (!imageUrl) {
        const urlMatch = prompt.match(/(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg|ibb\.co))/i);
        if (urlMatch) {
          imageUrl = urlMatch[0];
          prompt = prompt.replace(urlMatch[0], '').trim() || 'Analyze this image';
        }
      }

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Usage: gemini [prompt] with an image attachment'
        }, token);
        return;
      }

      console.log('[gemini] Processing image:', imageUrl);
      console.log('[gemini] Prompt:', prompt);

      await sendMessage(senderId, {
        text: ''
      }, token);

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
        
        if (cleanResponse.length > 2000) {
          const chunks = splitMessage(cleanResponse);
          for (const chunk of chunks) {
            await sendMessage(senderId, { text: chunk }, token);
          }
        } else {
          await sendMessage(senderId, { text: cleanResponse }, token);
        }
        
      } else {
        throw new Error('Invalid response from Gemini API');
      }
      
    } catch (error) {
      console.error('[gemini] Error:', error.message);

      let errorMessage = 'Error analyzing image. ';
      
      if (error.response?.status === 500) {
        errorMessage += 'The API server is currently unavailable. Please try again later.';
      } else if (error.response?.status === 429) {
        errorMessage += 'Rate limit exceeded. Please wait a moment.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage += 'Request timeout. The image may be too large.';
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

function splitMessage(text) {
  const maxLength = 2000;
  const chunks = [];
  let currentChunk = '';
  
  const lines = text.split('\n');
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
