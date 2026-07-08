const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://betadash-api-swordslush-production.up.railway.app/upscale';

module.exports = {
  name: 'enhance',
  description: 'Enhance images to 4K resolution using Remini.',
  usage: 'enhance [reply to an image or send image URL]',
  author: 'GeoDevz69',

  async execute(senderId, args, token, event) {
    try {
      let imageUrl = await extractImageUrl(event, token);

      if (!imageUrl && args.length > 0) {
        const urlMatch = args.join(' ').match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))/i);
        if (urlMatch) {
          imageUrl = urlMatch[0];
        }
      }

      if (!imageUrl) {
        await sendMessage(senderId, { 
          text: '❌| No image found. Please:\n1. Reply to an image\n2. Send an image\n3. Provide an image URL\n\nExample: enhance https://i.ibb.co/9jZcFqP/1773060358521.png' 
        }, token);
        return;
      }

      console.log(`[enhance] Processing image: ${imageUrl}`);

      // Send processing message
      await sendMessage(senderId, { 
        text: '🔄| Enhancing image to 4K... Please wait a moment.' 
      }, token);

      // Make the API request
      const response = await axios.get(`${API_URL}?imageUrl=${encodeURIComponent(imageUrl)}`, {
        timeout: 30000,
        headers: {
          'Accept': 'application/json'
        }
      });

      console.log('[enhance] API Response:', response.data);

      const data = response.data;

      if (data?.imageUrl) {
        const enhancedUrl = data.imageUrl;
        
        console.log(`[enhance] Enhanced image URL: ${enhancedUrl}`);

        // ✅ FIXED: Send as SEPARATE messages
        // 1. Success text
        await sendMessage(senderId, {
          text: '✅| Here is your enhanced 4K image:'
        }, token);

        // 2. Image attachment (SEND THIS BY ITSELF, NO TEXT)
        await sendMessage(senderId, {
          attachment: {
            type: 'image',
            payload: { url: enhancedUrl }
          }
        }, token);

        // 3. Author credit
        if (data.author) {
          await sendMessage(senderId, {
            text: `👤| Enhanced by: ${data.author}`
          }, token);
        }

        // 4. Direct link
        await sendMessage(senderId, {
          text: `🔗| Direct link: ${enhancedUrl}`
        }, token);

      } else {
        console.error('Unexpected API response:', data);
        await sendMessage(senderId, { 
          text: '❌| Failed to enhance the image. Please try again.' 
        }, token);
      }

    } catch (error) {
      console.error('[enhance] Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      let errorMessage = 'Failed to enhance image. ';
      
      if (error.response?.status === 500) {
        errorMessage += 'Server error. Please try again later.';
      } else if (error.response?.status === 400) {
        errorMessage += 'Invalid image URL. Please check the image URL.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage += 'Request timeout. The image might be too large.';
      } else {
        errorMessage += error.message || 'Unknown error occurred.';
      }

      await sendMessage(senderId, {
        text: `❌| ${errorMessage}`
      }, token);
    }
  }
};

// --- HELPER FUNCTIONS ---

async function extractImageUrl(event, token) {
  try {
    if (event?.message?.reply_to?.mid) {
      return await getRepliedImage(event.message.reply_to.mid, token);
    } 
    else if (event?.message?.attachments?.[0]?.type === 'image') {
      return event.message.attachments[0].payload.url;
    }
    else if (event?.message?.text) {
      const text = event.message.text;
      const urlMatch = text.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))/i);
      if (urlMatch) {
        return urlMatch[0];
      }
    }
  } catch (err) {
    console.error('[Image Extraction] Failed:', err);
  }
  return '';
}

async function getRepliedImage(mid, token) {
  try {
    const url = `https://graph.facebook.com/v21.0/${mid}/attachments`;
    const params = {
      access_token: token
    };
    const { data } = await axios.get(url, { params });
    return data?.data?.[0]?.image_data?.url || '';
  } catch (err) {
    console.error('[Replied Image] Failed:', err.response?.data || err.message);
    throw new Error('Failed to retrieve replied image.');
  }
}
