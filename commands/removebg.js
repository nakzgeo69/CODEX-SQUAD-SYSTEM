const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'removebg',
  description: 'Remove background instantly',
  usage: 'Reply to an image with "removebg"',
  author: 'codex',

  async execute(senderId, args, token) {
    try {
      // Check if there's a reply
      if (!args.replyTo) {
        await sendMessage(senderId, {
          text: '📸 Please reply to an image with removebg'
        }, token);
        return;
      }

      let imageUrl = null;

      // Log the replyTo structure for debugging
      console.log('ReplyTo Structure:', JSON.stringify(args.replyTo, null, 2));

      // Try different ways to get the image URL
      if (args.replyTo.attachments && args.replyTo.attachments.length > 0) {
        for (const att of args.replyTo.attachments) {
          console.log('Attachment:', JSON.stringify(att, null, 2));
          
          if (att.type === 'image' || att.type === 'photo') {
            imageUrl = att.payload?.url || 
                      att.url || 
                      att.payload?.image_url || 
                      att.payload?.src ||
                      att.src;
            if (imageUrl) break;
          }
        }
      }

      // If still no imageUrl, try direct access
      if (!imageUrl && args.replyTo.payload) {
        imageUrl = args.replyTo.payload.url || 
                  args.replyTo.payload.image_url || 
                  args.replyTo.payload.src;
      }

      if (!imageUrl && args.replyTo.url) {
        imageUrl = args.replyTo.url;
      }

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: '❌ Could not find image in reply. Please make sure you replied to an image.'
        }, token);
        return;
      }

      console.log('Extracted Image URL:', imageUrl);

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
          timeout: 30000 // Increased timeout
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
      console.error('[removebg] Full Error:', error);
      
      // Try to send original image as fallback
      try {
        const originalImage = args.replyTo?.attachments?.[0]?.payload?.url || 
                             args.replyTo?.payload?.url ||
                             args.replyTo?.url;
        
        if (originalImage) {
          await sendMessage(senderId, {
            text: '⚠️ Failed to remove background. Here\'s your original image:',
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
      } catch (fallbackError) {
        await sendMessage(senderId, {
          text: '❌ Error processing image. Please try again.'
        }, token);
      }
    }
  }
};
