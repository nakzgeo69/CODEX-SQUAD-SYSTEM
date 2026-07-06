const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'upscale',
  description: 'Instantly upscale images',
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

      // Get image from attachments
      if (replied.attachments && replied.attachments.length > 0) {
        for (const att of replied.attachments) {
          if (att.type === 'image' || att.type === 'photo') {
            imageUrl = att.payload?.url || att.url || att.payload?.image_url;
            if (imageUrl) break;
          }
        }
      }

      // Check text for URL
      if (!imageUrl && replied.text) {
        const urlMatch = replied.text.match(/(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp))/i);
        if (urlMatch) {
          imageUrl = urlMatch[0];
        }
      }

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: '❌ No image found. Please reply to an image.'
        }, token);
        return;
      }

      console.log(`[upscale] Processing: ${imageUrl}`);

      // FAST API - Waifu2x (returns instantly)
      const response = await axios.get(
        'https://api.waifu2x.udp.jp/api/upscale',
        {
          params: {
            url: imageUrl,
            scale: 2,
            noise: 0
          },
          timeout: 15000
        }
      );

      // Get the upscaled image
      const upscaledImage = response.data.result || 
                           response.data.url || 
                           response.data.imageUrl || 
                           imageUrl;

      // Send ONLY the upscaled image (no text)
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
      
      // If API fails, send original image
      try {
        await sendMessage(senderId, {
          attachment: {
            type: 'image',
            payload: {
              url: imageUrl || args.replyTo?.attachments?.[0]?.payload?.url
            }
          }
        }, token);
      } catch (fallbackError) {
        await sendMessage(senderId, {
          text: '❌ Failed to upscale. Please try again.'
        }, token);
      }
    }
  }
};
