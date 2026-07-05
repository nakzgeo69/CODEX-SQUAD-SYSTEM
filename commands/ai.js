const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'ai',
  description: 'Chat with AI',
  usage: 'ai [message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim() || 'Hello';

    try {
      const { data } = await axios.get(API_URL, {
        params: { prompt, model: 'chatgpt4' },
        timeout: 15000
      });

      if (!data?.answer) throw new Error('Invalid API response');
      
      const reply = cleanText(data.answer.trim());
      await sendMessage(senderId, { text: reply }, token);

    } catch (error) {
      console.error(`[AI Error] ${error.message}`);
      await sendMessage(senderId, { 
        text: error.response?.status === 404 ? 'API not found.' :
              error.response?.status === 500 ? 'Server error.' :
              error.code === 'ECONNABORTED' ? 'Timeout.' :
              'Error. Please try again.' 
      }, token);
    }
  }
};

const API_URL = 'https://yin-api.vercel.app/ai/chatgptfree';

function cleanText(text) {
  return text
    .replace(/[\u1D400-\u1D7FF]/g, '') // Remove mathematical bold
    .replace(/[^\x00-\x7F]/g, '')       // Remove non-ASCII
    .replace(/\s+/g, ' ')              // Fix spacing
    .replace(/\s+([.,!?;:])/g, '$1')   // Fix punctuation
    .trim();
}
