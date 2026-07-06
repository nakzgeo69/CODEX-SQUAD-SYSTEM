const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'upscale',
  description: 'Upscale uploaded images',
  usage: 'Reply to an image with "upscale"',
  author: 'codex',

  async execute(senderId, args, token) {
    try {
      // Check if replying to an image
      const replyMessage = args.replyTo || null;
      
      if (!replyMessage || !replyMessage.attachments) {
        await sendMessage(senderId, {
          text: 'Please reply to an image with "upscale"'
        }, token);
        return;
      }

      // Get the image attachment
      const imageAttachment = replyMessage.attachments.find(
        att => att.type === 'image' || att.type === 'photo'
      );

      if (!imageAttachment) {
        await sendMessage(senderId, {
          text: 'Please reply to an image'
        }, token);
        return;
      }

      // Get the image URL from the attachment
      const imageUrl = imageAttachment.payload.url || 
                       imageAttachment.payload.image_url || 
                       imageAttachment.url;

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Could not get image URL'
        }, token);
        return;
      }

      // Process the image
      const response = await axios.get(
        'https://res.cloudinary.com/dtz0urit6/image/upload/v1783354302/cloudinary-tools-uploads/mvh8wkth96jekrj2gjzh.png',
        {
          params: { url: imageUrl },
          timeout: 30000
        }
      );

      const upscaledImage = response.data.imageUrl || response.data.url || imageUrl;

      // Send the upscaled image
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
      
      // Try to get the image from the reply
      if (args.replyTo && args.replyTo.attachments) {
        const img = args.replyTo.attachments.find(a => a.type === 'image');
        if (img) {
          await sendMessage(senderId, {
            attachment: {
              type: 'image',
              payload: {
                url: img.payload.url || img.url
              }
            }
          }, token);
        }
      }
    }
  }
};
