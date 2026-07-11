// commands/gemini.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'gemini',
  description: 'Analyze images using Gemini AI',
  usage: '!gemini [prompt] (with image attachment or URL)',
  cooldown: 5,
  
  async execute(senderId, messageText, attachment, pageAccessToken) {
    try {
      let imageUrl = null;
      let prompt = messageText || 'What can you help me with?';
      
      const urlMatch = messageText.match(/https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|ibb\.co)/i);
      if (urlMatch) {
        imageUrl = urlMatch[0];
        prompt = messageText.replace(urlMatch[0], '').trim() || 'Analyze this image';
      }
      
      if (attachment && attachment.payload && attachment.payload.url) {
        imageUrl = attachment.payload.url;
      }
      
      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Please provide an image. Usage: !gemini [prompt] (with image attachment or URL)'
        }, pageAccessToken);
        return;
      }
      
      await sendMessage(senderId, {
        text: 'Processing your image...'
      }, pageAccessToken);
      
      const encodedPrompt = encodeURIComponent(prompt);
      const encodedImageUrl = encodeURIComponent(imageUrl);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}&imageurl=${encodedImageUrl}`;
      
      const response = await axios.get(apiUrl, {
        timeout: 60000,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.status === 200 && response.data) {
        const data = response.data;
        
        let cleanResponse = data.response || 'No response from Gemini API.';
        
        cleanResponse = cleanResponse
          .replace(/^I'm a Gemini.*?model.*?\n\n?/i, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .replace(/#{1,6}\s/g, '')
          .replace(/`/g, '')
          .replace(/_/g, '')
          .replace(/~{2}/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        
        await sendMessage(senderId, {
          text: cleanResponse
        }, pageAccessToken);
        
        logToFile(senderId, data);
        
      } else {
        throw new Error('Invalid response from Gemini API');
      }
      
    } catch (error) {
      console.error('[GEMINI ERROR]', error.message);
      
      let errorMessage = 'Error analyzing image. ';
      
      if (error.response) {
        if (error.response.status === 500) {
          errorMessage += 'The API server is currently unavailable. Please try again later.';
        } else if (error.response.status === 429) {
          errorMessage += 'Rate limit exceeded. Please wait a moment.';
        } else {
          errorMessage += `API Error: ${error.response.status}`;
        }
      } else if (error.code === 'ECONNABORTED') {
        errorMessage += 'Request timeout. The image may be too large.';
      } else {
        errorMessage += 'Failed to connect to the API. Please check your connection.';
      }
      
      await sendMessage(senderId, {
        text: errorMessage
      }, pageAccessToken);
    }
  }
};

async function sendMessage(recipientId, message, pageAccessToken) {
  try {
    const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${pageAccessToken}`;
    
    const response = await axios.post(url, {
      recipient: { id: recipientId },
      message: message
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('[MESSENGER ERROR]', error.response?.data || error.message);
    throw error;
  }
}

function logToFile(senderId, data) {
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'gemini_analysis.log');
    const logEntry = {
      timestamp: new Date().toISOString(),
      userId: senderId,
      model: data.model || 'gemini-2.5-flash',
      prompt: data.prompt,
      responseLength: data.response?.length || 0,
      author: data.author
    };
    
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch (error) {
    console.error('[LOG ERROR]', error.message);
  }
}

module.exports.config = {
  name: 'gemini',
  aliases: ['ai', 'analyze', 'vision'],
  description: 'Analyze images using Gemini 2.5 Flash AI',
  usage: '!gemini [prompt] (with image)',
  category: 'AI',
  cooldown: 5,
  permissions: ['user']
};
