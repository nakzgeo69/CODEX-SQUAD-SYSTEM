const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'removebg',
  description: 'Remove background from image URL',
  usage: 'removebg [image_url]',
  author: 'codex',

  async execute(senderId, args, token) {
    try {
      // Get the URL from args
      const imageUrl = args.text?.trim() || args.join(' ');

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: '📸 Please provide an image URL.\n\nUsage: removebg https://example.com/image.jpg'
        }, token);
        return;
      }

      // Validate if it's a URL
      if (!imageUrl.match(/^https?:\/\/.+\/.+\.(jpg|jpeg|png|gif|webp|bmp)/i) && 
          !imageUrl.match(/^https?:\/\/i\.ibb\.co\/.+/)) {
        await sendMessage(senderId, {
          text: '❌ Invalid image URL. Please provide a valid image URL.'
        }, token);
        return;
      }

      console.log('Processing image URL:', imageUrl);

      // Send processing message
      await sendMessage(senderId, {
        text: '🔄 Removing background... Please wait.'
      }, token);

      // Fetch the image as binary data
      const response = await axios.get(
        'https://betadash-api-swordslush-production.up.railway.app/removebg',
        {
          params: { imageUrl: imageUrl },
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );

      // Convert to base64
      const base64Image = Buffer.from(response.data, 'binary').toString('base64');
      const dataUri = `data:image/png;base64,${base64Image}`;

      // Send the processed image
      await sendMessage(senderId, {
        attachment: {
          type: 'image',
          payload: {
            url: dataUri
          }
        }
      }, token);

    } catch (error) {
      console.error('[removebg] Error:', error.message);
      
      await sendMessage(senderId, {
        text: '❌ Failed to remove background. Please check the URL and try again.\n\nError: ' + error.message
      }, token);
    }
  }
};
