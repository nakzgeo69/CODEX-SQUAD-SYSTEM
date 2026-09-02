// ========== gemini.js - Complete Test Answering System ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;

module.exports = {
  name: ['gemini', 'vision', 'analyze', 'imganalyze'],
  description: 'Analyze and answer all types of tests from images',
  usage: 'gemini [description] (send/reply to image)',
  version: '2.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let imageUrl = null;

      // ===== CHECK FOR IMAGE =====
      if (event?.message?.reply_to?.mid) {
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        imageUrl = replyData.imageUrl;
        if (!prompt) prompt = 'Analyze this image and answer all questions accurately.';
      }

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
        if (imageUrl && !prompt) prompt = 'Analyze this image and answer all questions accurately.';
      }

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
      return 'Cannot analyze the image. Please try again with a clearer image.';
    }
  },

  // ========== BUILD GEMINI PROMPT ==========
  buildGeminiPrompt(userPrompt, language = 'english') {
    const langName = this.getLanguageName(language);
    let prompt;
    
    if (language === 'tagalog' || language === 'bisaya' || language === 'cebuano') {
      prompt = `Ikaw ay isang AI assistant na nagsusuri ng isang imahe.\n\n`;
      prompt += `UNAHIN MONG TUKUYIN KUNG ANONG KLASE NG IMAGE ITO, pagkatapos ay tumugon nang ANGKOP.\n\n`;
      prompt += `MAHALAGANG PANUNTUNAN:\n`;
      prompt += `- DIREKTA sa mga sagot, WALANG intro\n`;
      prompt += `- SUNDIN ANG INSTRUCTIONS NG BAWAT PART\n`;
      prompt += `- HUWAG iwanang blank ang mga sagot\n`;
      prompt += `- Gumamit ng "YES" at "NO" sa halip na ✓ o ✗\n`;
      prompt += `- Ibigay ang tamang ORDER kung sequencing\n`;
      prompt += `- WALANG translation\n`;
      prompt += `- Tumugon sa ${langName.toUpperCase()} LAMANG\n\n`;
      prompt += `MGA URI NG TEST AT PAANO SUMAGOT:\n\n`;
      
      prompt += `1. ACTIVITY SHEET / WORKSHEET / QUIZ / EXAM:\n`;
      prompt += `   - HUWAG isama ang pangalan at grade ng estudyante\n`;
      prompt += `   - BASAHIN MABUTI ANG INSTRUCTIONS NG BAWAT PART\n`;
      prompt += `   - SUNDIN ANG EXACT FORMAT na hinihingi ng instructions\n\n`;
      
      prompt += `2. SEQUENCING (Arrange in order):\n`;
      prompt += `   - Ibigay ang tamang ORDER ng steps\n`;
      prompt += `   - Isulat ang number (1, 2, 3, 4, etc.) sa tamang sequence\n`;
      prompt += `   - Ipakita ang steps sa TAMANG ORDER\n\n`;
      
      prompt += `3. CHECK OR X / TRUE OR FALSE:\n`;
      prompt += `   - Gamitin ang "YES" para sa PROPER / TAMA\n`;
      prompt += `   - Gamitin ang "NO" para sa IMPROPER / MALI\n`;
      prompt += `   - Bawat item dapat may sagot\n\n`;
      
      prompt += `4. MULTIPLE CHOICE:\n`;
      prompt += `   - Ibigay ang LETTER ng tamang sagot (A, B, C, D)\n`;
      prompt += `   - Isulat ang buong sagot pagkatapos ng letter\n\n`;
      
      prompt += `5. ENUMERATION:\n`;
      prompt += `   - Ibigay ang KUMPLETONG listahan\n`;
      prompt += `   - Sundin ang hinihinging bilang ng items\n\n`;
      
      prompt += `6. ESSAY (1-2 sentences):\n`;
      prompt += `   - Ibigay ang sagot sa 1-2 pangungusap LAMANG\n`;
      prompt += `   - HUWAG lumampas sa hinihinging bilang ng pangungusap\n\n`;
      
      prompt += `7. IDENTIFICATION:\n`;
      prompt += `   - Ibigay ang TAMANG termino o salita\n`;
      prompt += `   - Isulat ang buong sagot\n\n`;
      
      prompt += `8. MATCHING TYPE:\n`;
      prompt += `   - Ibigay ang tamang pares\n`;
      prompt += `   - Isulat ang letra at katapat nito\n\n`;
      
      prompt += `9. FILL IN THE BLANKS:\n`;
      prompt += `   - Punan ang mga blanko ng TAMANG salita\n`;
      prompt += `   - Isulat ang kumpletong pangungusap\n\n`;
      
      prompt += `10. MATH PROBLEMS:\n`;
      prompt += `   - Ipakita ang step-by-step solution\n`;
      prompt += `   - Ibigay ang pinal na sagot\n\n`;
      
      prompt += `11. DIAGRAM / GRAPH ANALYSIS:\n`;
      prompt += `   - I-analyze ang diagram o graph\n`;
      prompt += `   - Ibigay ang interpretation at sagot\n\n`;
      
      prompt += `12. CASE STUDY / SCENARIO:\n`;
      prompt += `   - Basahin ang case study\n`;
      prompt += `   - Ibigay ang sagot base sa scenario\n\n`;
      
      prompt += `13. SUMMATIVE TEST / ASSESSMENT:\n`;
      prompt += `   - Sagutin ang LAHAT ng questions\n`;
      prompt += `   - Sundin ang format ng bawat part\n\n`;
      
      prompt += `14. PERIODICAL EXAM:\n`;
      prompt += `   - Sagutin ang LAHAT ng items\n`;
      prompt += `   - Ibigay ang kumpletong sagot\n\n`;
      
      prompt += `15. LAB REPORT:\n`;
      prompt += `   - Ibigay ang mga observations\n`;
      prompt += `   - Isulat ang conclusions\n\n`;
      
      prompt += `TANONG NG USER: ${userPrompt || 'Suriin at sagutin ang imahe'}`;
    } else {
      prompt = `You are an AI assistant analyzing an image.\n\n`;
      prompt += `FIRST IDENTIFY WHAT TYPE OF IMAGE THIS IS, then respond APPROPRIATELY.\n\n`;
      prompt += `IMPORTANT RULES:\n`;
      prompt += `- DIRECTLY provide answers, NO intro\n`;
      prompt += `- FOLLOW THE INSTRUCTIONS of each part\n`;
      prompt += `- DO NOT leave answers blank\n`;
      prompt += `- Use "YES" and "NO" instead of ✓ or ✗\n`;
      prompt += `- Provide correct ORDER if sequencing\n`;
      prompt += `- NO translations\n`;
      prompt += `- Respond in ${langName.toUpperCase()} ONLY\n\n`;
      prompt += `TEST TYPES AND HOW TO ANSWER:\n\n`;
      
      prompt += `1. ACTIVITY SHEET / WORKSHEET / QUIZ / EXAM:\n`;
      prompt += `   - DO NOT include student name and grade\n`;
      prompt += `   - READ THE INSTRUCTIONS OF EACH PART CAREFULLY\n`;
      prompt += `   - FOLLOW THE EXACT FORMAT required by instructions\n\n`;
      
      prompt += `2. SEQUENCING (Arrange in order):\n`;
      prompt += `   - Provide the correct ORDER of steps\n`;
      prompt += `   - Write the number (1, 2, 3, 4, etc.) in correct sequence\n`;
      prompt += `   - Show steps in CORRECT ORDER\n\n`;
      
      prompt += `3. CHECK OR X / TRUE OR FALSE:\n`;
      prompt += `   - Use "YES" for PROPER / TRUE\n`;
      prompt += `   - Use "NO" for IMPROPER / FALSE\n`;
      prompt += `   - Each item MUST have an answer\n\n`;
      
      prompt += `4. MULTIPLE CHOICE:\n`;
      prompt += `   - Provide the LETTER of correct answer (A, B, C, D)\n`;
      prompt += `   - Write the complete answer after the letter\n\n`;
      
      prompt += `5. ENUMERATION:\n`;
      prompt += `   - Provide COMPLETE list\n`;
      prompt += `   - Follow the required number of items\n\n`;
      
      prompt += `6. ESSAY (1-2 sentences):\n`;
      prompt += `   - Provide answer in 1-2 sentences ONLY\n`;
      prompt += `   - DO NOT exceed the required number of sentences\n\n`;
      
      prompt += `7. IDENTIFICATION:\n`;
      prompt += `   - Provide the CORRECT term or word\n`;
      prompt += `   - Write the complete answer\n\n`;
      
      prompt += `8. MATCHING TYPE:\n`;
      prompt += `   - Provide the correct pairs\n`;
      prompt += `   - Write the letter and its match\n\n`;
      
      prompt += `9. FILL IN THE BLANKS:\n`;
      prompt += `   - Fill the blanks with CORRECT words\n`;
      prompt += `   - Write the complete sentence\n\n`;
      
      prompt += `10. MATH PROBLEMS:\n`;
      prompt += `   - Show step-by-step solution\n`;
      prompt += `   - Provide final answer\n\n`;
      
      prompt += `11. DIAGRAM / GRAPH ANALYSIS:\n`;
      prompt += `   - Analyze the diagram or graph\n`;
      prompt += `   - Provide interpretation and answers\n\n`;
      
      prompt += `12. CASE STUDY / SCENARIO:\n`;
      prompt += `   - Read the case study\n`;
      prompt += `   - Provide answers based on the scenario\n\n`;
      
      prompt += `13. SUMMATIVE TEST / ASSESSMENT:\n`;
      prompt += `   - Answer ALL questions\n`;
      prompt += `   - Follow the format of each part\n\n`;
      
      prompt += `14. PERIODICAL EXAM:\n`;
      prompt += `   - Answer ALL items\n`;
      prompt += `   - Provide complete answers\n\n`;
      
      prompt += `15. LAB REPORT:\n`;
      prompt += `   - Provide observations\n`;
      prompt += `   - Write conclusions\n\n`;
      
      prompt += `USER QUESTION: ${userPrompt || 'Analyze and answer this image'}`;
    }
    return prompt;
  },

  // ========== PROCESS GEMINI RESPONSE ==========
  processGeminiResponse(response) {
    let processed = response || '';
    
    // ===== CONVERT YES/NO TO ✓/✗ =====
    processed = processed.replace(/(\d+\.?)\s*YES\b/gi, '$1 ✓');
    processed = processed.replace(/(\d+\.?)\s*NO\b/gi, '$1 ✗');
    processed = processed.replace(/^YES$/gim, '✓');
    processed = processed.replace(/^NO$/gim, '✗');
    processed = processed.replace(/PROPER\b/gi, '✓');
    processed = processed.replace(/IMPROPER\b/gi, '✗');
    processed = processed.replace(/TRUE\b/gi, '✓');
    processed = processed.replace(/FALSE\b/gi, '✗');
    
    // ===== CLEAN =====
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
