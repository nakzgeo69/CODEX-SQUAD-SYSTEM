const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://yin-api.vercel.app/ai/chatgptfree';
const MAX_CHUNK = 1900;
const MAX_PROMPT_LENGTH = 10000;

module.exports = {
  name: 'codex',
  description: 'Chat with Teacher Arlene',
  usage: 'codex [message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    let prompt = args.join(' ').trim();

    if (!prompt) {
      await sendMessage(senderId, { 
        text: 'Usage: ai [message]' 
      }, token);
      return;
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      prompt = prompt.substring(0, MAX_PROMPT_LENGTH);
    }

    const lowerPrompt = prompt.toLowerCase();
    const isCodeRequest = /<|>|\{|\}|function|class|const|let|var|<\?php|<!DOCTYPE|import|export|def|async|await|=>/.test(prompt);

    if (lowerPrompt === 'codex') {
      await sendMessage(senderId, { 
        text: 'Teacher Arlene\nCreated by GeoDevz69\n\nSupports: HTML, CSS, JS, PHP, Python, C++, Java, SQL, and more.\n\nAsk me anything or paste your code for review.' 
      }, token);
      return;
    }

    const ownerKeywords = ['owner', 'creator', 'gumawa', 'may ari', 'created', 'made'];
    if (ownerKeywords.some(k => lowerPrompt.includes(k))) {
      await sendMessage(senderId, { 
        text: 'My creator is GeoDevz69.\nFacebook: https://www.facebook.com/geotechph.net' 
      }, token);
      return;
    }

    const userInfoKeywords = ['my name', 'pangalan ko', 'my birthday', 'birthday ko', 'who am i', 'sino ako'];
    if (userInfoKeywords.some(k => lowerPrompt.includes(k))) {
      try {
        const userInfo = await getUserInfo(senderId, token);
        let response = [];

        if (lowerPrompt.includes('name') || lowerPrompt.includes('pangalan')) {
          response.push(userInfo.name ? `Name: ${userInfo.name}` : 'Name: Confidential');
        }
        if (lowerPrompt.includes('birthday') || lowerPrompt.includes('birth') || lowerPrompt.includes('kelan')) {
          response.push(userInfo.birthday ? `Birthday: ${userInfo.birthday}` : 'Birthday: Confidential');
        }
        if (!response.length) {
          response = ['Information:', 
            userInfo.name ? `Name: ${userInfo.name}` : '',
            userInfo.birthday ? `Birthday: ${userInfo.birthday}` : '',
            userInfo.gender ? `Gender: ${userInfo.gender}` : '',
            userInfo.location ? `Location: ${userInfo.location}` : ''
          ].filter(Boolean);
        }
        await sendMessage(senderId, { text: response.join('\n') || 'Information not available.' }, token);
        return;
      } catch (error) {
        console.error(`[User Info] ${error.message}`);
        await sendMessage(senderId, { text: 'Unable to retrieve information.' }, token);
        return;
      }
    }

    try {
      let aiResponse = '';
      let success = false;

      try {
        const response = await axios.post(API_URL, {
          prompt: prompt,
          model: 'chatgpt4'
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 120000
        });
        aiResponse = response.data?.answer || response.data?.response || response.data?.message || '';
        if (aiResponse) success = true;
      } catch (postError) {
        try {
          const encodedPrompt = encodeURIComponent(prompt);
          const response = await axios.get(API_URL, {
            params: { prompt: encodedPrompt, model: 'chatgpt4' },
            timeout: 120000
          });
          aiResponse = response.data?.answer || response.data?.response || response.data?.message || '';
          if (aiResponse) success = true;
        } catch (getError) {
          const chunks = splitPrompt(prompt, 2000);
          let combined = '';
          for (let i = 0; i < chunks.length; i++) {
            try {
              const chunkResponse = await axios.post(API_URL, {
                prompt: `Part ${i+1}/${chunks.length}: ${chunks[i]}`,
                model: 'chatgpt4'
              }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 60000
              });
              const chunkText = chunkResponse.data?.answer || chunkResponse.data?.response || chunkResponse.data?.message || '';
              combined += chunkText + '\n';
            } catch (chunkError) {
              console.error(`[Chunk ${i+1}] ${chunkError.message}`);
            }
          }
          if (combined) {
            aiResponse = combined;
            success = true;
          }
        }
      }

      if (!success || !aiResponse) {
        throw new Error('No response from API');
      }

      aiResponse = aiResponse
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .replace(/\*/g, '')
        .replace(/#{1,6}\s/g, '')
        .replace(/---+/g, '')
        .replace(/__/g, '')
        .replace(/_/g, '')
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[\u{2600}-\u{27BF}]/gu, '')
        .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

      if (isCodeRequest) {
        aiResponse = 'Code Analysis:\n\n' + aiResponse;
      }

      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error(`[AI] ${error.message}`);
      let errorMsg = 'Server error. Please try again later.';
      if (error.response?.status === 413) errorMsg = 'Message too large. Please split into smaller parts.';
      else if (error.code === 'ECONNABORTED') errorMsg = 'Request timeout. Try shorter message.';
      else if (error.response?.status === 429) errorMsg = 'Too many requests. Please wait.';
      else if (error.response?.status === 500) errorMsg = 'API server error. Try again later.';
      await sendMessage(senderId, { text: errorMsg }, token);
    }
  }
};

async function getUserInfo(senderId, token) {
  try {
    const response = await axios.get(`https://graph.facebook.com/${senderId}`, {
      params: {
        access_token: token,
        fields: 'id,name,first_name,last_name,birthday,gender,location,email'
      }
    });
    const data = response.data;
    return {
      id: data.id || null,
      name: data.name || null,
      firstName: data.first_name || null,
      lastName: data.last_name || null,
      birthday: data.birthday || null,
      gender: data.gender || null,
      location: data.location?.name || null,
      email: data.email || null
    };
  } catch (error) {
    console.error(`[Graph API] ${error.message}`);
    return {};
  }
}

function splitPrompt(text, maxLength) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }
  return chunks;
}

function splitMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }
  return chunks;
}

async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    await sendMessage(senderId, { text: chunk }, token);
  }
}
