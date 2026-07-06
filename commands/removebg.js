const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'removebg',
  description: 'Remove background instantly',
  usage: 'Reply to an image with "removebg"',
  author: 'yazky',

  async execute(senderId, args, token) {
    try {
      const replied = args.replyTo;
      
      if (!replied) {
        await sendMessage(senderId, {
          text: '📸 Please reply to an image with removebg'
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
        'https://betadash-api-swordslush-production.up.railway.app/removebg',
        {
          params: { imageUrl: imageUrl },
          timeout: 15000
        }
      );

      const resultImage = response.data.imageUrl || 
                         response.data.url || 
                         response.data.result || 
                         imageUrl;

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
          text: '❌ Failed to remove background. Please try again.'
        }, token);
      }
    }
  }
};
