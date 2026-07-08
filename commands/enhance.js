const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// NEW API ENDPOINT
const API_URL = 'https://betadash-api-swordslush-production.up.railway.app/upscale';

module.exports = {
  name: 'enhance',
  description: 'Enhance images to 4K resolution using Remini.',
  usage: 'enhance [reply to an image]',
  author: 'GeoDevz69',

  async execute(senderId, args, token, event) {
    try {
      // Extract image URL from the event
      const imageUrl = await extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, { 
          text: '❌| No image found. Please reply to an image or send an image directly.' 
        }, token);
        return;
      }

      // Notify user about processing
      await sendMessage(senderId, { 
        text: '🔄| Enhancing image to 4K... Please wait a moment.' 
      }, token);

      // Make the API request with the NEW endpoint
      const response = await axios.get(`${API_URL}?imageUrl=${encodeURIComponent(imageUrl)}`, {
        timeout: 30000 // 30 seconds timeout
      });

      const data = response.data;

      // Log the response for debugging
      console.log('[enhance] API Response:', data);

      // Check if the response has imageUrl
      if (data?.imageUrl) {
        // Send the enhanced image
        await sendMessage(senderId, {
          text: '✅| Here is your enhanced 4K image:',
          attachment: {
            type: 'image',
            payload: { url: data.imageUrl }
          }
        }, token);

        // Optional: Send author credit
        if (data.author) {
          await sendMessage(senderId, {
            text: `👤| Enhanced by: ${data.author}`
          }, token);
        }
      } else {
        console.error('Unexpected API response:', data);
        await sendMessage(senderId, { 
          text: '❌| Failed to enhance the image. Please try again.' 
        }, token);
      }

    } catch (error) {
      const errorMessage = error.response 
        ? `API error ${error.response.status}: ${error.response.data?.message || 'Unknown error'}` 
        : error.message || 'Unknown error';
      
      console.error(`[enhance] Failed: ${errorMessage}`);
      await sendMessage(senderId, {
        text: `❌| Error: ${error.message || 'Failed to enhance image. Please try again later.'}`
      }, token);
    }
  }
};

// --- HELPER FUNCTIONS ---

async function extractImageUrl(event, token) {
  try {
    // Check if replying to a message with image
    if (event?.message?.reply_to?.mid) {
      return await getRepliedImage(event.message.reply_to.mid, token);
    } 
    // Check if direct image attachment
    else if (event?.message?.attachments?.[0]?.type === 'image') {
      return event.message.attachments[0].payload.url;
    }
    // Check if image URL was provided as argument
    else if (event?.message?.text) {
      const text = event.message.text;
      const urlMatch = text.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/i);
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
