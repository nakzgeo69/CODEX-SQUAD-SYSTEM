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

  async execute(senderId, args, pageAccessToken, imageUrl, event) {
    // If imageUrl is not provided, try to get from event
    if (!imageUrl && event) {
      const attachments = event?.message?.attachments || [];
      for (const attachment of attachments) {
        if (attachment.type === 'image' || attachment.type === 'photo') {
          imageUrl = attachment.payload?.url || attachment.url || null;
          if (imageUrl) break;
        }
      }
    }

    if (!imageUrl) {
      await sendMessage(senderId, {
        text: 'No attachment detected. Please send an image first.'
      }, pageAccessToken);
      return;
    }

    console.log('Uploading image URL:', imageUrl);

    await sendMessage(senderId, {
      text: 'Uploading your image to ImgBB, please wait...'
    }, pageAccessToken);

    try {
      const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/imgbb?url=${encodeURIComponent(imageUrl)}`;
      console.log('API URL:', apiUrl);

      const response = await axios.get(apiUrl, { timeout: 30000 });
      console.log('API Response:', JSON.stringify(response.data, null, 2));

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
      console.error('Error details:', error.response?.data || error);

      await sendMessage(senderId, {
        text: 'An error occurred while uploading the image. Please try again later.'
      }, pageAccessToken);
    }
  }
};
