// ========== gemini.js - Image Analysis Only ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;

module.exports = {
  name: ['gemini', 'vision', 'analyze', 'imganalyze'],
  description: 'Analyze images using Gemini AI',
  usage: 'gemini [description] (send/reply to image)',
  version: '1.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let imageUrl = null;

      // ===== CHECK FOR IMAGE IN REPLY =====
      if (event?.message?.reply_to?.mid) {
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        imageUrl = replyData.imageUrl;
        if (!prompt) prompt = 'Analyze this image.';
      }

      // ===== CHECK FOR IMAGE ATTACHMENT =====
      if (!imageUrl && event?.message?.attachments) {
        for (const attachment of event.message.attachments) {
          if (attachment.type === 'image' || attachment.type === 'photo') {
            imageUrl = attachment.payload?.url || attachment.url || null;
            if (imageUrl) {
              const urlObj = new URL(imageUrl);
              urlObj.searchParams.set('access_token', token);
              imageUrl = urlObj.toString();
            }
            break;
          }
        }
        if (imageUrl && !prompt) prompt = 'Analyze this image.';
      }

      // ===== NO IMAGE =====
      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Please send or reply to an image.\n\nUsage: gemini [optional description]'
        }, token);
        return;
      }

      // ===== DETECT LANGUAGE =====
      const detectedLanguage = this.detectLanguage(prompt);

      // ===== CALL GEMINI API =====
      console.log('[Gemini] Analyzing image...');
      const response = await this.callGeminiAPI(prompt, imageUrl, detectedLanguage);
      const aiResponse = this.cleanResponse(response || 'No response from API.');

      // ===== SEND RESPONSE =====
      await this.sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error('[Gemini] Error:', error.message);
      const errorLang = this.detectLanguage(prompt);
      await sendMessage(senderId, { text: this.getErrorMessage(error, errorLang) }, token);
    }
  },

  // ========== GEMINI API CALL ==========
  async callGeminiAPI(prompt, imageUrl, detectedLanguage = 'english') {
    try {
      const geminiPrompt = this.buildGeminiPrompt(prompt, detectedLanguage);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(geminiPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(apiUrl, { timeout: 90000, headers: { 'Accept': 'application/json' } });
      
      if (!response || !response.data) {
        throw new Error('No response from Gemini API');
      }
      
      return this.processGeminiResponse(response.data.response || '');
    } catch (error) {
      console.error('[Gemini] Error:', error.message);
      const fallbackPrompt = `The user sent an image. The user asked: ${prompt || 'Please describe what you see'}. Provide a helpful response.`;
      const response = await this.callAPIFallback(fallbackPrompt);
      return this.cleanResponse(response || 'Cannot analyze the image. Please try again.');
    }
  },

  // ========== BUILD GEMINI PROMPT ==========
  buildGeminiPrompt(userPrompt, language = 'english') {
    const langName = this.getLanguageName(language);
    let prompt;
    
    if (language === 'tagalog' || language === 'bisaya' || language === 'cebuano') {
      prompt = `Ikaw ay isang AI assistant na nagsusuri ng isang imahe.\n\n`;
      prompt += `UNAHIN MONG TUKUYIN KUNG ANONG KLASE NG IMAGE ITO, pagkatapos ay tumugon nang ANGKOP.\n\n`;
      prompt += `CLASSIFICATION AT RESPONSE:\n\n`;
      prompt += `1. ACTIVITY SHEET / WORKSHEET / QUIZ / EXAM:\n`;
      prompt += `   - HUWAG isama ang pangalan ng estudyante\n`;
      prompt += `   - HUWAG isama ang grade at section\n`;
      prompt += `   - HUWAG maglagay ng intro\n`;
      prompt += `   - DIREKTA sa mga sagot\n`;
      prompt += `   - BASAHIN MABUTI ANG INSTRUCTIONS NG BAWAT PART\n`;
      prompt += `   - SUNDIN ANG EXACT FORMAT na hinihingi ng instructions\n\n`;
      prompt += `   KUNG SEQUENCING (Arrange in order):\n`;
      prompt += `   - Ibigay ang tamang ORDER ng steps\n`;
      prompt += `   - Isulat ang number (1, 2, 3, etc.) sa tamang sequence\n`;
      prompt += `   - Ipakita ang steps sa TAMANG ORDER\n\n`;
      prompt += `   KUNG CHECK OR X (Proper/Improper):\n`;
      prompt += `   - Gumamit ng ✓ para sa PROPER\n`;
      prompt += `   - Gumamit ng X para sa IMPROPER\n`;
      prompt += `   - HUWAG iwanang blank ang mga sagot\n`;
      prompt += `   - Bawat item dapat may ✓ o X\n\n`;
      prompt += `   KUNG MULTIPLE CHOICE:\n`;
      prompt += `   - Ibigay ang LETTER ng tamang sagot\n`;
      prompt += `   - Isulat ang buong sagot\n\n`;
      prompt += `   KUNG ENUMERATION:\n`;
      prompt += `   - Ibigay ang KUMPLETONG listahan\n`;
      prompt += `   - Sundin ang hinihinging bilang ng items\n\n`;
      prompt += `   KUNG ESSAY (1-2 sentences):\n`;
      prompt += `   - Ibigay ang sagot sa 1-2 pangungusap LAMANG\n`;
      prompt += `   - HUWAG lumampas sa hinihinging bilang ng pangungusap\n\n`;
      prompt += `   KUNG MATH:\n`;
      prompt += `   - Ipakita ang step-by-step solution\n`;
      prompt += `   - Ibigay ang pinal na sagot\n\n`;
      prompt += `   MAHALAGA:\n`;
      prompt += `   - Panatilihin ang ORIGINAL na format ng activity sheet\n`;
      prompt += `   - Ibigay ang SAGOT LAMANG, walang explanation kung hindi kailangan\n`;
      prompt += `   - Kung may blank na kailangan sagutan, LAGYAN ng sagot\n`;
      prompt += `   - HUWAG iwanang blank ang anumang item\n\n`;
      prompt += `2. MATH PROBLEM / EQUATION / GRAPH:\n`;
      prompt += `   - Ipakita ang KUMPLETONG step-by-step solution\n`;
      prompt += `   - Ibigay ang pinal na sagot\n\n`;
      prompt += `3. INFOGRAPHIC / EDUCATIONAL IMAGE:\n`;
      prompt += `   - Ibuod sa 2-3 pangungusap LAMANG\n`;
      prompt += `   - Sabihin ang pangunahing mensahe\n\n`;
      prompt += `4. PAINTING / DRAWING / ARTWORK:\n`;
      prompt += `   - Ilarawan sa 1-2 pangungusap\n`;
      prompt += `   - Kung may deep meaning: Ipaliwanag sa 1-2 pangungusap\n\n`;
      prompt += `5. MEME / JOKE / HUMOROUS IMAGE:\n`;
      prompt += `   - Ipaliwanag ang biro sa 1 pangungusap\n\n`;
      prompt += `6. PHOTO / CASUAL IMAGE:\n`;
      prompt += `   - Ilarawan sa 1-2 pangungusap lamang\n\n`;
      prompt += `MAHALAGANG PANUNTUNAN:\n`;
      prompt += `- DIREKTA sa mga sagot, WALANG intro\n`;
      prompt += `- SUNDIN ANG INSTRUCTIONS NG ACTIVITY SHEET\n`;
      prompt += `- HUWAG iwanang blank ang mga sagot\n`;
      prompt += `- Gumamit ng ✓ o X kung hinihingi\n`;
      prompt += `- Ibigay ang tamang ORDER kung sequencing\n`;
      prompt += `- WALANG translation\n`;
      prompt += `- Tumugon sa ${langName.toUpperCase()} LAMANG\n\n`;
      prompt += `TANONG NG USER: ${userPrompt || 'Suriin ang imaheng ito'}`;
    } else {
      prompt = `You are an AI assistant analyzing an image.\n\n`;
      prompt += `FIRST IDENTIFY WHAT TYPE OF IMAGE THIS IS, then respond APPROPRIATELY.\n\n`;
      prompt += `CLASSIFICATION AND RESPONSE:\n\n`;
      prompt += `1. ACTIVITY SHEET / WORKSHEET / QUIZ / EXAM:\n`;
      prompt += `   - DO NOT include student name\n`;
      prompt += `   - DO NOT include grade and section\n`;
      prompt += `   - DO NOT add intro\n`;
      prompt += `   - DIRECTLY provide answers\n`;
      prompt += `   - READ THE INSTRUCTIONS OF EACH PART CAREFULLY\n`;
      prompt += `   - FOLLOW THE EXACT FORMAT required by instructions\n\n`;
      prompt += `   IF SEQUENCING (Arrange in order):\n`;
      prompt += `   - Provide the correct ORDER of steps\n`;
      prompt += `   - Write the number (1, 2, 3, etc.) in correct sequence\n`;
      prompt += `   - Show steps in CORRECT ORDER\n\n`;
      prompt += `   IF CHECK OR X (Proper/Improper):\n`;
      prompt += `   - Use ✓ for PROPER\n`;
      prompt += `   - Use X for IMPROPER\n`;
      prompt += `   - DO NOT leave answers blank\n`;
      prompt += `   - Each item should have ✓ or X\n\n`;
      prompt += `   IF MULTIPLE CHOICE:\n`;
      prompt += `   - Provide the LETTER of correct answer\n`;
      prompt += `   - Write the complete answer\n\n`;
      prompt += `   IF ENUMERATION:\n`;
      prompt += `   - Provide COMPLETE list\n`;
      prompt += `   - Follow the required number of items\n\n`;
      prompt += `   IF ESSAY (1-2 sentences):\n`;
      prompt += `   - Provide answer in 1-2 sentences ONLY\n`;
      prompt += `   - DO NOT exceed the required number of sentences\n\n`;
      prompt += `   IF MATH:\n`;
      prompt += `   - Show step-by-step solution\n`;
      prompt += `   - Provide final answer\n\n`;
      prompt += `   IMPORTANT:\n`;
      prompt += `   - Maintain the ORIGINAL format of activity sheet\n`;
      prompt += `   - Provide ANSWER ONLY, no explanation if not needed\n`;
      prompt += `   - If there are blanks to fill, FILL them with answers\n`;
      prompt += `   - DO NOT leave any item blank\n\n`;
      prompt += `2. MATH PROBLEM / EQUATION / GRAPH:\n`;
      prompt += `   - Show COMPLETE step-by-step solution\n`;
      prompt += `   - Provide final answer\n\n`;
      prompt += `3. INFOGRAPHIC / EDUCATIONAL IMAGE:\n`;
      prompt += `   - Summarize in 2-3 sentences ONLY\n`;
      prompt += `   - State the main message\n\n`;
      prompt += `4. PAINTING / DRAWING / ARTWORK:\n`;
      prompt += `   - Describe in 1-2 sentences\n`;
      prompt += `   - If deep meaning: Explain in 1-2 sentences\n\n`;
      prompt += `5. MEME / JOKE / HUMOROUS IMAGE:\n`;
      prompt += `   - Explain the joke in 1 sentence\n\n`;
      prompt += `6. PHOTO / CASUAL IMAGE:\n`;
      prompt += `   - Describe in 1-2 sentences only\n\n`;
      prompt += `IMPORTANT RULES:\n`;
      prompt += `- DIRECTLY provide answers, NO intro\n`;
      prompt += `- FOLLOW THE INSTRUCTIONS of the activity sheet\n`;
      prompt += `- DO NOT leave answers blank\n`;
      prompt += `- Use ✓ or X if required\n`;
      prompt += `- Provide correct ORDER if sequencing\n`;
      prompt += `- NO translations\n`;
      prompt += `- Respond in ${langName.toUpperCase()} ONLY\n\n`;
      prompt += `USER QUESTION: ${userPrompt || 'Analyze this image'}`;
    }
    return prompt;
  },

  // ========== PROCESS GEMINI RESPONSE ==========
  processGeminiResponse(response) {
    let processed = response || '';
    processed = processed
      .replace(/^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i, '')
      .replace(/^Here is my analysis.*?\n/i, '')
      .replace(/^Let me analyze.*?\n/i, '')
      .replace(/^Based on my analysis.*?\n/i, '')
      .replace(/^I can see that.*?\n/i, '')
      .replace(/^Ako ay si Gemini.*?\n/i, '')
      .replace(/^Narito ang aking analysis.*?\n/i, '')
      .replace(/^The image is.*?\n/i, '')
      .replace(/^Ang larawan ay.*?\n/i, '')
      .replace(/^The image shows.*?\n/i, '')
      .replace(/^Ang larawan ay nagpapakita.*?\n/i, '')
      .replace(/^The image appears.*?\n/i, '')
      .replace(/^This image depicts.*?\n/i, '')
      .replace(/^Ang imaheng ito ay.*?\n/i, '')
      .replace(/^This image is.*?\n/i, '')
      .replace(/^Here's a detailed description.*?\n/i, '')
      .replace(/^Narito ang detalyadong.*?\n/i, '')
      .replace(/^This is an activity sheet.*?\n/i, '')
      .replace(/^Ito ay isang activity sheet.*?\n/i, '')
      .replace(/^I will read and answer.*?\n/i, '')
      .replace(/^Babasahin ko at sasagutin.*?\n/i, '')
      .replace(/^Name:.*?\n/i, '')
      .replace(/^Pangalan:.*?\n/i, '')
      .replace(/^Grade & Section:.*?\n/i, '')
      .replace(/^Baitang at Seksyon:.*?\n/i, '')
      .replace(/^Grade and Section:.*?\n/i, '')
      .replace(/^---+\n/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    processed = processed.replace(/\s*\([^)]*[A-Za-z]{20,}[^)]*\)/g, '');
    
    processed = processed
      .replace(/^\s*[\*\-•]\s*Landscape:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Lake:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Foreground:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Activities.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*People:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Overall Mood:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Canoeing:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Barbecue.*?\n/gim, '');
    
    const hasMathOrQuiz = processed.includes('Step 1:') || 
                          processed.includes('Hakbang 1:') ||
                          processed.includes('1.') ||
                          processed.includes('Paliwanag:') ||
                          processed.includes('Explanation:') ||
                          processed.includes('PART I') ||
                          processed.includes('PART II') ||
                          processed.includes('PART III');
    
    if (!hasMathOrQuiz) {
      const sentences = processed.split(/(?<=[.!?])\s+/);
      if (sentences.length > 3) {
        processed = sentences.slice(0, 3).join(' ');
      }
    }
    
    return this.cleanResponse(processed);
  },

  // ========== FALLBACK API ==========
  async callAPIFallback(prompt) {
    try {
      const primary = {
        url: 'https://api-library-kohi-production.up.railway.app/api/pollination-ai',
        param: 'prompt',
        responsePath: 'data',
        successField: 'status'
      };
      const fallback = {
        url: 'https://betadash-api-swordslush-production.up.railway.app/opera',
        param: 'ask',
        responsePath: 'message',
        successField: 'success'
      };
      
      try {
        return await this.executeApiCall(primary, prompt);
      } catch (primaryError) {
        return await this.executeApiCall(fallback, prompt);
      }
    } catch (error) {
      return null;
    }
  },

  async executeApiCall(config, prompt) {
    const encoded = encodeURIComponent(prompt);
    const url = `${config.url}?${config.param}=${encoded}`;
    const response = await axios.get(url, {
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });
    const data = response.data;
    if (data[config.successField] !== true) {
      throw new Error(`API returned ${config.successField}: false`);
    }
    const path = config.responsePath.split('.');
    let value = data;
    for (const key of path) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    return typeof value === 'string' ? value : null;
  },

  // ========== GET REPLIED MESSAGE ==========
  async getRepliedMessageData(mid, token) {
    try {
      const url = `https://graph.facebook.com/v21.0/${mid}`;
      const params = {
        access_token: token,
        fields: 'message,from,attachments'
      };
      const { data } = await axios.get(url, { params });
      let imageUrl = null;
      if (data?.attachments?.data) {
        for (const attachment of data.attachments.data) {
          if (attachment.type === 'image' || attachment.type === 'photo') {
            imageUrl = attachment?.image_data?.url || attachment?.url || null;
            break;
          }
        }
      }
      return { message: data?.message || null, from: data?.from?.id || null, imageUrl };
    } catch (error) {
      return { message: null, from: null, imageUrl: null };
    }
  },

  // ========== LANGUAGE DETECTION ==========
  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();
    const languages = {
      tagalog: {
        keywords: ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'hindi', 'oo', 'salamat', 'paki', 'tanong', 'sagot', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'halimbawa', 'lutasin', 'hanapin', 'sagutin'],
        minMatches: 2
      },
      bisaya: {
        keywords: ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'tabang', 'pananglitan', 'sulbad', 'pangitaa', 'kwentaha'],
        minMatches: 2
      },
      cebuano: {
        keywords: ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'tabang', 'pananglitan', 'sulbad', 'pangitaa', 'kwentaha'],
        minMatches: 2
      }
    };
    let bestMatch = 'english';
    let bestScore = 0;
    const words = lower.split(/\s+/);
    for (const [lang, config] of Object.entries(languages)) {
      let matchCount = 0;
      for (const word of words) {
        if (config.keywords.includes(word)) matchCount++;
      }
      if (matchCount >= config.minMatches && matchCount > bestScore) {
        bestMatch = lang;
        bestScore = matchCount;
      }
    }
    return bestMatch;
  },

  getLanguageName(languageCode) {
    const names = {
      'english': 'English', 'tagalog': 'Tagalog', 'filipino': 'Filipino',
      'bisaya': 'Bisaya', 'cebuano': 'Cebuano', 'ilocano': 'Ilocano',
      'waray': 'Waray', 'hiligaynon': 'Hiligaynon', 'kapampangan': 'Kapampangan',
      'spanish': 'Spanish'
    };
    return names[languageCode] || 'English';
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
    cleaned = cleaned.replace(/[📌📊📐📝✅📚✏️🎯💡📖🔢🧮]/g, '');
    cleaned = this.cleanMathNotation(cleaned);
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    return cleaned.trim() || 'No response.';
  },

  cleanMathNotation(text) {
    if (!text) return text;
    let cleaned = text;
    cleaned = cleaned.replace(/\\\[/g, '').replace(/\\\]/g, '');
    cleaned = cleaned.replace(/\\\(/g, '').replace(/\\\)/g, '');
    cleaned = cleaned.replace(/\$\$/g, '').replace(/\$/g, '');
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
    cleaned = cleaned.replace(/\\bar\{([^}]+)\}/g, '$1-bar');
    cleaned = cleaned.replace(/\\sum/g, 'sum');
    cleaned = cleaned.replace(/\\times/g, ' x ');
    cleaned = cleaned.replace(/\\cdot/g, ' * ');
    cleaned = cleaned.replace(/\\div/g, ' / ');
    cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
    cleaned = cleaned.replace(/\\left/g, '').replace(/\\right/g, '');
    cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
    cleaned = cleaned.replace(/\\pi/g, 'pi');
    cleaned = cleaned.replace(/\\theta/g, 'theta');
    cleaned = cleaned.replace(/\\infty/g, 'infinity');
    cleaned = cleaned.replace(/\\leq/g, '<=');
    cleaned = cleaned.replace(/\\geq/g, '>=');
    cleaned = cleaned.replace(/\\neq/g, '!=');
    cleaned = cleaned.replace(/\\rightarrow/g, '->');
    cleaned = cleaned.replace(/\\ldots/g, '...');
    cleaned = cleaned.replace(/\\begin\{[^}]+\}/g, '');
    cleaned = cleaned.replace(/\\end\{[^}]+\}/g, '');
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');
    cleaned = cleaned.replace(/([a-zA-Z])_\{?(\d+)\}?/g, '$1$2');
    cleaned = cleaned.replace(/\^\{([^}]+)\}/g, '^($1)');
    cleaned = cleaned.replace(/\\/g, '');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    return cleaned.trim();
  },

  // ========== GET ERROR MESSAGE ==========
  getErrorMessage(error, detectedLanguage = 'english') {
    if (error.code === 'ECONNABORTED') {
      return detectedLanguage === 'tagalog' ? 'Nag-timeout ang request. Subukan muli.' : 'Request timed out. Please try again.';
    }
    return detectedLanguage === 'tagalog' ? 'Error sa pagproseso. Subukan muli.' : 'Error processing request. Please try again.';
  },

  // ========== SEND CHUNKS ==========
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
