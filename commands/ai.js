const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'ai',
  description: 'Chat with Teacher Arlene',
  usage: 'ai [message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim();

    // Default response for "help" only (no question)
    if (!prompt || prompt.toLowerCase() === 'help') {
      const helpResponse = 'Hello! I\'m Teacher Arlene! Created by GeoDevz69. How can I assist you today?';
      await sendMessage(senderId, { text: helpResponse }, token);
      return;
    }

    // Check for owner questions
    const ownerKeywords = [
      'who is your owner', 'who is your owner?', 'who owns you', 'who owns you?',
      'who created you', 'who created you?', 'who made you', 'who made you?',
      'sino gumawa sayo', 'sino gumawa sa iyo', 'sino gumawa', 'sino ang gumawa',
      'sino may ari sayo', 'sino may ari sa iyo', 'sino owner mo', 'sino owner',
      'owner mo', 'owner', 'creater', 'creator'
    ];

    const isOwnerQuestion = ownerKeywords.some(keyword => 
      prompt.toLowerCase().includes(keyword.toLowerCase())
    );

    if (isOwnerQuestion) {
      const ownerResponse = 'Wow! Nice question, well my boss GeoDevz69 created me, you can contact him with this link below.\n\nhttps://www.facebook.com/geotechph.net';
      await sendMessage(senderId, { text: ownerResponse }, token);
      return;
    }

    // Check for user info questions (name, birthday, etc.)
    const userInfoKeywords = [
      'what is my name', 'ano pangalan ko', 'my name', 'pangalan ko',
      'whats my name', 'what\'s my name',
      'when is my birthday', 'kelan birthday ko', 'my birthday', 'birthday ko',
      'who am i', 'sino ako'
    ];

    const isUserInfoQuestion = userInfoKeywords.some(keyword => 
      prompt.toLowerCase().includes(keyword.toLowerCase())
    );

    if (isUserInfoQuestion) {
      try {
        // Get user info from Facebook Graph API
        const userInfo = await getUserInfo(senderId, token);
        
        let response = '';
        
        // Check if asking for name
        if (prompt.toLowerCase().includes('name') || prompt.toLowerCase().includes('pangalan')) {
          if (userInfo.name) {
            response = `Your name is ${userInfo.name}.`;
          } else {
            response = 'I cant tell you about that because its confidencial.';
          }
        }
        
        // Check if asking for birthday
        if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('birth') || prompt.toLowerCase().includes('kelan')) {
          if (userInfo.birthday) {
            response += `\nYour birthday is ${userInfo.birthday}.`;
          } else {
            response += '\nI cant tell you about that because its confidencial..';
          }
        }
        
        // If no specific info asked, show all available public info
        if (!response) {
          const publicInfo = [];
          if (userInfo.name) publicInfo.push(`Name: ${userInfo.name}`);
          if (userInfo.birthday) publicInfo.push(`Birthday: ${userInfo.birthday}`);
          if (userInfo.gender) publicInfo.push(`Gender: ${userInfo.gender}`);
          if (userInfo.location) publicInfo.push(`Location: ${userInfo.location}`);
          
          if (publicInfo.length > 0) {
            response = `Here is your public information:\n${publicInfo.join('\n')}`;
          } else {
            response = 'I cant tell you about that because its confidencial..';
          }
        }
        
        await sendMessage(senderId, { text: response }, token);
        return;
        
      } catch (error) {
        console.error(`[User Info] Failed: ${error.message}`);
        await sendMessage(senderId, {
          text: 'Please try again after 15.0s.'
        }, token);
        return;
      }
    }

    // Process other queries with API
    try {
      const { data } = await axios.get(API_URL, {
        params: { 
          prompt: prompt,
          model: 'chatgpt4'
        },
        timeout: 15000
      });

      if (!data?.answer) {
        throw new Error('Invalid API response');
      }

      let aiResponse = data.answer.trim();
      
      // Convert **text** to Messenger bold format (*text*)
      aiResponse = aiResponse.replace(/\*\*(.+?)\*\*/g, '*$1*');
      aiResponse = aiResponse.replace(/\*/g, '');
      aiResponse = aiResponse.replace(/#{1,6}\s/g, '');
      aiResponse = aiResponse.replace(/---+/g, '');
      aiResponse = aiResponse.replace(/__/g, '');
      aiResponse = aiResponse.replace(/_/g, '');
      
      // Remove emojis
      aiResponse = aiResponse.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
      aiResponse = aiResponse.replace(/[\u{2600}-\u{27BF}]/gu, '');
      aiResponse = aiResponse.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
      
      // Clean up
      aiResponse = aiResponse.replace(/\n{3,}/g, '\n\n');
      aiResponse = aiResponse.replace(/[ \t]+/g, ' ');
      aiResponse = aiResponse.trim();

      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      const reason = error.response
        ? `API error ${error.response.status}`
        : error.message ?? 'Unknown error';

      console.error(`[help] Failed for sender ${senderId}: ${reason}`);
      await sendMessage(senderId, {
        text: 'Server error. Please try again later.'
      }, token);
    }
  }
};

// Function to get user info from Facebook
async function getUserInfo(senderId, token) {
  try {
    // Facebook Graph API call to get user profile
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

const API_URL = 'https://yin-api.vercel.app/ai/chatgptfree';
const MAX_CHUNK = 1900;

function splitMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }
  return chunks;
}

async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    await sendMessage(senderId, { text: chunks[i] }, token);
  }
}
