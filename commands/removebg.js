const axios = require("axios");
const { sendMessage } = require("../handles/sendMessage");

module.exports = {
  name: ['removebg', 'rmbg'],
  description: 'Remove background from an image',
  usage: 'Send an image and type "removebg"',
  version: '1.0.0',
  author: 'AutoPageBot',
  category: 'images',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      // Extract image URL from event
      let imageUrl = await extractImageUrl(event, token);

      // Check if args contain image URL
      if (!imageUrl && args.length > 0) {
        const urlMatch = args.join(' ').match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|bmp|svg))/i);
        if (urlMatch) {
          imageUrl = urlMatch[0];
        }
      }

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Usage: removebg https://i.ibb.co/xxx/image.jpg'
        }, token);
        return;
      }

      console.log(`[removebg] Processing image: ${imageUrl}`);

      await sendMessage(senderId, {
        text: ''
      }, token);

      const apiUrl = `https://api-library-kohi.onrender.com/api/removebg?url=${encodeURIComponent(imageUrl)}`;
      console.log('[removebg] API URL:', apiUrl);

      const response = await axios.get(apiUrl, { timeout: 30000 });
      console.log('[removebg] API Response:', response.data);

      if (response.data?.status && response.data?.data?.url) {
        const resultUrl = response.data.data.url;

        // Send success message
        await sendMessage(senderId, {
          text: ''
        }, token);

        // Send the processed image
        await sendMessage(senderId, {
          attachment: {
            type: 'image',
            payload: {
              url: resultUrl
            }
          }
        }, token);

      } else {
        const errorMsg = response.data?.message || 'Unknown error';
        await sendMessage(senderId, {
          text: `Failed to remove background: ${errorMsg}`
        }, token);
      }

    } catch (error) {
      console.error('[removebg] Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      let errorMessage = 'An error occurred while removing the background. ';

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
    if (event?.message?.reply_to?.mid) {
      return await getRepliedImage(event.message.reply_to.mid, token);
    } 
    else if (event?.message?.attachments && event.message.attachments.length > 0) {
      for (const attachment of event.message.attachments) {
        if (attachment.type === 'image' || attachment.type === 'photo') {
          return attachment.payload?.url || attachment.url || null;
        }
      }
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
