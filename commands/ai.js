const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'opera', 'ask', 'chat', 'answer'],
  description: 'Text-based AI assistant',
  usage: 'ai [question]',
  version: '2.1.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let previousResponse = null;
      let isReply = false;
      let previousPrompt = null;

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
          const isFollowUp = this.isFollowUpRequest(lowerPrompt) || 
                            this.isContextualQuestion(lowerPrompt, history.lastPrompt);
          const isNewTopic = this.isNewTopic(lowerPrompt, history.lastPrompt);
          
          if (isFollowUp && !isNewTopic) {
            previousResponse = history.lastResponse;
            previousPrompt = history.lastPrompt;
            isReply = true;
          } else {
            delete conversationHistory[senderId];
          }
        }
      }

      if (!prompt && !isReply) {
        await sendMessage(senderId, {
          text: 'Hello. I am Teacher Arlene, your AI Assistant. How can I assist you today?'
        }, token);
        return;
      }

      if (this.isOwnerQuestion(prompt)) {
        await sendMessage(senderId, {
          text: 'I was created by GeoDevz69. Visit here for more information: https://www.facebook.com/geotechph.net'
        }, token);
        return;
      }

      if (this.isUserInfoQuestion(prompt)) {
        await this.handleUserInfo(senderId, prompt, token);
        return;
      }

      const wantsDetailed = this.wantsDetailedAnswer(prompt);
      const finalPrompt = this.buildFinalPrompt(prompt, previousResponse, previousPrompt, isReply, wantsDetailed);
      
      const response = await this.callAPI(finalPrompt, senderId);
      let aiResponse = this.cleanResponse(response || 'No response from API.');

      if (!isReply && !wantsDetailed) {
        aiResponse = this.shortenResponse(aiResponse);
      }

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
      console.error('[AI] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  async callAPI(prompt, senderId) {
    const apiConfigs = [
      {
        name: 'Cedds DeepChat',
        url: 'https://ceddsrestapi.vercel.app/ai/deepchat',
        param: 'text',
        responsePath: 'data',
        successField: 'success',
        timeout: 60000
      },
      {
        name: 'Cedds ChatPlus',
        url: 'https://ceddsrestapi.vercel.app/ai/chatplus',
        param: 'message',
        responsePath: 'result',
        successField: 'operator',
        successValue: 'ceddsdev',
        timeout: 60000
      },
      {
        name: 'Pollination AI',
        url: 'https://api-library-kohi-production.up.railway.app/api/pollination-ai',
        param: 'prompt',
        responsePath: 'data',
        successField: 'status',
        timeout: 60000
      },
      {
        name: 'Opera AI',
        url: 'https://betadash-api-swordslush-production.up.railway.app/opera',
        param: 'ask',
        responsePath: 'message',
        successField: 'success',
        timeout: 60000
      }
    ];

    let lastError = null;

    for (let i = 0; i < apiConfigs.length; i++) {
      const config = apiConfigs[i];
      let retries = 2;
      
      while (retries > 0) {
        try {
          const encodedPrompt = encodeURIComponent(prompt);
          const apiUrl = `${config.url}?${config.param}=${encodedPrompt}`;
          
          const response = await axios.get(apiUrl, {
            timeout: config.timeout || 60000,
            headers: { 'Accept': 'application/json' },
            maxContentLength: 100000000,
            maxBodyLength: 100000000
          });

          const data = response.data;
          
          const expectedSuccess = config.successValue !== undefined ? config.successValue : true;
          const actualSuccess = data[config.successField];
          
          if (actualSuccess !== expectedSuccess) {
            throw new Error(`API returned ${config.successField}: ${actualSuccess}`);
          }

          const extracted = this.extractResponse(data, config);
          if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
            return this.standardizeResponse(extracted);
          }
          
          throw new Error('Empty response');
          
        } catch (error) {
          lastError = error;
          retries--;
          
          if (retries > 0) {
            const delay = error.response?.status === 429 ? 5000 : 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    }

    throw lastError || new Error('All APIs failed');
  },

  extractResponse(data, config) {
    if (config.responsePath) {
      const path = config.responsePath.split('.');
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

    const formats = ['data', 'result', 'response', 'message', 'text', 'content', 'output'];
    for (const format of formats) {
      if (data && typeof data === 'object' && data[format] && typeof data[format] === 'string') {
        return data[format];
      }
    }

    if (typeof data === 'string' && data.trim()) {
      return data;
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

  buildFinalPrompt(prompt, previousResponse, previousPrompt, isReply, wantsDetailed) {
    let finalPrompt = '';

    if (previousResponse) {
      finalPrompt += 'Previous conversation context:\n';
      finalPrompt += 'User asked: ' + (previousPrompt || 'unknown') + '\n';
      finalPrompt += 'AI responded: ' + previousResponse + '\n\n';
      
      const lowerPrompt = prompt.toLowerCase();

      if (this.isContextualQuestion(lowerPrompt, previousPrompt)) {
        finalPrompt += 'User is asking a follow-up question about the previous topic.\n';
        finalPrompt += 'Provide a direct answer that continues the conversation naturally.\n\n';
      }

      if (this.isTranslationRequest(prompt)) {
        const lang = this.detectTargetLanguage(prompt);
        finalPrompt += 'User wants to translate the previous response to ' + lang + '.\n';
        finalPrompt += 'Provide the translation to ' + lang + ' only.\n\n';
      } else if (lowerPrompt.includes('humanize') || lowerPrompt.includes('make it human')) {
        finalPrompt += 'User wants you to make your previous response more human and conversational.\n';
        finalPrompt += 'Rewrite it in a natural, friendly, and engaging tone.\n\n';
      } else if (lowerPrompt.includes('elaborate') || lowerPrompt.includes('explain more')) {
        finalPrompt += 'User wants you to elaborate on your previous response.\n';
        finalPrompt += 'Provide a detailed explanation with more information, context, and examples.\n\n';
      } else if (lowerPrompt.includes('summarize') || lowerPrompt.includes('summary')) {
        finalPrompt += 'User wants a concise summary of your previous response.\n';
        finalPrompt += 'Provide only the most important key points in a short, clear manner.\n\n';
      } else if (lowerPrompt.includes('simplify') || lowerPrompt.includes('simple')) {
        finalPrompt += 'User wants a simpler explanation.\n';
        finalPrompt += 'Explain using simple words and layman terms.\n\n';
      } else if (lowerPrompt.includes('example') || lowerPrompt.includes('sample')) {
        finalPrompt += 'User wants examples related to your previous response.\n';
        finalPrompt += 'Provide relevant examples to illustrate your points.\n\n';
      } else {
        finalPrompt += 'User is continuing the conversation: ' + prompt + '\n';
        finalPrompt += 'Provide a natural response that continues the discussion.\n\n';
      }
    } else {
      finalPrompt = prompt;
    }

    if (wantsDetailed) {
      finalPrompt += 'Provide a complete and detailed explanation.\n';
      finalPrompt += 'Include examples, context, and comprehensive information.\n\n';
    } else {
      finalPrompt += 'Provide a concise and direct response.\n';
      finalPrompt += 'Be straight to the point. Just the key facts.\n\n';
    }

    finalPrompt += 'Important guidelines:\n';
    finalPrompt += '- Be accurate and precise.\n';
    finalPrompt += '- For math problems, show step-by-step solution.\n';
    finalPrompt += '- Use plain text only.\n';
    finalPrompt += '- Do not use "..." to truncate.\n';
    finalPrompt += '- Provide complete answers.\n';
    finalPrompt += '- Be friendly and engaging.\n';

    return finalPrompt;
  },

  isTranslationRequest(prompt) {
    const keywords = [
      'translate', 'translate to', 'translate into', 'translate in',
      'translation', 'isalin', 'salin', 'ipasalin', 'isalin sa',
      'transl', 'trans', 'tl', 'bis', 'ceb', 'eng', 'spa',
      'tagalog', 'bisaya', 'cebuano', 'spanish', 'filipino',
      'english', 'ilocano', 'waray', 'hiligaynon', 'kapampangan'
    ];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  detectTargetLanguage(prompt) {
    const promptLower = prompt.toLowerCase();
    const languages = {
      'tagalog': 'Tagalog', 'filipino': 'Filipino',
      'bisaya': 'Bisaya', 'cebuano': 'Cebuano',
      'ilocano': 'Ilocano', 'waray': 'Waray',
      'hiligaynon': 'Hiligaynon', 'kapampangan': 'Kapampangan',
      'english': 'English', 'spanish': 'Spanish'
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
      const translatePrompt = 'Translate this text to ' + targetLanguage + '. Only provide the translation, no other text: ' + text;
      const response = await this.callAPI(translatePrompt);
      return response || text;
    } catch (error) {
      console.error('[Translation] Failed:', error.message);
      return text;
    }
  },

  isOwnerQuestion(prompt) {
    const keywords = [
      'who is your owner', 'who created you', 'who made you',
      'sino gumawa sayo', 'sino may ari sayo', 'owner mo',
      'sino owner mo', 'who owns you', 'creator', 'developer'
    ];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  isUserInfoQuestion(prompt) {
    const keywords = [
      'what is my name', 'ano pangalan ko', 'my name', 'pangalan ko',
      'when is my birthday', 'kelan birthday ko', 'my birthday',
      'who am i', 'sino ako', 'whats my name'
    ];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  async handleUserInfo(senderId, prompt, token) {
    try {
      const userInfo = await this.getUserInfo(senderId, token);
      let response = '';

      if (prompt.toLowerCase().includes('name') || prompt.toLowerCase().includes('pangalan')) {
        response = userInfo.name ? 'Your name is ' + userInfo.name + '.' : 'I cannot tell you that because it is confidential.';
      }

      if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('kelan')) {
        response += userInfo.birthday ? '\nYour birthday is ' + userInfo.birthday + '.' : '\nI cannot tell you that because it is confidential.';
      }

      if (!response) {
        const publicInfo = [];
        if (userInfo.name) publicInfo.push('Name: ' + userInfo.name);
        if (userInfo.birthday) publicInfo.push('Birthday: ' + userInfo.birthday);
        if (userInfo.gender) publicInfo.push('Gender: ' + userInfo.gender);
        if (userInfo.location) publicInfo.push('Location: ' + userInfo.location);
        response = publicInfo.length > 0
          ? 'Here is your public information:\n' + publicInfo.join('\n')
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
      const url = 'https://graph.facebook.com/' + senderId;
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

  async getRepliedMessageData(mid, token) {
    try {
      const url = 'https://graph.facebook.com/v21.0/' + mid;
      const params = {
        access_token: token,
        fields: 'message,from'
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

  wantsDetailedAnswer(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const keywords = [
      'explain more', 'more explanation', 'more details', 'detailed', 'detail',
      'elaborate', 'elaborate more', 'paki elaborate', 'mas detalyado',
      'tell me more', 'give more info', 'dagdagan', 'dagdag',
      'further explain', 'further explanation', 'full explanation',
      'complete explanation', 'in depth', 'in-depth', 'thorough',
      'comprehensive', 'expound', 'pakilinaw', 'linawin',
      'more information', 'additional info', 'karagdagang'
    ];
    return keywords.some(keyword => lowerPrompt.includes(keyword));
  },

  shortenResponse(text) {
    if (!text) return text;
    
    const sentences = text.split(/(?<=[.!?])\s+/);
    let concise = sentences.slice(0, 3).join(' ');
    
    if (concise.length > 400) {
      concise = concise.substring(0, 400) + '...';
    }
    
    concise = concise
      .replace(/^(In summary|To summarize|In conclusion|Basically|Essentially|Simply put|In other words)\s*,?\s*/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    return concise || text;
  },

  isContextualQuestion(prompt, previousPrompt) {
    if (!previousPrompt) return false;
    
    const patterns = [
      'so yan', 'so ito', 'so iyan', 'so yun', 'so ganyan', 'so ganito', 'so ganun',
      'tama ba', 'tama', 'correct', 'right',
      'so tungkol', 'so sa', 'so para sa',
      'so ibig sabihin', 'so meaning', 'so parang',
      'paano naman', 'what about', 'how about',
      'paano kung', 'what if',
      'bakit', 'why', 'paano', 'how', 'kailan', 'when', 'saan', 'where', 
      'sino', 'who', 'alin', 'which', 'ano', 'what',
      'gets', 'gets ko', 'nagets', 'naintindihan',
      'ok', 'okay', 'sige', 'cge',
      'talaga', 'really', 'sure',
      'so that', 'so this', 'so it',
      'so about', 'so regarding',
      'mao na', 'mao ni', 'mao to', 'mao diay',
      'mao ba', 'mao jud', 'mao gyud',
      'so mao', 'so mao na',
      'sakto ba', 'sakto',
      'so', 'eh', 'a', 'ah', 'oh', 'ay'
    ];
    
    const isRelated = patterns.some(pattern => prompt.includes(pattern));
    
    const prevWords = previousPrompt.split(' ').filter(w => w.length > 2);
    const currentWords = prompt.split(' ').filter(w => w.length > 2);
    const hasRelatedWords = prevWords.some(w => 
      currentWords.some(cw => cw.includes(w) || w.includes(cw))
    );
    
    return isRelated || hasRelatedWords;
  },

  isFollowUpRequest(prompt) {
    const keywords = [
      'elaborate', 'explain more', 'paki elaborate', 'paki explain',
      'paliwanag', 'ipaliwanag', 'elab', 'explain',
      'detail', 'further', 'more details', 'mas detalyado',
      'summarize', 'summary', 'i-summarize', 'brief', 'make it short',
      'short', 'concise', 'shorten', 'ikli', 'paikliin',
      'simplify', 'simple', 'pasimplehin', 'basic',
      'example', 'sample', 'halimbawa', 'instance',
      'give example', 'give examples', 'magbigay ng halimbawa',
      'correct', 'fix', 'tama', 'ayusin', 'improve', 'better',
      'add', 'additional', 'dagdagan', 'more', 'add more',
      'humanize', 'make it human', 'conversational', 'natural',
      'make it natural', 'parang tao', 'human-like',
      'translate', 'translation', 'isalin', 'salin',
      'ulit', 'repeat', 'again', 'paki-ulit',
      'gets', 'nagets', 'naintindihan', 'understand',
      'oo', 'opo', 'sige', 'cge', 'okay', 'ok',
      'agree', 'yes', 'yeah', 'yep',
      'hindi', 'dili', 'no', 'not', 'mali'
    ];
    return keywords.some(keyword => prompt.includes(keyword));
  },

  isNewTopic(prompt, previousPrompt) {
    if (!previousPrompt) return true;
    
    const indicators = [
      'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
      'kamusta', 'musta', 'kumusta', 'musta na', 'kumusta ka',
      'oy', 'oi', 'hoy', 'ei', 'ey',
      'good day', 'greetings', 'sup', 'whats up', 'whassup',
      'magandang umaga', 'magandang tanghali', 'magandang hapon', 'magandang gabi',
      'maayong buntag', 'maayong udto', 'maayong hapon', 'maayong gabii',
      'ask', 'tanong', 'question', 'tungkol sa',
      'about', 'regarding', 'sa', 'about sa',
      'i want to ask', 'gusto kong itanong',
      'can i ask', 'pwede magtanong',
      'new topic', 'bagong topic',
      'change topic', 'change subject', 'ibang topic', 'iba naman',
      'next topic', 'lipat tayo', 'move on',
      'what is', 'what are', 'what does', 'what do',
      'ano ang', 'ano ba', 'ano yung', 'ano iyong',
      'sino ang', 'sino ba', 'sino yung', 'sino iyong',
      'tell me about', 'tell me', 'tell about',
      'explain', 'define', 'describe',
      'give me', 'give', 'show me',
      'can you tell', 'could you tell',
      'please explain', 'please tell',
      'do you know', 'did you know',
      'have you heard', 'have you seen',
      'is it true', 'is that true'
    ];
    
    if (prompt.length < 10 && !this.isFollowUpRequest(prompt)) {
      return true;
    }
    
    return indicators.some(indicator => prompt.includes(indicator));
  },

  cleanResponse(text) {
    if (!text) return 'No response.';
    let cleaned = text.trim();
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');
    cleaned = cleaned.replace(/[━═─]{3,}/g, '');
    cleaned = cleaned.replace(/[-_=]{5,}/g, '');
    cleaned = cleaned.replace(/\|/g, ' ');
    cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    return cleaned.trim() || 'No response.';
  },

  cleanOldHistory() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    for (const [userId, data] of Object.entries(conversationHistory)) {
      if (now - data.timestamp > maxAge) {
        delete conversationHistory[userId];
      }
    }
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
