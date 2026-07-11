const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['imgbb'],
  description: 'Upload an image to ImgBB and get a shareable link',
  usage: 'Send an image and type "imgbb"',
  version: '1.0.0',
  author: 'codex',
  category: 'uploader',
  cooldown: 5,

  async execute(senderId, args, pageAccessToken, imageUrl) {
    if (!imageUrl) {
      await sendMessage(senderId, {
        text: 'No attachment detected. Please send an image first.'
      }, pageAccessToken);
      return;
    }

    await sendMessage(senderId, {
      text: 'Uploading your image to ImgBB, please wait...'
    }, pageAccessToken);

    try {
      const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/imgbb?url=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(apiUrl, { timeout: 30000 });

      const imageLink = response?.data?.imageUrl;
      const viewerLink = response?.data?.viewerUrl;

      if (!imageLink && !viewerLink) {
        throw new Error('No image URL found in API response');
      }

      let replyText = 'Upload Successful\n\n';
      replyText += `Image Link: ${imageLink || viewerLink}\n`;
      
      if (imageLink && viewerLink && imageLink !== viewerLink) {
        replyText += `Viewer Link: ${viewerLink}`;
      }

      await sendMessage(senderId, {
        text: replyText
      }, pageAccessToken);

    } catch (error) {
      console.error('ImgBB Error:', error.message);

      let errorMessage = 'An error occurred while uploading the image. Please try again later.';

      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Upload timed out. Please try again with a smaller image.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Invalid image URL. Please send a valid image.';
      } else if (error.response?.status === 413) {
        errorMessage = 'Image file too large. Please compress or use a smaller image.';
      }

      await sendMessage(senderId, {
        text: errorMessage
      }, pageAccessToken);
    }
  }
};
