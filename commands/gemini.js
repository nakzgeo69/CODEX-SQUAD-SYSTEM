// ========== gemini.js - Complete Image Analysis ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;

module.exports = {
  name: ['gemini', 'vision', 'analyze', 'imganalyze', 'identify', 'plant', 'animal', 'insect', 'tree'],
  description: 'Analyze images, answer tests, identify plants/animals/insects',
  usage: 'gemini [description] (send/reply to image)',
  version: '3.3.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let imageUrl = null;

      // Check for image in reply
      if (event?.message?.reply_to?.mid) {
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        imageUrl = replyData.imageUrl;
        if (!prompt) prompt = 'Analyze this image.';
      }

      // Check for image attachment
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

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Please send or reply to an image.\n\nCommands:\nidentify plant - Identify a plant/tree\nidentify animal - Identify an animal\nidentify insect - Identify an insect'
        }, token);
        return;
      }

      // Detect language
      const detectedLanguage = this.detectLanguage(prompt);

      // Check if identification request
      const isIdentify = prompt.toLowerCase().includes('identify') ||
                         prompt.toLowerCase().includes('ano ito') ||
                         prompt.toLowerCase().includes('what is this') ||
                         prompt.toLowerCase().includes('plant') ||
                         prompt.toLowerCase().includes('tree') ||
                         prompt.toLowerCase().includes('animal') ||
                         prompt.toLowerCase().includes('insect') ||
                         prompt.toLowerCase().includes('halaman') ||
                         prompt.toLowerCase().includes('hayop') ||
                         prompt.toLowerCase().includes('insekto') ||
                         prompt.toLowerCase().includes('puno') ||
                         prompt.toLowerCase().includes('kilalanin') ||
                         prompt.toLowerCase().includes('ilha');

      console.log('[Gemini] Analyzing image...');
      let response;

      if (isIdentify) {
        response = await this.callIdentifyAPI(prompt, imageUrl, detectedLanguage);
      } else {
        response = await this.callGeminiAPI(prompt, imageUrl, detectedLanguage);
      }
      
      const aiResponse = this.cleanResponse(response || 'No response from API.');
      await this.sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error('[Gemini] Error:', error.message);
      const errorLang = this.detectLanguage(prompt);
      await sendMessage(senderId, { text: this.getErrorMessage(error, errorLang) }, token);
    }
  },

  // ========== IDENTIFY API ==========
  async callIdentifyAPI(prompt, imageUrl, detectedLanguage = 'english') {
    try {
      const identifyPrompt = this.buildIdentifyPrompt(prompt, detectedLanguage);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(identifyPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(apiUrl, { timeout: 120000, headers: { 'Accept': 'application/json' } });
      if (!response || !response.data) {
        throw new Error('No response from Gemini API');
      }
      return this.processIdentifyResponse(response.data.response || '', detectedLanguage);
    } catch (error) {
      console.error('[Identify] Error:', error.message);
      return 'Cannot identify this image. Please try again with a clearer image.';
    }
  },

  // ========== BUILD IDENTIFY PROMPT ==========
  buildIdentifyPrompt(userPrompt, language = 'english') {
    const langName = this.getLanguageName(language);
    let prompt;

    if (language === 'tagalog' || language === 'filipino') {
      prompt = `Ikaw ay isang biologist at botanist na eksperto.

MAHALAGA: Kilalanin ang TUMPAK na species sa larawan.

FORMAT:
Uri: 
Karaniwang Pangalan: 
Lokal na Pangalan: 

SCIENTIFIC CLASSIFICATION:
Kaharian: 
Dibisyon: 
Hati: 
Ayos: 
Pamilya: 
Sari: 
Espesye: 

KATANGIAN:
Taas/Laki: 
Kulay: 
Natatanging Katangian: 

TIRAHAN:
Likas na Tirahan: 
Distribusyon: 

GAMIT:
Pang-ekonomiya: 
Ekolohikal: 
Medisinal: 

KARAGDAGANG IMPORMASYON:

TANONG NG USER: ${userPrompt || 'Kilalanin ang nasa larawan'}`;
    } else if (language === 'bisaya' || language === 'cebuano') {
      prompt = `Ikaw usa ka biologist ug botanist nga eksperto.

MAHINUNGDANON: Ilha ang TUKMA nga species sa litrato.

FORMAT:
Uri: 
Kasagarang Ngalan: 
Lokal nga Ngalan: 

SCIENTIFIC CLASSIFICATION:
Ginharian: 
Dibisyon: 
Klase: 
Han-ay: 
Pamilya: 
Sari: 
Espesye: 

KATANGIAN:
Kataas: 
Kolor: 
Espesyal nga Katingalahan: 

PUY-ANAN:
Puy-anan: 
Apod-apod: 

GAMIT:
Pang-ekonomiya: 
Ekolohikal: 
Medisinal: 

KARAGDAGANG IMPORMASYON:

PANGUTANA SA USER: ${userPrompt || 'Ilha ang naa sa litrato'}`;
    } else {
      prompt = `You are a biologist and botanist expert.

IMPORTANT: Identify the EXACT species in the image.

FORMAT:
Type: 
Common Name: 
Local Name: 

SCIENTIFIC CLASSIFICATION:
Kingdom: 
Phylum: 
Class: 
Order: 
Family: 
Genus: 
Species: 

CHARACTERISTICS:
Height/Size: 
Color: 
Distinctive Features: 

HABITAT:
Natural Habitat: 
Distribution: 

USES:
Economic: 
Ecological: 
Medicinal: 

ADDITIONAL INFORMATION:

USER QUESTION: ${userPrompt || 'Identify what is in the image'}`;
    }
    return prompt;
  },

  // ========== PROCESS IDENTIFY RESPONSE ==========
  processIdentifyResponse(response, language = 'english') {
    let processed = response || '';
    
    processed = processed
      .replace(/^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i, '')
      .replace(/^Here is my analysis.*?\n/i, '')
      .replace(/^Let me identify.*?\n/i, '')
      .replace(/^Based on my analysis.*?\n/i, '')
      .replace(/^I can see that.*?\n/i, '')
      .replace(/^This appears to be.*?\n/i, '')
      .replace(/^This is a.*?\n/i, '')
      .replace(/^Ako ay si Gemini.*?\n/i, '')
      .replace(/^Narito ang aking pagsusuri.*?\n/i, '')
      .replace(/^Ako si.*?\n/i, '')
      .replace(/^The image shows.*?\n/i, '')
      .replace(/^Ang larawan ay.*?\n/i, '')
      .replace(/^The image is.*?\n/i, '')
      .replace(/^Ang imahe ay.*?\n/i, '')
      .replace(/^={2,}/gm, '')
      .replace(/^-{2,}/gm, '')
      .replace(/^\*{2,}/gm, '')
      .trim();

    if (processed.length < 100 || !processed.includes('Kingdom') && !processed.includes('Kaharian') && !processed.includes('Ginharian')) {
      let fallback = '\n\nCannot identify the species. Please provide a clearer image.';
      processed += fallback;
    }

    return processed;
  },

  // ========== GEMINI API CALL ==========
  async callGeminiAPI(prompt, imageUrl, detectedLanguage = 'english') {
    try {
      const geminiPrompt = this.buildGeminiPrompt(prompt, detectedLanguage);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(geminiPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(apiUrl, { timeout: 120000, headers: { 'Accept': 'application/json' } });
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
    
    if (language === 'tagalog' || language === 'filipino') {
      prompt = `Ikaw ay isang AI assistant na nagsusuri ng isang imahe.

Tukuyin kung anong klase ng imahe ito at tumugon nang naaayon.

PANUNTUNAN:
- Direktang sagot, walang intro
- Sundin ang instructions ng bawat part
- Huwag iwanang blank ang mga sagot
- Gamitin ang "YES" at "NO" sa halip na ✓ o ✗
- Huwag gumamit ng ==== o ---- o ***
- Tumugon sa ${langName.toUpperCase()}

MGA URI NG TEST:
1. Multiple Choice: Ibigay ang LETTER at buong sagot
2. Sequencing: Ibigay ang tamang ORDER (1, 2, 3, 4)
3. True/False: Gamitin ang YES para sa Tama, NO para sa Mali
4. Enumeration: Ibigay ang kumpletong listahan
5. Essay: 1-2 pangungusap lamang

TANONG NG USER: ${userPrompt || 'Suriin ang imahe'}`;
    } else if (language === 'bisaya' || language === 'cebuano') {
      prompt = `Ikaw usa ka AI assistant nga nagsusi sa usa ka litrato.

Ilha kung unsa nga klase sa litrato kini ug tubag nga angkop.

LAGDA:
- Direkta nga tubag, walay intro
- Sunda ang instructions sa bahin
- Ayaw biyai ug blanko ang mga tubag
- Gamitin ang "YES" ug "NO" imbes nga ✓ o ✗
- Ayaw gamita ang ==== o ---- o ***
- Tubag sa ${langName.toUpperCase()}

MGA URI SA TEST:
1. Multiple Choice: Ihatag ang LETTER ug tibuok nga tubag
2. Sequencing: Ihatag ang husto nga ORDER (1, 2, 3, 4)
3. True/False: Gamitin ang YES para sa Tama, NO para sa Mali
4. Enumeration: Ihatag ang kompleto nga listahan
5. Essay: 1-2 ka sentence lamang

PANGUTANA SA USER: ${userPrompt || 'Susiha ang litrato'}`;
    } else {
      prompt = `You are an AI assistant analyzing an image.

Identify what type of image this is and respond appropriately.

RULES:
- Direct answers, no intro
- Follow instructions of each part
- Do not leave answers blank
- Use "YES" and "NO" instead of ✓ or ✗
- Do not use ==== or ---- or ***
- Respond in ${langName.toUpperCase()}

TEST TYPES:
1. Multiple Choice: Provide LETTER and complete answer
2. Sequencing: Provide correct ORDER (1, 2, 3, 4)
3. True/False: Use YES for True, NO for False
4. Enumeration: Provide complete list
5. Essay: 1-2 sentences only

USER QUESTION: ${userPrompt || 'Analyze this image'}`;
    }
    return prompt;
  },

  // ========== PROCESS GEMINI RESPONSE ==========
  processGeminiResponse(response) {
    let processed = response || '';
    
    processed = processed.replace(/(\d+\.?)\s*YES\b/gi, '$1 ✓');
    processed = processed.replace(/(\d+\.?)\s*NO\b/gi, '$1 ✗');
    processed = processed.replace(/^YES$/gim, '✓');
    processed = processed.replace(/^NO$/gim, '✗');
    processed = processed.replace(/PROPER\b/gi, '✓');
    processed = processed.replace(/IMPROPER\b/gi, '✗');
    processed = processed.replace(/TRUE\b/gi, '✓');
    processed = processed.replace(/FALSE\b/gi, '✗');
    
    processed = processed
      .replace(/^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i, '')
      .replace(/^Here is my analysis.*?\n/i, '')
      .replace(/^Let me analyze.*?\n/i, '')
      .replace(/^Based on my analysis.*?\n/i, '')
      .replace(/^I can see that.*?\n/i, '')
      .replace(/^Ako ay si Gemini.*?\n/i, '')
      .replace(/^Narito ang aking pagsusuri.*?\n/i, '')
      .replace(/^The image is.*?\n/i, '')
      .replace(/^Ang larawan ay.*?\n/i, '')
      .replace(/^The image shows.*?\n/i, '')
      .replace(/^Ang larawan ay nagpapakita.*?\n/i, '')
      .replace(/^The image appears.*?\n/i, '')
      .replace(/^This image depicts.*?\n/i, '')
      .replace(/^Ang imaheng ito ay.*?\n/i, '')
      .replace(/^This image is.*?\n/i, '')
      .replace(/^Here\'s a detailed description.*?\n/i, '')
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
      .replace(/^={2,}/gm, '')
      .replace(/^-{2,}/gm, '')
      .replace(/^\*{2,}/gm, '')
      .replace(/^---+\n/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
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
    cleaned = cleaned.replace(/^={2,}/gm, '');
    cleaned = cleaned.replace(/^-{2,}/gm, '');
    cleaned = cleaned.replace(/^\*{2,}/gm, '');
    
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
        keywords: ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 
                   'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 
                   'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ako', 'ikaw', 'siya', 
                   'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 
                   'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'hindi', 'oo', 
                   'salamat', 'paki', 'tanong', 'sagot', 'tulong', 'paliwanag', 'ano', 
                   'bakit', 'paano', 'saan', 'kailan', 'sino', 'halimbawa', 'lutasin', 
                   'hanapin', 'sagutin', 'kumusta', 'musta', 'magandang'],
        minMatches: 2
      },
      bisaya: {
        keywords: ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 
                   'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 
                   'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 
                   'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 
                   'pangutana', 'tubag', 'tabang', 'pananglitan', 'sulbad', 'pangitaa', 
                   'kwentaha', 'maayong', 'buntag', 'hapon', 'gabii', 'udto'],
        minMatches: 2
      },
      cebuano: {
        keywords: ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 
                   'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 
                   'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 
                   'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 
                   'pangutana', 'tubag', 'tabang', 'pananglitan', 'sulbad', 'pangitaa', 
                   'kwentaha', 'maayong'],
        minMatches: 2
      },
      ilocano: {
        keywords: ['adyo', 'kadi', 'ngamin', 'koma', 'manen', 'pay', 'met', 'ngarud', 
                   'kasta', 'kasano', 'ania', 'apay', 'sadino', 'kaano', 'asino', 
                   'mano', 'kayat', 'diak', 'saan', 'wen', 'hauen', 'agpayso', 'salamat', 
                   'dios', 'ti', 'dagiti', 'daytoy', 'dayta', 'daydiay', 'ditoy'],
        minMatches: 2
      },
      hiligaynon: {
        keywords: ['ano', 'nga', 'kag', 'sang', 'sa', 'akon', 'ikaw', 'siya', 'kami', 
                   'kamo', 'sila', 'ini', 'ina', 'adto', 'diin', 'ngaa', 'paano', 
                   'san-o', 'sin-o', 'pila', 'gusto', 'buot', 'pwede', 'kinahanglan', 
                   'may', 'wala', 'indi', 'huo', 'salamat', 'palihug'],
        minMatches: 2
      },
      waray: {
        keywords: ['ano', 'kay', 'nga', 'ha', 'akon', 'ikaw', 'siya', 'kami', 'kamo', 
                   'sila', 'ini', 'ito', 'ada', 'diin', 'ngano', 'pano', 'kanus-a', 
                   'hin-o', 'pira', 'karuyag', 'diri', 'waray', 'oo', 'salamat', 
                   'palihog'],
        minMatches: 2
      },
      kapampangan: {
        keywords: ['aku', 'ika', 'ya', 'kami', 'kayu', 'la', 'ini', 'iti', 'iya', 
                   'keni', 'keta', 'koya', 'nanu', 'bakit', 'makananu', 'nukarin', 
                   'kelan', 'sinu', 'pilang', 'buri', 'ali', 'wa', 'oo', 'salamat'],
        minMatches: 2
      },
      pangasinan: {
        keywords: ['ak', 'sika', 'sikatoy', 'kami', 'kayo', 'sira', 'tagep', 'iman', 
                   'atan', 'antoy', 'ikin', 'piga', 'gusto', 'ag', 'salamat'],
        minMatches: 2
      },
      bicolano: {
        keywords: ['ako', 'ika', 'siya', 'kami', 'kamo', 'sinda', 'ini', 'iyan', 'idto', 
                   'ano', 'tano', 'pano', 'sair', 'nuarin', 'sisay', 'pira', 'gusto', 
                   'dai', 'iyo', 'salamat'],
        minMatches: 2
      },
      spanish: {
        keywords: ['hola', 'como', 'estas', 'que', 'donde', 'cuando', 'quien', 'porque',
                   'para', 'pero', 'sino', 'si', 'no', 'gracias', 'por favor', 'ayuda',
                   'pregunta', 'respuesta', 'ejemplo', 'solucion'],
        minMatches: 2
      },
      french: {
        keywords: ['bonjour', 'merci', 'pardon', 'sil vous plait', 'oui', 'non', 'quoi',
                   'ou', 'quand', 'qui', 'pourquoi', 'comment', 'exemple', 'solution',
                   'aide', 'question', 'reponse'],
        minMatches: 2
      },
      german: {
        keywords: ['hallo', 'danke', 'entschuldigung', 'bitte', 'ja', 'nein', 'was',
                   'wo', 'wann', 'wer', 'warum', 'wie', 'beispiel', 'losung', 'hilfe',
                   'frage', 'antwort'],
        minMatches: 2
      }
    };

    let bestMatch = 'english';
    let bestScore = 0;
    const words = lower.split(/\s+/);
    
    for (const [lang, config] of Object.entries(languages)) {
      let matchCount = 0;
      for (const word of words) {
        for (const kw of config.keywords) {
          if (word.includes(kw) || kw.includes(word)) {
            matchCount++;
            break;
          }
        }
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
      'english': 'English',
      'tagalog': 'Tagalog',
      'filipino': 'Filipino',
      'bisaya': 'Bisaya',
      'cebuano': 'Cebuano',
      'ilocano': 'Ilocano',
      'hiligaynon': 'Hiligaynon',
      'waray': 'Waray',
      'kapampangan': 'Kapampangan',
      'pangasinan': 'Pangasinan',
      'bicolano': 'Bicolano',
      'spanish': 'Spanish',
      'french': 'French',
      'german': 'German'
    };
    return names[languageCode] || 'English';
  },

  getErrorMessage(error, detectedLanguage = 'english') {
    if (error.code === 'ECONNABORTED') {
      const messages = {
        'tagalog': 'Nag-timeout ang request. Subukan muli.',
        'bisaya': 'Na-timeout ang request. Sulayi pag-usab.',
        'cebuano': 'Na-timeout ang request. Sulayi pag-usab.',
        'english': 'Request timed out. Please try again.'
      };
      return messages[detectedLanguage] || messages.english;
    }
    
    const messages = {
      'tagalog': 'Error sa pagproseso. Subukan muli.',
      'bisaya': 'Error sa pagproseso. Sulayi pag-usab.',
      'cebuano': 'Error sa pagproseso. Sulayi pag-usab.',
      'english': 'Error processing request. Please try again.'
    };
    return messages[detectedLanguage] || messages.english;
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
