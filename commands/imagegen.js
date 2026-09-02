const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['generate', 'img', 'image', 'show', 'pinterest', 'pic'],
  description: 'Generate images from Pinterest',
  usage: 'generate [search term] [number]',
  version: '1.0.0',
  author: 'codex',
  category: 'Media',
  cooldown: 3,

  async execute(senderId, args, token) {
    let searchTerm = args.join(' ').trim();
    let imageCount = 10;

    if (!searchTerm) {
      await sendMessage(senderId, { 
        text: 'Image Generator\n\nUsage: generate [search term] [number]\nExample: generate sunset 5' 
      }, token);
      return;
    }

    const argsArray = searchTerm.split(' ');
    const lastArg = argsArray[argsArray.length - 1];
    if (!isNaN(lastArg) && lastArg > 0 && lastArg <= 30) {
      imageCount = parseInt(lastArg);
      searchTerm = argsArray.slice(0, -1).join(' ');
    }

    try {
      const response = await axios.get('https://hiroshi-api.onrender.com/image/pinterest', {
        params: { search: searchTerm, limit: imageCount },
        timeout: 30000
      });

      const images = (response.data?.data || []).filter(url => this.isValidUrl(url));

      if (images.length === 0) {
        await sendMessage(senderId, { text: 'No images found for "' + searchTerm + '".' }, token);
        return;
      }

      const totalToSend = Math.min(images.length, imageCount);
      
      for (let i = 0; i < totalToSend; i++) {
        const imageUrl = images[i];
        try {
          await sendMessage(senderId, { 
            attachment: { 
              type: 'image', 
              payload: { url: imageUrl } 
            } 
          }, token);
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (imgError) {
          console.error('[ImageGen] Failed to send image:', imgError.message);
        }
      }

    } catch (error) {
      console.error('[ImageGen] Error:', error.message);
      await sendMessage(senderId, { text: 'Error generating images. Please try again.' }, token);
    }
  },

  isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }
};
