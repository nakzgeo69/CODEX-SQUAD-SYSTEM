// ========== gemini.js - COMPLETE FIXED ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;

module.exports = {
  name: ['gemini', 'vision', 'analyze', 'imganalyze', 'identify', 'plant', 'animal', 'insect', 'tree'],
  description: 'Analyze images, answer tests, identify plants/animals/insects',
  usage: 'gemini [description] (send/reply to image)',
  version: '4.1.0',
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
        if (!prompt) prompt = 'Analyze this image and provide complete details.';
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
        if (imageUrl && !prompt) prompt = 'Analyze this image and provide complete details.';
      }

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Please send or reply to an image.'
        }, token);
        return;
      }

      // Detect language from user prompt
      const detectedLanguage = this.detectLanguage(prompt);
      console.log('[Gemini] Detected language:', detectedLanguage);

      // Determine image type based on prompt keywords
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

      const isTest = prompt.toLowerCase().includes('quiz') ||
                     prompt.toLowerCase().includes('test') ||
                     prompt.toLowerCase().includes('exam') ||
                     prompt.toLowerCase().includes('assessment') ||
                     prompt.toLowerCase().includes('summative') ||
                     prompt.toLowerCase().includes('activity sheet') ||
                     prompt.toLowerCase().includes('worksheet') ||
                     prompt.toLowerCase().includes('assignment') ||
                     prompt.toLowerCase().includes('multiple choice') ||
                     prompt.toLowerCase().includes('panuto') ||
                     prompt.toLowerCase().includes('directions') ||
                     prompt.toLowerCase().includes('instructions') ||
                     prompt.toLowerCase().includes('questions') ||
                     prompt.toLowerCase().includes('sagutin') ||
                     prompt.toLowerCase().includes('answer');

      console.log('[Gemini] Analyzing image...');
      let response;

      // Route based on image type
      if (isTest) {
        response = await this.callTestAPI(prompt, imageUrl, detectedLanguage);
      } else if (isIdentify) {
        response = await this.callIdentifyAPI(prompt, imageUrl, detectedLanguage);
      } else {
        response = await this.callGeminiAPI(prompt, imageUrl, detectedLanguage);
      }
      
      const aiResponse = this.cleanResponse(response || 'No response from API.');
      await this.sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error('[Gemini] Error:', error.message);
      await sendMessage(senderId, { text: 'Error processing image. Please try again.' }, token);
    }
  },

  // ========== CALL TEST API ==========
  async callTestAPI(prompt, imageUrl, detectedLanguage = 'english') {
    try {
      const testPrompt = this.buildTestPrompt(prompt, detectedLanguage);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(testPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(apiUrl, { timeout: 120000, headers: { 'Accept': 'application/json' } });
      if (!response || !response.data) {
        throw new Error('No response from Gemini API');
      }
      return this.processTestResponse(response.data.response || '');
    } catch (error) {
      console.error('[Test] Error:', error.message);
      return 'Cannot analyze this test. Please try again with a clearer image.';
    }
  },

  // ========== BUILD TEST PROMPT ==========
  buildTestPrompt(userPrompt, language = 'english') {
    const langName = this.getLanguageName(language);
    let prompt;

    if (language === 'tagalog' || language === 'filipino') {
      prompt = `SAGUTIN MO ANG MGA TANONG. HUWAG MAG-INTRO. HUWAG SABIHIN KUNG ANO ANG IMAGE.

PARAAN NG PAGSAGOT:
1. Basahin ang tanong at mga pagpipilian.
2. Piliin ang tamang sagot.
3. Isulat ang letra at ang buong sagot.
4. Magbigay ng maikling paliwanag.
5. Sagutin LAHAT ng tanong.
6. WALANG blanko.
7. WALANG emojis.
8. WALANG ===== o ----- o ***.
9. WALANG intro.
10. Direktang sagot lamang.

FORMAT:
1. [Letra]. [Buong sagot]
Paliwanag: [Maikling paliwanag]

2. [Letra]. [Buong sagot]
Paliwanag: [Maikling paliwanag]

TANONG: ${userPrompt || 'Sagutin ang lahat ng tanong'}`;
    } else if (language === 'bisaya' || language === 'cebuano') {
      prompt = `TUBAGA ANG MGA PANGUTANA. AYAW PAG-INTRO. AYAW INGONA UNSA ANG LITRATO.

UNSAON PAGTUBAG:
1. Basaha ang pangutana ug mga pagpili.
2. Pilia ang husto nga tubag.
3. Isulat ang letra ug ang tibuok nga tubag.
4. Paghatag og mubo nga pasabot.
5. Tubaga TANANG pangutana.
6. WALAY blanko.
7. WALAY emojis.
8. WALAY ===== o ----- o ***.
9. WALAY intro.
10. Direkta nga tubag lamang.

FORMAT:
1. [Letra]. [Tibuok nga tubag]
Pasabot: [Mubo nga pasabot]

2. [Letra]. [Tibuok nga tubag]
Pasabot: [Mubo nga pasabot]

PANGUTANA: ${userPrompt || 'Tubaga ang tanan nga pangutana'}`;
    } else {
      prompt = `ANSWER THE QUESTIONS. DO NOT INTRO. DO NOT SAY WHAT THE IMAGE IS.

HOW TO ANSWER:
1. Read the question and choices.
2. Select the correct answer.
3. Write the letter and the complete answer.
4. Provide a brief explanation.
5. Answer ALL questions.
6. NO blanks.
7. NO emojis.
8. NO ===== or ----- or ***.
9. NO intro.
10. Direct answers only.

FORMAT:
1. [Letter]. [Complete answer]
Explanation: [Brief explanation]

2. [Letter]. [Complete answer]
Explanation: [Brief explanation]

QUESTION: ${userPrompt || 'Answer all questions'}`;
    }
    return prompt;
  },

  // ========== PROCESS TEST RESPONSE ==========
  processTestResponse(response) {
    let processed = response || '';

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
      .replace(/^This is a.*?\n/i, '')
      .replace(/^Ito ay isang.*?\n/i, '')
      .replace(/^This is an.*?\n/i, '')
      .replace(/^Multiple Choice.*?\n/i, '')
      .replace(/^Quiz.*?\n/i, '')
      .replace(/^Test.*?\n/i, '')
      .replace(/^Activity Sheet.*?\n/i, '')
      .replace(/^Name:.*?\n/i, '')
      .replace(/^Pangalan:.*?\n/i, '')
      .replace(/^Grade.*?\n/i, '')
      .replace(/^={2,}/gm, '')
      .replace(/^-{2,}/gm, '')
      .replace(/^\*{2,}/gm, '')
      .replace(/^---+\n/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return this.cleanResponse(processed);
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
      prompt = `KILALANIN ANG NASA LARAWAN. MAGBIGAY NG KUMPLETONG IMPORMASYON.

WALANG INTRO. WALANG EMOJIS. WALANG =====.

FORMAT:
Uri: 
Pangalan: 
Lokal na Pangalan: 

SCIENTIFIC CLASSIFICATION:
Kaharian: 
Dibisyon: 
Hati: 
Ayos: 
Pamilya: 
Sari: 
espesye: 

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

TANONG: ${userPrompt || 'Kilalanin ang nasa larawan'}`;
    } else if (language === 'bisaya' || language === 'cebuano') {
      prompt = `ILHA ANG NASA LITRATO. PAGHATAG OG KOMPLETO NGA IMPORMASYON.

WALAY INTRO. WALAY EMOJIS. WALAY =====.

FORMAT:
Uri: 
Pangalan: 
Lokal nga Pangalan: 

SCIENTIFIC CLASSIFICATION:
Ginharian: 
Dibisyon: 
Klase: 
Han-ay: 
Pamilya: 
Sari: 
espesye: 

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

PANGUTANA: ${userPrompt || 'Ilha ang naa sa litrato'}`;
    } else {
      prompt = `IDENTIFY WHAT IS IN THE IMAGE. PROVIDE COMPLETE INFORMATION.

NO INTRO. NO EMOJIS. NO =====.

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

QUESTION: ${userPrompt || 'Identify what is in the image'}`;
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

    if (processed.length < 50 || !processed.includes('Kingdom') && !processed.includes('Kaharian') && !processed.includes('Ginharian')) {
      let fallback = '\n\nCannot identify the species. Please provide a clearer image.';
      processed += fallback;
    }

    return this.cleanResponse(processed);
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

    if (language === 'tagalog' || language === 'filipino') {
      return `SURIIN ANG LARAWAN AT TUMUGON. WALANG INTRO. WALANG EMOJIS. WALANG =====.

TANONG: ${userPrompt || 'Suriin ang imahe'}`;
    } else if (language === 'bisaya' || language === 'cebuano') {
      return `SUSIHA ANG LITRATO UG TUBAG. WALAY INTRO. WALAY EMOJIS. WALAY =====.

PANGUTANA: ${userPrompt || 'Susiha ang litrato'}`;
    } else {
      return `ANALYZE THE IMAGE AND RESPOND. NO INTRO. NO EMOJIS. NO =====.

QUESTION: ${userPrompt || 'Analyze this image'}`;
    }
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

    // Remove markdown
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');

    // Remove lines and symbols
    cleaned = cleaned.replace(/[━═─]{3,}/g, '');
    cleaned = cleaned.replace(/[-_=]{5,}/g, '');
    cleaned = cleaned.replace(/\|/g, ' ');
    cleaned = cleaned.replace(/_{2,}/g, '');

    // Remove emojis
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

    // Remove specific characters
    cleaned = cleaned.replace(/[•●○■□▪▫►◄↔↑↓→←]/g, '');

    // Clean up math notation
    cleaned = this.cleanMathNotation(cleaned);

    // Fix spacing
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');

    // Remove "Abobot"
    cleaned = cleaned.replace(/[Aa]bobot/g, '');
    cleaned = cleaned.replace(/[Aa]bobots/g, '');

    // Remove extra spaces at start/end
    cleaned = cleaned.trim();

    return cleaned || 'No response.';
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
      'spanish': 'Spanish',
      'french': 'French',
      'german': 'German'
    };
    return names[languageCode] || 'English';
  },

  // ========== GET ERROR MESSAGE ==========
  getErrorMessage(error, detectedLanguage = 'english') {
    if (error.code === 'ECONNABORTED') {
      return 'Request timed out. Please try again.';
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
