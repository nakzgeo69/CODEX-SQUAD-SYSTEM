const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'opera', 'ask'],
  description: 'Chat with AI with reply/thread support',
  usage: 'ai [message] or reply to AI message',
  version: '2.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let previousResponse = null;
      let isReply = false;

      if (event?.message?.reply_to?.mid) {
        isReply = true;
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        previousResponse = replyData.message;
        if (!prompt) {
          prompt = 'Please respond to what I said.';
        }
      }

      if (!isReply && prompt) {
        const history = conversationHistory[senderId];
        if (history && history.lastResponse) {
          const lowerPrompt = prompt.toLowerCase();
          if (this.isFollowUpRequest(lowerPrompt)) {
            previousResponse = history.lastResponse;
            isReply = true;
          }
        }
      }

      if (!prompt && !isReply) {
        await sendMessage(senderId, {
          text: 'Hello. I am Teacher Arlene from C0D3X SQU4D PENETRATORS, your AI Assistant. How can I assist you today?'
        }, token);
        return;
      }

      if (this.isOwnerQuestion(prompt)) {
        await sendMessage(senderId, {
          text: 'I was created by GeoDevz69. Visit here for more clarifications:\nhttps://www.facebook.com/geotechph.net'
        }, token);
        return;
      }

      if (this.isUserInfoQuestion(prompt)) {
        await this.handleUserInfo(senderId, prompt, token);
        return;
      }

      const finalPrompt = this.buildFinalPrompt(prompt, previousResponse, isReply);
      const response = await this.callAPI(finalPrompt);
      let aiResponse = this.cleanResponse(response || 'No response from API.');

      conversationHistory[senderId] = {
        lastPrompt: prompt,
        lastResponse: aiResponse,
        timestamp: Date.now()
      };

      this.cleanOldHistory();

      if (isReply && this.isTranslationRequest(prompt)) {
        const targetLanguage = this.detectTargetLanguage(prompt);
        aiResponse = await this.translateResponse(aiResponse, targetLanguage);
      }

      await this.sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error('[ai] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  isFollowUpRequest(prompt) {
    const keywords = [
      'translate', 'translate to', 'translate into', 'translate in',
      'translation', 'isalin', 'salin', 'ipasalin', 'isalin sa',
      'tagalog', 'bisaya', 'cebuano', 'spanish', 'filipino',
      'elaborate', 'explain more', 'paki elaborate', 'detail', 'further',
      'summarize', 'summary', 'i-summarize', 'brief', 'make it short',
      'short', 'concise', 'shorten',
      'simplify', 'simple', 'pasimplehin', 'basic', 'simplified',
      'example', 'sample', 'halimbawa', 'instance',
      'correct', 'fix', 'tama', 'ayusin', 'improve', 'better',
      'add', 'additional', 'dagdagan', 'more',
      'humanize', 'make it human', 'conversational', 'natural',
      'make it natural', 'parang tao', 'human-like'
    ];
    return keywords.some(keyword => prompt.includes(keyword));
  },

  cleanOldHistory() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000;
    for (const [userId, data] of Object.entries(conversationHistory)) {
      if (now - data.timestamp > maxAge) {
        delete conversationHistory[userId];
      }
    }
  },

  getApiConfig() {
    return {
      url: 'https://free-goat-api.onrender.com/rapidai',
      method: 'GET',
      responsePath: 'result',
      successField: 'status',
      timeout: 60000,
      imageSupport: false,
      headers: {}
    };
  },

  async callAPI(prompt) {
    const config = this.getApiConfig();
    let retries = 3;
    let lastError = null;

    while (retries > 0) {
      try {
        const encodedPrompt = encodeURIComponent(prompt);
        const apiUrl = `${config.url}?message=${encodedPrompt}`;
        const response = await axios.get(apiUrl, {
          timeout: config.timeout,
          headers: { 'Accept': 'application/json', ...config.headers }
        });

        const data = response.data;
        if (data.status !== true) {
          throw new Error('API returned error status');
        }

        const extracted = this.extractResponse(data, config);
        if (extracted) {
          return this.standardizeResponse(extracted);
        } else {
          throw new Error('API returned empty response');
        }
      } catch (error) {
        lastError = error;
        retries--;
        if (retries > 0) {
          const delay = error.response?.status === 429 ? 5000 : 2000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Failed to get response');
  },

  extractResponse(data, config) {
    if (config.responsePath) {
      const path = config.responsePath.split('.');
      let value = data;
      for (const key of path) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return null;
        }
      }
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    const formats = ['result', 'response', 'data', 'message', 'text', 'content'];
    for (const format of formats) {
      const path = format.split('.');
      let value = data;
      for (const key of path) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          value = null;
          break;
        }
      }
      if (value && typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    return null;
  },

  standardizeResponse(response) {
    return response
      .replace(/^I'?m?\s+a?\s*AI.*?model.*?\n\n?/i, '')
      .replace(/^As an AI.*?\n\n?/i, '')
      .replace(/^Here is my response.*?\n/i, '')
      .replace(/^Let me answer.*?\n/i, '')
      .replace(/^Based on my knowledge.*?\n/i, '')
      .replace(/^I can help you.*?\n/i, '')
      .trim();
  },

  buildFinalPrompt(prompt, previousResponse, isReply) {
    let finalPrompt = '';

    if (previousResponse) {
      finalPrompt += 'Previous conversation:\n';
      finalPrompt += 'AI: ' + previousResponse + '\n\n';
      
      const lowerPrompt = prompt.toLowerCase();

      if (this.isTranslationRequest(prompt)) {
        const lang = this.detectTargetLanguage(prompt);
        finalPrompt += 'User wants to translate the previous response to ' + lang + '.\n';
        finalPrompt += 'Provide the translation to ' + lang + ' only. Do not include the original text.\n\n';
      } else if (lowerPrompt.includes('humanize') || lowerPrompt.includes('make it human') || 
                 lowerPrompt.includes('conversational') || lowerPrompt.includes('natural') ||
                 lowerPrompt.includes('make it natural') || lowerPrompt.includes('parang tao') ||
                 lowerPrompt.includes('human-like')) {
        finalPrompt += 'User wants you to make your previous response more human and conversational.\n';
        finalPrompt += 'Rewrite it in a natural, friendly, and engaging tone.\n';
        finalPrompt += 'Use simple language, add personality, and make it sound like a real person talking.\n';
        finalPrompt += 'Keep the same meaning but make it more natural and easy to understand.\n\n';
      } else if (lowerPrompt.includes('elaborate') || lowerPrompt.includes('explain more') || 
                 lowerPrompt.includes('paki elaborate') || lowerPrompt.includes('detail') ||
                 lowerPrompt.includes('further')) {
        finalPrompt += 'User wants you to elaborate on your previous response.\n';
        finalPrompt += 'Provide a detailed explanation with more information, context, and examples.\n';
        finalPrompt += 'Expand on each point thoroughly.\n\n';
      } else if (lowerPrompt.includes('summarize') || lowerPrompt.includes('summary') || 
                 lowerPrompt.includes('i-summarize') || lowerPrompt.includes('brief') ||
                 lowerPrompt.includes('make it short') || lowerPrompt.includes('short') ||
                 lowerPrompt.includes('concise') || lowerPrompt.includes('shorten')) {
        finalPrompt += 'User wants a concise summary of your previous response.\n';
        finalPrompt += 'Provide only the most important key points in a short, clear, and direct manner.\n\n';
      } else if (lowerPrompt.includes('simplify') || lowerPrompt.includes('simple') || 
                 lowerPrompt.includes('pasimplehin') || lowerPrompt.includes('basic') ||
                 lowerPrompt.includes('simplified')) {
        finalPrompt += 'User wants a simpler explanation.\n';
        finalPrompt += 'Explain using simple words and layman terms.\n\n';
      } else if (lowerPrompt.includes('example') || lowerPrompt.includes('sample') || 
                 lowerPrompt.includes('halimbawa') || lowerPrompt.includes('instance')) {
        finalPrompt += 'User wants examples related to your previous response.\n';
        finalPrompt += 'Provide relevant examples to illustrate your points.\n\n';
      } else if (lowerPrompt.includes('correct') || lowerPrompt.includes('fix') || 
                 lowerPrompt.includes('tama') || lowerPrompt.includes('ayusin') ||
                 lowerPrompt.includes('improve') || lowerPrompt.includes('better')) {
        finalPrompt += 'User wants you to correct or improve your previous response.\n';
        finalPrompt += 'Review and provide an improved version.\n\n';
      } else if (lowerPrompt.includes('add') || lowerPrompt.includes('additional') || 
                 lowerPrompt.includes('dagdagan') || lowerPrompt.includes('more')) {
        finalPrompt += 'User wants additional information.\n';
        finalPrompt += 'Add more details, examples, or context.\n\n';
      } else if (lowerPrompt.includes('what') || lowerPrompt.includes('why') || 
                 lowerPrompt.includes('how') || lowerPrompt.includes('when') || 
                 lowerPrompt.includes('where') || lowerPrompt.includes('who') ||
                 lowerPrompt.includes('ano') || lowerPrompt.includes('bakit') ||
                 lowerPrompt.includes('paano') || lowerPrompt.includes('kailan')) {
        finalPrompt += 'User asks: ' + prompt + '\n';
        finalPrompt += 'Answer the question directly based on the previous context.\n\n';
      } else {
        finalPrompt += 'User is responding to your previous message.\n';
        finalPrompt += 'User says: ' + prompt + '\n';
        finalPrompt += 'Provide a direct and relevant response based on the previous context.\n\n';
      }
    } else {
      finalPrompt = prompt;
    }

    finalPrompt += 'IMPORTANT GUIDELINES:\n';
    finalPrompt += '- Be accurate and precise in your response.\n';
    finalPrompt += '- Provide complete and thorough answers.\n';
    finalPrompt += '- For math problems, show step-by-step solution.\n';
    finalPrompt += '- For analysis, provide detailed description and context.\n';
    finalPrompt += '- Use plain text only. No symbols or markdown.\n';
    finalPrompt += '- If unsure, state that clearly.\n';
    finalPrompt += '- Do not ask questions back. Just provide the complete response.\n';

    return finalPrompt;
  },

  isOwnerQuestion(prompt) {
    const keywords = [
      'who is your owner', 'who created you', 'who made you',
      'sino gumawa sayo', 'sino may ari sayo', 'owner mo',
      'sino owner mo', 'who owns you', 'creator', 'developer'
    ];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword.toLowerCase()));
  },

  isUserInfoQuestion(prompt) {
    const keywords = [
      'what is my name', 'ano pangalan ko', 'my name', 'pangalan ko',
      'when is my birthday', 'kelan birthday ko', 'my birthday',
      'who am i', 'sino ako', 'whats my name'
    ];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword.toLowerCase()));
  },

  isTranslationRequest(prompt) {
    const keywords = [
      'translate', 'translate to', 'translate into', 'translate in',
      'translation', 'isalin', 'salin', 'ipasalin', 'isalin sa'
    ];
    const promptLower = prompt.toLowerCase();
    if (keywords.some(keyword => promptLower.includes(keyword))) {
      return true;
    }
    const languages = [
      'tagalog', 'bisaya', 'cebuano', 'spanish', 'filipino',
      'english', 'ilocano', 'waray', 'hiligaynon', 'kapampangan',
      'pangasinan', 'bicolano', 'chinese', 'mandarin', 'cantonese',
      'japanese', 'nihongo', 'korean', 'hangeul', 'french',
      'francais', 'german', 'deutsch', 'italian', 'italiano',
      'portuguese', 'russian', 'arabic', 'hindi', 'urdu',
      'bengali', 'tamil', 'telugu', 'marathi', 'gujarati',
      'kannada', 'malayalam', 'thai', 'vietnamese', 'indonesian',
      'malay', 'burmese', 'khmer', 'lao', 'nepali', 'sinhala',
      'armenian', 'hebrew', 'greek', 'latin', 'dutch', 'swedish',
      'norwegian', 'danish', 'finnish', 'polish', 'czech',
      'hungarian', 'romanian', 'bulgarian', 'serbian', 'croatian'
    ];
    return languages.some(lang => promptLower.includes(lang));
  },

  detectTargetLanguage(prompt) {
    const promptLower = prompt.toLowerCase();
    const languages = {
      'tagalog': 'Tagalog', 'filipino': 'Filipino',
      'bisaya': 'Bisaya', 'cebuano': 'Cebuano',
      'ilocano': 'Ilocano', 'waray': 'Waray',
      'hiligaynon': 'Hiligaynon', 'kapampangan': 'Kapampangan',
      'pangasinan': 'Pangasinan', 'bicolano': 'Bicolano',
      'chavacano': 'Chavacano', 'chinese': 'Chinese',
      'mandarin': 'Mandarin', 'cantonese': 'Cantonese',
      'japanese': 'Japanese', 'nihongo': 'Japanese',
      'korean': 'Korean', 'hangeul': 'Korean',
      'thai': 'Thai', 'vietnamese': 'Vietnamese',
      'indonesian': 'Indonesian', 'malay': 'Malay',
      'burmese': 'Burmese', 'khmer': 'Khmer',
      'lao': 'Lao', 'nepali': 'Nepali',
      'sinhala': 'Sinhala', 'armenian': 'Armenian',
      'hebrew': 'Hebrew', 'arabic': 'Arabic',
      'hindi': 'Hindi', 'urdu': 'Urdu',
      'bengali': 'Bengali', 'tamil': 'Tamil',
      'telugu': 'Telugu', 'marathi': 'Marathi',
      'gujarati': 'Gujarati', 'kannada': 'Kannada',
      'malayalam': 'Malayalam', 'english': 'English',
      'spanish': 'Spanish', 'french': 'French',
      'francais': 'French', 'german': 'German',
      'deutsch': 'German', 'italian': 'Italian',
      'italiano': 'Italian', 'portuguese': 'Portuguese',
      'russian': 'Russian', 'greek': 'Greek',
      'latin': 'Latin', 'dutch': 'Dutch',
      'swedish': 'Swedish', 'norwegian': 'Norwegian',
      'danish': 'Danish', 'finnish': 'Finnish',
      'polish': 'Polish', 'czech': 'Czech',
      'hungarian': 'Hungarian', 'romanian': 'Romanian',
      'bulgarian': 'Bulgarian', 'serbian': 'Serbian',
      'croatian': 'Croatian'
    };
    for (const [key, value] of Object.entries(languages)) {
      if (promptLower.includes(key)) {
        return value;
      }
    }
    return 'English';
  },

  async translateResponse(text, targetLanguage) {
    try {
      const translatePrompt = `Translate this text to ${targetLanguage}. Only provide the translation, no other text. Do not include the original text. Here is the text to translate: ${text}`;
      const response = await this.callAPI(translatePrompt);
      return response || text;
    } catch (error) {
      console.error('[Translation] Failed:', error.message);
      return text;
    }
  },

  async getRepliedMessageData(mid, token) {
    try {
      const url = `https://graph.facebook.com/v21.0/${mid}`;
      const params = {
        access_token: token,
        fields: 'message,from,attachments'
      };
      const { data } = await axios.get(url, { params });
      return {
        message: data?.message || null,
        from: data?.from?.id || null
      };
    } catch (error) {
      console.error('[Get Replied Message] Failed:', error.message);
      return { message: null, from: null };
    }
  },

  async handleUserInfo(senderId, prompt, token) {
    try {
      const userInfo = await this.getUserInfo(senderId, token);
      let response = '';

      if (prompt.toLowerCase().includes('name') || prompt.toLowerCase().includes('pangalan')) {
        response = userInfo.name ? `Your name is ${userInfo.name}.` : 'I cannot tell you that because it is confidential.';
      }

      if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('kelan')) {
        response += userInfo.birthday ? `\nYour birthday is ${userInfo.birthday}.` : '\nI cannot tell you that because it is confidential.';
      }

      if (!response) {
        const publicInfo = [];
        if (userInfo.name) publicInfo.push(`Name: ${userInfo.name}`);
        if (userInfo.birthday) publicInfo.push(`Birthday: ${userInfo.birthday}`);
        if (userInfo.gender) publicInfo.push(`Gender: ${userInfo.gender}`);
        if (userInfo.location) publicInfo.push(`Location: ${userInfo.location}`);
        response = publicInfo.length > 0
          ? `Here is your public information:\n${publicInfo.join('\n')}`
          : 'I cannot tell you that because it is confidential.';
      }

      await sendMessage(senderId, { text: response }, token);
    } catch (error) {
      console.error('[User Info] Failed:', error.message);
      await sendMessage(senderId, { text: 'Error fetching user info.' }, token);
    }
  },

  async getUserInfo(senderId, token) {
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
      console.error('[Graph API] Error:', error.message);
      return {};
    }
  },

  cleanResponse(text) {
    if (!text) return 'No response.';
    let cleaned = text.trim();
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/---+/g, '');
    cleaned = cleaned.replace(/__/g, '');
    cleaned = cleaned.replace(/_/g, '');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');
    cleaned = cleaned.replace(/~~/g, '');
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F700}-\u{1F77F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F780}-\u{1F7FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F800}-\u{1F8FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1F900}-\u{1F9FF}]/gu, '');
    cleaned = cleaned.replace(/[\u{1FA00}-\u{1FA6F}]/gu, '');
    cleaned = cleaned.replace(/[\u{1FA70}-\u{1FAFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/[\u{24C2}-\u{1F251}]/gu, '');
    return cleaned.trim() || 'No response.';
  },

  getErrorMessage(error) {
    if (error.code === 'ECONNABORTED') {
      return 'Request timeout. Please try again.';
    }
    if (error.response?.status === 429) {
      return 'Rate limit exceeded. Please wait a moment.';
    }
    if (error.response?.status === 403) {
      return 'API key invalid or expired.';
    }
    if (error.response?.status >= 500) {
      return 'Server error. Please try again later.';
    }
    return 'Error processing request. Please try again.';
  },

  splitMessage(text) {
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX_CHUNK) {
      chunks.push(text.slice(i, i + MAX_CHUNK));
    }
    return chunks;
  },

  async sendChunks(senderId, text, token) {
    const chunks = this.splitMessage(text);
    for (const chunk of chunks) {
      await sendMessage(senderId, { text: chunk }, token);
    }
  }
};
