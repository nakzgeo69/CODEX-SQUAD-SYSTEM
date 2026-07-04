const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'ai',
  description: 'AI Chat',
  usage: 'ai [message]',
  author: 'coffee',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim() || 'Hello';

    try {
      const response = await getAIResponse(prompt, senderId);
      await sendMessage(senderId, { text: response.slice(0, 2000) }, token);
    } catch (error) {
      await sendMessage(senderId, { text: 'Please Wait 15 seconds for yor next question.' }, token);
    }
  }
};

async function getAIResponse(prompt, userId) {
  const endpoints = [
    'https://api-library-kohi-production.up.railway.app/api/publicai',
    'https://api-library-kohi-production.up.railway.app/api/pollination-ai?model=openai-large'
  ];

  for (const url of endpoints) {
    try {
      const { data } = await axios.get(url, {
        params: { prompt, user: userId },
        timeout: 1000
      });

      if (data?.data) {
        return typeof data.data === 'string' ? data.data : data.data.text;
      }
    } catch (error) {
      continue;
    }
  }

  return 'Please Wait 15 seconds for yor next question.';
}
