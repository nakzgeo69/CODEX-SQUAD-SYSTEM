const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'upscale',
  description: 'Upscale images instantly',
  usage: 'Reply to an image with "upscale"',
  author: 'codex',

  async execute(senderId, args, token) {
    try {
      const replied = args.replyTo;
      
      if (!replied) {
        await sendMessage(senderId, {
          text: '📸 Please reply to an image with upscale'
        }, token);
        return;
      }

      let imageUrl = null;

      if (replied.attachments && replied.attachments.length > 0) {
        for (const att of replied.attachments) {
          if (att.type === 'image' || att.type === 'photo') {
            imageUrl = att.payload?.url || att.url || att.payload?.image_url;
            if (imageUrl) break;
          }
        }
      }

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: '❌ Please reply to an image.'
        }, token);
        return;
      }

      const response = await axios.get(
        'https://api.waifu2x.udp.jp/api/upscale',
        {
          params: { url: imageUrl, scale: 2, noise: 0 },
          timeout: 15000
        }
      );

      const upscaledImage = response.data.result || response.data.url || imageUrl;

      await sendMessage(senderId, {
        attachment: {
          type: 'image',
          payload: {
            url: upscaledImage
          }
        }
      }, token);

    } catch (error) {
      console.error('[upscale] Error:', error.message);
      
      const originalImage = args.replyTo?.attachments?.[0]?.payload?.url;
      if (originalImage) {
        await sendMessage(senderId, {
          attachment: {
            type: 'image',
            payload: {
              url: originalImage
            }
          }
        }, token);
      } else {
        await sendMessage(senderId, {
          text: '❌ Failed to upscale. Please try again.'
        }, token);
      }
    }
  }
};
