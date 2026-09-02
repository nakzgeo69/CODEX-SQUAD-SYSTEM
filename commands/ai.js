// ========== ai.js - COMPLETE FIXED ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera'],
  description: 'Text-based AI assistant with complete responses',
  usage: 'ai [question]',
  version: '3.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let previousResponse = null;
      let isReply = false;
      let previousPrompt = null;

      // ===== CHECK REPLY =====
      if (event?.message?.reply_to?.mid) {
        isReply = true;
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        previousResponse = replyData.message;
        if (!prompt) {
          prompt = 'Please respond to what I said.';
        }
      }

      // ===== CONVERSATION HISTORY =====
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

      // ===== WELCOME =====
      if (!prompt && !isReply) {
        await sendMessage(senderId, {
          text: 'Hello. I am Teacher Arlene, your AI Assistant. How can I assist you today?'
        }, token);
        return;
      }

      // ===== OWNER =====
      if (this.isOwnerQuestion(prompt)) {
        await sendMessage(senderId, {
          text: 'I was created by GeoDevz69. Visit here for more information: https://www.facebook.com/geotechph.net'
        }, token);
        return;
      }

      // ===== USER INFO =====
      if (this.isUserInfoQuestion(prompt)) {
        await this.handleUserInfo(senderId, prompt, token);
        return;
      }

      // ===== BUILD PROMPT =====
      const wantsDetailed = this.wantsDetailedAnswer(prompt);
      const finalPrompt = this.buildFinalPrompt(prompt, previousResponse, previousPrompt, isReply, wantsDetailed);

      // ===== CALL API =====
      console.log('[AI] Sending request: ' + prompt.substring(0, 50) + '...');
      const response = await this.callAPI(finalPrompt);
      let aiResponse = this.cleanResponse(response || 'No response from API.');

      // ===== SAVE HISTORY =====
      conversationHistory[senderId] = {
        lastPrompt: prompt,
        lastResponse: aiResponse,
        timestamp: Date.now()
      };
      this.cleanOldHistory();

      // ===== SEND =====
      await this.sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error('[AI] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ========== API: Overchat Qwen PRIMARY ==========
  async callAPI(prompt) {
    const apiConfigs = [
      // ===== PRIMARY: Overchat Qwen (COMPLETE, FAST) =====
      {
        name: 'Overchat Qwen',
        url: 'https://ceddsrestapi.vercel.app/ai/overchat-qwen',
        param: 'message',
        responsePath: 'result',
        successField: 'operator',
        successValue: 'Ioarkdev',
        timeout: 90000
      },
      // ===== FALLBACK 1: ChatPlus (COMPLETE) =====
      {
        name: 'Cedds ChatPlus',
        url: 'https://ceddsrestapi.vercel.app/ai/chatplus',
        param: 'message',
        responsePath: 'result',
        successField: 'operator',
        successValue: 'ceddsdev',
        timeout: 90000
      },
      // ===== FALLBACK 2: DeepChat (if needed) =====
      {
        name: 'Cedds DeepChat',
        url: 'https://ceddsrestapi.vercel.app/ai/deepchat',
        param: 'text',
        responsePath: 'data',
        successField: 'success',
        timeout: 90000
      },
      // ===== FALLBACK 3: Pollination AI =====
      {
        name: 'Pollination AI',
        url: 'https://api-library-kohi-production.up.railway.app/api/pollination-ai',
        param: 'prompt',
        responsePath: 'data',
        successField: 'status',
        timeout: 90000
      },
      // ===== FALLBACK 4: Opera AI =====
      {
        name: 'Opera AI',
        url: 'https://betadash-api-swordslush-production.up.railway.app/opera',
        param: 'ask',
        responsePath: 'message',
        successField: 'success',
        timeout: 90000
      }
    ];

    let lastError = null;

    for (let i = 0; i < apiConfigs.length; i++) {
      const config = apiConfigs[i];
      let retries = 3;

      while (retries > 0) {
        try {
          console.log('[API] Trying ' + config.name + ' (' + (i + 1) + '/' + apiConfigs.length + ')...');

          const encodedPrompt = encodeURIComponent(prompt);
          const apiUrl = config.url + '?' + config.param + '=' + encodedPrompt;

          const response = await axios.get(apiUrl, {
            timeout: config.timeout || 90000,
            headers: { 'Accept': 'application/json' },
            maxContentLength: 100000000,
            maxBodyLength: 100000000
          });

          const data = response.data;

          const expectedSuccess = config.successValue !== undefined ? config.successValue : true;
          const actualSuccess = data[config.successField];

          if (actualSuccess !== expectedSuccess) {
            throw new Error('API returned ' + config.successField + ': ' + actualSuccess);
          }

          const extracted = this.extractResponse(data, config);
          if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
            console.log('[API] ✅ ' + config.name + ' SUCCESS! Length: ' + extracted.length);
            return this.standardizeResponse(extracted);
          }

          throw new Error('Empty response');

        } catch (error) {
          console.log('[API] ❌ ' + config.name + ' attempt failed: ' + error.message);
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

  // ========== EXTRACT RESPONSE ==========
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

  // ========== STANDARDIZE RESPONSE ==========
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

  // ========== CLEAN RESPONSE ==========
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

  // ========== BUILD FINAL PROMPT ==========
  buildFinalPrompt(prompt, previousResponse, previousPrompt, isReply, wantsDetailed) {
    let finalPrompt = '';

    if (previousResponse) {
      finalPrompt += 'Previous conversation:\n';
      finalPrompt += 'User: ' + (previousPrompt || 'unknown') + '\n';
      finalPrompt += 'AI: ' + previousResponse + '\n\n';
      finalPrompt += 'User: ' + prompt + '\n\n';
    } else {
      finalPrompt = prompt;
    }

    finalPrompt += '\nIMPORTANT: Provide a COMPLETE answer. DO NOT use "..." to truncate. Include ALL examples and complete solutions.';

    if (wantsDetailed) {
      finalPrompt += '\n\nProvide a COMPREHENSIVE and DETAILED explanation.';
    } else {
      finalPrompt += '\n\nProvide a CLEAR and COMPLETE answer.';
    }

    return finalPrompt;
  },

  // ========== SMART CHUNK SPLITTING ==========
  splitMessageIntelligently(text) {
    if (!text) return [];
    if (text.length <= MAX_CHUNK) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK) {
        chunks.push(remaining);
        break;
      }

      let chunk = remaining.substring(0, MAX_CHUNK);

      const breakPoints = [
        { char: '. ', priority: 10 },
        { char: '? ', priority: 9 },
        { char: '! ', priority: 9 },
        { char: '\n\n', priority: 8 },
        { char: '\n•', priority: 7 },
        { char: '\n-', priority: 6 },
        { char: '\n', priority: 5 },
        { char: '.', priority: 4 },
        { char: '; ', priority: 3 },
        { char: ', ', priority: 2 },
        { char: ' ', priority: 1 }
      ];

      let bestIndex = -1;
      let bestPriority = -1;

      for (const bp of breakPoints) {
        const idx = chunk.lastIndexOf(bp.char);
        if (idx > MAX_CHUNK * 0.3 && idx < MAX_CHUNK) {
          if (bestPriority < bp.priority) {
            bestPriority = bp.priority;
            bestIndex = idx + bp.char.length;
          }
        }
      }

      if (bestIndex === -1) {
        const spaceIdx = chunk.lastIndexOf(' ');
        if (spaceIdx > MAX_CHUNK * 0.3) {
          bestIndex = spaceIdx + 1;
        } else {
          bestIndex = MAX_CHUNK;
        }
      }

      bestIndex = Math.min(bestIndex, MAX_CHUNK);

      const chunkText = remaining.substring(0, bestIndex).trim();
      if (chunkText) chunks.push(chunkText);

      remaining = remaining.substring(bestIndex).trim();
    }

    return chunks;
  },

  // ========== SEND CHUNKS ==========
  async sendChunks(senderId, text, token) {
    if (!text) return;

    const chunks = this.splitMessageIntelligently(text);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;

      try {
        const message = chunks.length > 1
          ? '[Part ' + (i + 1) + '/' + chunks.length + ']\n' + chunk
          : chunk;

        await sendMessage(senderId, { text: message }, token);

        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error('[sendChunks] Error:', error.message);
        if (error.message.includes('Message too long') || error.message.includes('max_length')) {
          const subChunks = this.splitMessageIntelligently(chunk);
          for (const subChunk of subChunks) {
            await sendMessage(senderId, { text: subChunk }, token);
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
    }
  },

  // ========== FOLLOW-UP ==========
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
      'hindi', 'dili', 'no', 'not', 'mali',
      'tama ba', 'correct ba', 'sure ba', 'talaga',
      'really', 'are you sure', 'sigurado ka',
      'clarify', 'clarification', 'linawin', 'clear', 'make clear'
    ];
    return keywords.some(keyword => prompt.includes(keyword));
  },

  // ========== CONTEXTUAL QUESTION ==========
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

  // ========== NEW TOPIC ==========
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
      'is it true', 'is that true',
      'really', 'seriously',
      'today', 'now', 'currently',
      'recently', 'lately',
      'nowadays', 'these days'
    ];

    if (prompt.length < 10 && !this.isFollowUpRequest(prompt)) {
      return true;
    }

    return indicators.some(indicator => prompt.includes(indicator));
  },

  // ========== WANTS DETAILED ==========
  wantsDetailedAnswer(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const keywords = [
      'explain more', 'more explanation', 'more details', 'detailed', 'detail',
      'elaborate', 'elaborate more', 'paki elaborate', 'mas detalyado',
      'tell me more', 'give more info', 'dagdagan', 'dagdag',
      'further explain', 'further explanation', 'full explanation',
      'complete explanation', 'in depth', 'in-depth', 'thorough',
      'comprehensive', 'expound', 'pakilinaw', 'linawin',
      'more information', 'additional info', 'karagdagang',
      'can you explain further', 'please elaborate'
    ];
    return keywords.some(keyword => lowerPrompt.includes(keyword));
  },

  // ========== OWNER ==========
  isOwnerQuestion(prompt) {
    const keywords = [
      'who is your owner', 'who created you', 'who made you',
      'sino gumawa sayo', 'sino may ari sayo', 'owner mo',
      'sino owner mo', 'who owns you', 'creator', 'developer'
    ];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  // ========== USER INFO ==========
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

  // ========== GET REPLIED MESSAGE ==========
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

  // ========== CLEAN OLD HISTORY ==========
  cleanOldHistory() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    for (const [userId, data] of Object.entries(conversationHistory)) {
      if (now - data.timestamp > maxAge) {
        delete conversationHistory[userId];
      }
    }
  },

  // ========== ERROR MESSAGE ==========
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
  }
};
