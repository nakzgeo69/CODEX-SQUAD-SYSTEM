const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://betadash-api-swordslush-production.up.railway.app/upscale';

module.exports = {
  name: 'enhance',
  description: 'Enhance images to 4K resolution using Remini.',
  usage: 'enhance [reply to an image or send image URL]',
  version: '1.0.0',
  author: 'codex',
  category: 'image',
  cooldown: 10,

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
          text: 'Usage : enhance https://i.ibb.co/9jZcFqP/1773060358521.png'
        }, token);
        return;
      }

      console.log(`[enhance] Processing image: ${imageUrl}`);

      await sendMessage(senderId, {
        text: ''
      }, token);

      const response = await axios.get(`${API_URL}?imageUrl=${encodeURIComponent(imageUrl)}`, {
        timeout: 30000,
        headers: {
          'Accept': 'application/json'
        }
      });

      console.log('[enhance] API Response:', JSON.stringify(response.data, null, 2));

      const data = response.data;

      if (data?.imageUrl) {
        const enhancedUrl = data.imageUrl;

        console.log(`[enhance] Enhanced image URL: ${enhancedUrl}`);

        // Send the enhanced image directly
        await sendMessage(senderId, {
          attachment: {
            type: 'image',
            payload: { url: enhancedUrl }
          }
        }, token);

        // Send direct link (optional)
        await sendMessage(senderId, {
          text: `${enhancedUrl}`
        }, token);

        if (data.author) {
          await sendMessage(senderId, {
            text: ``
          }, token);
        }

      } else {
        console.error('Unexpected API response:', data);
        await sendMessage(senderId, {
          text: 'Failed to enhance the image. Please try again.'
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

    // Check if text contains image URL
    if (event?.message?.text) {
      const text = event.message.text;
      const urlMatch = text.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))/i);
      if (urlMatch) {
        return urlMatch[0];
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
    throw new Error('Failed to retrieve replied image.');
  }
}
