const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'ai',
  description: 'Conversational AI - Just chat naturally',
  usage: 'ai [your message]',
  author: 'coffee',

  async execute(senderId, args, token) {
    // Kunin ang buong message ng user (natural language)
    const userMessage = args.join(' ').trim() || 'Hello';

    try {
      // Send typing indicator para alam nilang nag-iisip
      await sendMessage(senderId, { typing: true }, token);

      // Try fast endpoints
      const response = await getConversationalResponse(userMessage, senderId);
      
      // Clean response - remove unnecessary formatting
      const cleanResponse = cleanConversationText(response);
      
      // Send as natural conversation
      await sendMessage(senderId, {
        text: cleanResponse
      }, token);

    } catch (error) {
      console.error('[AI Error]:', error.message);
      
      // Natural fallback response
      const fallback = getNaturalFallback(userMessage);
      await sendMessage(senderId, {
        text: fallback
      }, token);
    }
  }
};

// Fast conversational endpoints
const CONVERSATIONAL_ENDPOINTS = [
  {
    url: 'https://api-library-kohi-production.up.railway.app/api/publicai',
    getParams: (prompt, user) => ({ 
      prompt: prompt, 
      user: user 
    })
  },
  {
    url: 'https://api-library-kohi-production.up.railway.app/api/copilot',
    getParams: (prompt, user) => ({ 
      prompt: prompt, 
      model: 'gpt-3.5', 
      user: user 
    })
  }
];

async function getConversationalResponse(message, userId) {
  // Subukan ang bawat endpoint
  for (const endpoint of CONVERSATIONAL_ENDPOINTS) {
    try {
      const { data } = await axios.get(endpoint.url, {
        params: endpoint.getParams(message, userId),
        timeout: 3000
      });

      // Extract response
      let response = null;
      if (data?.data?.text) response = data.data.text;
      else if (data?.data) response = data.data;
      else if (data?.response) response = data.response;
      
      if (response && typeof response === 'string') {
        return response;
      }
    } catch (error) {
      continue; // Try next endpoint
    }
  }
  
  // Pag walang gumana, use fallback
  return getNaturalFallback(message);
}

function cleanConversationText(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // Remove bold formatting
    .replace(/#{1,6}\s?/g, '') // Remove headers
    .replace(/\n{3,}/g, '\n\n') // Limit newlines
    .replace(/\s{2,}/g, ' ') // Remove extra spaces
    .trim();
}

// Natural conversational fallbacks
function getNaturalFallback(message) {
  const lower = message.toLowerCase().trim();
  
  const responses = {
    'hello': 'Hey! How are you doing? 😊',
    'hi': 'Hi there! What\'s up? 👋',
    'kamusta': 'Okay naman! Ikaw, kamusta na?',
    'musta': 'Okay lang! Ikaw musta?',
    'thanks': 'You\'re welcome! 😊',
    'salamat': 'Walang anuman! 👍',
    'good morning': 'Good morning! Have a great day! ☀️',
    'good night': 'Good night! Sleep well! 🌙',
    'how are you': 'I\'m doing great! Thanks for asking! 😊',
    'ano pangalan mo': 'Ako si AI, pwede mo kong tawaging kahit ano! 😄',
    'sino ka': 'Ako ang iyong AI assistant! Ready to chat anytime! 🤖',
    'default': 'Hmm, interesting! Tell me more about that. 🤔'
  };
  
  for (const [key, response] of Object.entries(responses)) {
    if (lower.includes(key)) return response;
  }
  return responses.default;
}
