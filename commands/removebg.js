const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'removebg',
  description: 'Remove background from images',
  usage: 'Reply to an image with "removebg"',
  author: 'codex',

  async execute(senderId, args, token) {
    try {
      // Get the replied message
      const replied = args.replyTo;
      
      if (!replied) {
        await sendMessage(senderId, {
          text: '📸 Please reply to an image with removebg'
        }, token);
        return;
      }

      let imageUrl = null;

      // Check attachments for image
      if (replied.attachments && replied.attachments.length > 0) {
        for (const att of replied.attachments) {
          if (att.type === 'image' || att.type === 'photo') {
            imageUrl = att.payload?.url || att.url || att.payload?.image_url;
            if (imageUrl) break;
          }
        }
      }

      // If no attachment found, check text for URL
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

      console.log(`[removebg] Processing: ${imageUrl}`);

      // Call the removebg API
      const response = await axios.get(
        'https://betadash-api-swordslush-production.up.railway.app/removebg',
        {
          params: { imageUrl: imageUrl },
          timeout: 30000
        }
      );

      // Get the processed image URL
      const data = response.data;
      const resultImage = data.imageUrl || data.url || data.result || imageUrl;

      // Send the background-removed image
      await sendMessage(senderId, {
        attachment: {
          type: 'image',
          payload: {
            url: resultImage
          }
        }
      }, token);

    } catch (error) {
      console.error('[removebg] Error:', error.message);
      
      // Send error message
      await sendMessage(senderId, {
        text: '❌ Failed to remove background. Please try again.'
      }, token);
    }
  }
};
