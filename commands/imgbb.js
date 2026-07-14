const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['imgbb'],
  description: 'Upload an image to ImgBB',
  usage: 'Send an image and type "imgbb"',
  version: '1.0.0',
  author: 'codex',
  category: 'uploader',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let imageUrl = await extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Send an image first, then type "imgbb" to upload.'
        }, token);
        return;
      }

      console.log('[imgbb] Uploading image:', imageUrl);

      await sendMessage(senderId, {
        text: ''
      }, token);

      const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/imgbb?url=${encodeURIComponent(imageUrl)}`;
      
      const response = await axios.get(apiUrl, {
        timeout: 30000,
        headers: {
          'Accept': 'application/json'
        }
      });

      console.log('[imgbb] API Response:', response.data);

      if (response.data?.imageUrl) {
        const imageLink = response.data.imageUrl;
        const viewerLink = response.data.viewerUrl || imageLink;

        let replyText = '\n';
        replyText += `${imageLink}\n`;
        replyText += `${viewerLink}`;

        await sendMessage(senderId, {
          text: replyText
        }, token);
      } else {
        throw new Error('No image URL found in API response');
      }

    } catch (error) {
      console.error('[imgbb] Error:', error.message);

      let errorMessage = 'An error occurred while uploading the image. ';

      if (error.response?.status === 400) {
        errorMessage = 'Invalid image format. Please send a valid image.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Upload timed out. Please try again with a smaller image.';
      } else {
        errorMessage += 'Please try again later.';
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
