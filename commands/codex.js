const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://api-library-kohi-production.up.railway.app/api/publicai';
const MAX_CHUNK = 1900;
const MAX_PROMPT_LENGTH = 10000;

module.exports = {
  name: 'codex',
  description: 'Advanced Code Assistant & Debugger',
  usage: 'codex [code/message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    let prompt = args.join(' ').trim();

    if (!prompt) {
      await sendMessage(senderId, {
        text: 'Usage: codex [your code or question]'
      }, token);
      return;
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      prompt = prompt.substring(0, MAX_PROMPT_LENGTH);
    }

    const lowerPrompt = prompt.toLowerCase();
    const isCodeRequest = /<|>|\{|\}|function|class|const|let|var|<\?php|<!DOCTYPE|import|export|def|async|await|=>|#include|public class|System.out|SELECT|INSERT|UPDATE|DELETE|package|func|fn|interface|type|\.css|\.jsx|\.tsx/.test(prompt);

    if (lowerPrompt === 'codex' || lowerPrompt === 'help') {
      await sendMessage(senderId, {
        text: 'CODE-X Assistant\nCreated by GeoDevz69\n\nSupported Languages:\nHTML, CSS, JS, PHP, Python, Java, C++, C#, Ruby, SQL, Go, Rust, TypeScript, JSON, XML\n\nFeatures:\n- Code debugging\n- Code optimization\n- Code explanation\n- Syntax checking\n- Best practices\n\nExample: codex fix this function [paste code]'
      }, token);
      return;
    }

    const ownerKeywords = ['owner', 'creator', 'gumawa', 'may ari', 'created', 'made', 'who made you', 'sino gumawa'];
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
        const response = await axios.get(API_URL, {
          params: {
            prompt: prompt,
            user: '123'
          },
          timeout: 120000
        });
        
        aiResponse = response.data?.data || response.data?.response || response.data?.answer || response.data?.message || '';
        if (aiResponse) success = true;
      } catch (getError) {
        try {
          const encodedPrompt = encodeURIComponent(prompt);
          const response = await axios.get(API_URL, {
            params: {
              prompt: encodedPrompt,
              user: '123'
            },
            timeout: 120000
          });
          aiResponse = response.data?.data || response.data?.response || response.data?.answer || response.data?.message || '';
          if (aiResponse) success = true;
        } catch (retryError) {
          const chunks = splitPrompt(prompt, 2000);
          let combined = '';
          for (let i = 0; i < chunks.length; i++) {
            try {
              const chunkResponse = await axios.get(API_URL, {
                params: {
                  prompt: `Part ${i+1}/${chunks.length}: ${chunks[i]}`,
                  user: '123'
                },
                timeout: 60000
              });
              const chunkText = chunkResponse.data?.data || chunkResponse.data?.response || chunkResponse.data?.answer || chunkResponse.data?.message || '';
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

      // Clean response but preserve code blocks
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

      // Add header for code requests
      if (isCodeRequest) {
        aiResponse = '[CODE-X ANALYSIS]\n\n' + aiResponse;
      }

      // Send full response in chunks
      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error(`[CODE-X] ${error.message}`);
      let errorMsg = 'Server error. Please try again later.';
      if (error.response?.status === 413) errorMsg = 'Message too large. Split into smaller parts.';
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
  // Increase chunk size for code
  const chunkSize = 2000;
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    let chunkText = chunks[i];
    // Add part indicator for multiple chunks
    if (chunks.length > 1) {
      chunkText = `[Part ${i+1}/${chunks.length}]\n${chunkText}`;
    }
    await sendMessage(senderId, { text: chunkText }, token);
    // Add delay between chunks to avoid rate limiting
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}
