const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// Copilot API
const API_URL = 'https://yin-api.vercel.app/ai/copilot';
const MAX_CHUNK = 1900;

module.exports = {
  name: ['ai', 'copilot', 'ask'],
  description: 'Chat with AI Copilot',
  usage: 'ai [message]',
  version: '1.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim();

    // --- GREETING / HELP RESPONSE ---
    const greetingKeywords = [
      'hi', 'hello', 'hai', 'hey', 'greetings',
      'good morning', 'good afternoon', 'good evening',
      'hola', 'howdy', 'sup', 'yo', 'gm', 'gn'
    ];

    const isGreeting = !prompt ||
                       prompt.toLowerCase() === 'help' ||
                       greetingKeywords.some(word => prompt.toLowerCase() === word);

    if (isGreeting) {
      const helpResponse = '👋 Hello! I\'m Teacher Arlene from C0D3X SQUAD PENETRATORS. How can I assist you today?';
      await sendMessage(senderId, { text: helpResponse }, token);
      return;
    }

    // --- OWNER QUESTIONS ---
    const ownerKeywords = [
      'who is your owner', 'who created you', 'who made you',
      'sino gumawa sayo', 'sino may ari sayo', 'owner mo',
      'sino owner mo', 'who owns you', 'creator', 'developer'
    ];

    const isOwnerQuestion = ownerKeywords.some(keyword =>
      prompt.toLowerCase().includes(keyword.toLowerCase())
    );

    if (isOwnerQuestion) {
      const ownerResponse = 'I was created by GeoDevz69. For more info, visit: https://www.facebook.com/geotechph.net';
      await sendMessage(senderId, { text: ownerResponse }, token);
      return;
    }

    // --- USER INFO QUESTIONS ---
    const userInfoKeywords = [
      'what is my name', 'ano pangalan ko', 'my name', 'pangalan ko',
      'when is my birthday', 'kelan birthday ko', 'my birthday',
      'who am i', 'sino ako', 'whats my name'
    ];

    const isUserInfoQuestion = userInfoKeywords.some(keyword =>
      prompt.toLowerCase().includes(keyword.toLowerCase())
    );

    if (isUserInfoQuestion) {
      try {
        const userInfo = await getUserInfo(senderId, token);
        let response = '';

        if (prompt.toLowerCase().includes('name') || prompt.toLowerCase().includes('pangalan')) {
          response = userInfo.name ? `Your name is ${userInfo.name}.` : 'I can\'t tell you about that because it\'s confidential.';
        }

        if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('kelan')) {
          const birthdayMsg = userInfo.birthday ? `\nYour birthday is ${userInfo.birthday}.` : '\nI can\'t tell you about that because it\'s confidential.';
          response += birthdayMsg;
        }

        if (!response) {
          const publicInfo = [];
          if (userInfo.name) publicInfo.push(`Name: ${userInfo.name}`);
          if (userInfo.birthday) publicInfo.push(`Birthday: ${userInfo.birthday}`);
          if (userInfo.gender) publicInfo.push(`Gender: ${userInfo.gender}`);
          if (userInfo.location) publicInfo.push(`Location: ${userInfo.location}`);

          response = publicInfo.length > 0 
            ? `Here is your public information:\n${publicInfo.join('\n')}`
            : 'I can\'t tell you about that because it\'s confidential.';
        }

        await sendMessage(senderId, { text: response }, token);
        return;
      } catch (error) {
        console.error(`[User Info] Failed: ${error.message}`);
        await sendMessage(senderId, {
          text: 'Error fetching user info. Please try again later.'
        }, token);
        return;
      }
    }

    // --- GENERAL AI QUERY (using Copilot API) ---
    try {
      console.log('[ai] Sending prompt:', prompt);
      
      const { data } = await axios.get(API_URL, {
        params: {
          prompt: prompt,
          model: 'copilot'
        },
        timeout: 30000,
        headers: {
          'Accept': 'application/json'
        }
      });

      console.log('[ai] API Response:', data);

      // Check different response formats
      let aiResponse = null;
      if (data?.response) {
        aiResponse = data.response;
      } else if (data?.answer) {
        aiResponse = data.answer;
      } else if (data?.result) {
        aiResponse = data.result;
      } else if (data?.message) {
        aiResponse = data.message;
      } else if (typeof data === 'string') {
        aiResponse = data;
      } else if (data && typeof data === 'object') {
        aiResponse = JSON.stringify(data, null, 2);
      }

      if (!aiResponse) {
        throw new Error('Invalid API response format');
      }

      // Clean up the response
      aiResponse = cleanResponse(aiResponse);

      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error('[ai] Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      let errorMessage = 'Server error. Please try again later.';

      if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait a moment.';
      } else if (error.response?.status === 403) {
        errorMessage = 'API key invalid or expired.';
      } else if (error.response?.status === 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Please try again.';
      }

      await sendMessage(senderId, {
        text: errorMessage
      }, token);
    }
  }
};

// --- CLEAN RESPONSE ---
function cleanResponse(text) {
  if (!text) return 'No response.';
  
  let cleaned = text.trim();
  
  // Convert **bold** to *bold* (Messenger style)
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '*$1*');
  
  // Remove single asterisks
  cleaned = cleaned.replace(/\*(?!\*)(.+?)(?<!\*)\*/g, '$1');
  
  // Remove markdown
  cleaned = cleaned.replace(/#{1,6}\s/g, '');
  cleaned = cleaned.replace(/---+/g, '');
  cleaned = cleaned.replace(/__/g, '');
  cleaned = cleaned.replace(/_/g, '');
  
  // Remove excessive emojis (keep some)
  cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
  
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.trim();
  
  return cleaned || 'No response.';
}

// --- GET USER INFO ---
async function getUserInfo(senderId, token) {
  try {
    const url = `https://graph.facebook.com/${senderId}`;
    const params = {
      access_token: token,
      fields: 'id,name,first_name,last_name,birthday,gender,location,email'
    };
    const response = await axios.get(url, { params });
    const data = response.data;

    return {
      id: data.id || null,
      name: data.name || null,
      firstName: data.first_name || null,
      lastName: data.last_name || null,
      birthday: data.birthday || null,
      gender: data.gender || null,
      location: data.location ? data.location.name : null,
      email: data.email || null
    };
  } catch (error) {
    console.error(`[Graph API] Error: ${error.message}`);
    return {};
  }
}

// --- SPLIT MESSAGE ---
function splitMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }
  return chunks;
}

// --- SEND CHUNKS ---
async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    await sendMessage(senderId, { text: chunks[i] }, token);
  }
}
