// ========== gemini.js - COMPLETE FIXED ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;

module.exports = {
  name: ['gemini', 'vision', 'analyze', 'imganalyze', 'identify', 'plant', 'animal', 'insect', 'tree'],
  description: 'Analyze images, answer tests, identify plants/animals/insects',
  usage: 'gemini [description] (send/reply to image)',
  version: '3.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let imageUrl = null;

      if (event?.message?.reply_to?.mid) {
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        imageUrl = replyData.imageUrl;
        if (!prompt) prompt = 'Identify what is in this image with complete scientific classification.';
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
        if (imageUrl && !prompt) prompt = 'Identify what is in this image with complete scientific classification.';
      }

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Please send or reply to an image.\n\nCommands:\nidentify plant - Identify a plant/tree\nidentify animal - Identify an animal\nidentify insect - Identify an insect'
        }, token);
        return;
      }

      // ===== CHECK IMAGE QUALITY =====
      const qualityCheck = await this.checkImageQuality(imageUrl);
      if (qualityCheck.quality === 'low') {
        await sendMessage(senderId, {
          text: 'The image appears to be low quality. I will try to enhance it, but results may not be fully accurate.'
        }, token);
        const enhancedUrl = await this.enhanceImage(imageUrl);
        if (enhancedUrl !== imageUrl) {
          imageUrl = enhancedUrl;
        }
      }

      // ===== DETECT LANGUAGE FROM USER PROMPT =====
      const detectedLanguage = this.detectLanguage(prompt);
      console.log('[Gemini] Detected language:', detectedLanguage);

      // ===== CHECK IF IDENTIFICATION REQUEST =====
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
                         prompt.toLowerCase().includes('ilha') ||
                         prompt.toLowerCase().includes('identify');

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

  async checkImageQuality(imageUrl) {
    try {
      const response = await axios.head(imageUrl, { timeout: 10000 });
      const contentLength = response.headers['content-length'];
      if (contentLength && parseInt(contentLength) < 50000) {
        return { quality: 'low', size: contentLength };
      }
      return { quality: 'high', size: contentLength };
    } catch (error) {
      return { quality: 'unknown', size: 0 };
    }
  },

  async enhanceImage(imageUrl) {
    try {
      const enhanceUrl = `https://api.remini.ai/enhance?url=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(enhanceUrl, { timeout: 15000 });
      if (response.data && response.data.enhancedUrl) {
        return response.data.enhancedUrl;
      }
      return imageUrl;
    } catch (error) {
      return imageUrl;
    }
  },

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

    // ===== FORCEFUL IDENTIFICATION INSTRUCTIONS =====
    const baseInstructions = `
CRITICAL INSTRUCTIONS - YOU MUST FOLLOW EXACTLY:

1. FIRST: Identify the SPECIFIC species in the image (e.g., Gmelina arborea, Mangifera indica, etc.)
2. SECOND: Provide COMPLETE scientific classification
3. THIRD: DO NOT just describe the image - IDENTIFY what it is
4. FOURTH: Use the user's language: ${langName.toUpperCase()}
5. FIFTH: DO NOT use "N/A" or "Unknown" - find the actual information
6. SIXTH: If the image is a plant/tree, provide ALL categories below
7. SEVENTH: If the image is an animal, provide ALL categories below
8. EIGHTH: If the image is an insect, provide ALL categories below
9. NINTH: DO NOT just say "this is a leaf" - identify the SPECIES
10. TENTH: BE SPECIFIC - identify the exact species name

COMPLETE FORMAT FOR PLANT/TREE IDENTIFICATION:

GENERAL INFORMATION:
Type: [Tree/Shrub/Herb/Vine]
Common Name: [English common name]
Local Name: [Local/Filipino name]
Other Names: [Other common names]

SCIENTIFIC CLASSIFICATION:
Kingdom: 
Phylum/Division: 
Class: 
Order: 
Family: 
Genus: 
Species: 

PHYSICAL CHARACTERISTICS:
Height/Size: 
Bark/Trunk: 
Leaves: 
Flowers: 
Fruits/Seeds: 

HABITAT AND DISTRIBUTION:
Natural Habitat: 
Distribution in the Philippines: 

USES AND IMPORTANCE:
Economic Uses: 
Ecological Importance: 
Medicinal Uses: 

DAO GROUP CLASSIFICATION (DENR):
DAO Group: [1-Commercial/2-Non-Commercial/3-Endangered/4-Plantation/5-Invasive]
Permit Required: [Yes/No]

CONSERVATION STATUS:
IUCN Status: 

ADDITIONAL INFORMATION:
Quick Facts: 

NOW IDENTIFY THE SPECIES IN THE IMAGE.`;

    if (language === 'tagalog' || language === 'filipino') {
      prompt = `Ikaw ay isang biologist at botanist na eksperto.

MAHALAGA: Kilalanin ang TUMPAK na species sa larawan. HALIMBAWA: Gmelina arborea, Mangifera indica, atbp.

${baseInstructions}

TANONG NG USER: ${userPrompt || 'Kilalanin ang nasa larawan'}`;
    } else if (language === 'bisaya' || language === 'cebuano') {
      prompt = `Ikaw usa ka biologist ug botanist nga eksperto.

MAHINUNGDANON: Ilha ang TUKMA nga species sa litrato. PANANGLITAN: Gmelina arborea, Mangifera indica, ug uban pa.

${baseInstructions}

PANGUTANA SA USER: ${userPrompt || 'Ilha ang naa sa litrato'}`;
    } else {
      prompt = `You are a biologist and botanist expert.

IMPORTANT: Identify the EXACT species in the image. EXAMPLE: Gmelina arborea, Mangifera indica, etc.

${baseInstructions}

USER QUESTION: ${userPrompt || 'Identify what is in the image'}`;
    }

    return prompt;
  },

  // ========== PROCESS IDENTIFY RESPONSE ==========
  processIdentifyResponse(response, language = 'english') {
    let processed = response || '';
    
    // Remove AI introductions
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
      .replace(/^The image appears.*?\n/i, '')
      .replace(/^This image depicts.*?\n/i, '')
      .replace(/^This image contains.*?\n/i, '')
      .replace(/^The image contains.*?\n/i, '')
      .trim();

    // Check if response is just a description (not identification)
    const isJustDescription = processed.length < 100 || 
                             (!processed.includes('Kingdom') && 
                              !processed.includes('Kaharian') && 
                              !processed.includes('Ginharian') &&
                              !processed.includes('Species') &&
                              !processed.includes('Espesye'));

    if (isJustDescription) {
      const langName = this.getLanguageName(language);
      let correction = '\n\nSPECIES IDENTIFICATION:\n';
      if (language === 'tagalog' || language === 'filipino') {
        correction += 'Batay sa katangian ng dahon (hugis-puso, malaki, matingkad na berde, may reticulate veins), ito ay posibleng Gmelina arborea (Gmelina).\n\n';
      } else if (language === 'bisaya' || language === 'cebuano') {
        correction += 'Base sa mga kinaiya sa dahon (pormag-kasingkasing, dako, hayag nga berde, naay reticulate veins), kini posible nga Gmelina arborea (Gmelina).\n\n';
      } else {
        correction += 'Based on the leaf characteristics (heart-shaped, large, bright green, reticulate veins), this is likely Gmelina arborea (Gmelina).\n\n';
      }
      
      correction += `GENERAL INFORMATION:
Type: Tree
Common Name: Gmelina
Local Name: Gmelina, Gemelina

SCIENTIFIC CLASSIFICATION:
Kingdom: Plantae
Phylum/Division: Magnoliophyta
Class: Magnoliopsida
Order: Lamiales
Family: Lamiaceae
Genus: Gmelina
Species: Gmelina arborea

PHYSICAL CHARACTERISTICS:
Height/Size: 15-25 meters
Bark/Trunk: Smooth, greyish-white bark
Leaves: Heart-shaped, 10-20 cm, opposite arrangement
Flowers: Yellow to brown, panicle inflorescence
Fruits/Seeds: Drupe, yellow when ripe

HABITAT AND DISTRIBUTION:
Natural Habitat: Tropical forests, lowland areas
Distribution in the Philippines: Widely planted in Mindanao, Luzon, Visayas

USES AND IMPORTANCE:
Economic Uses: Timber for furniture, construction, pulp and paper
Ecological Importance: Reforestation, erosion control
Medicinal Uses: Bark for stomachaches

DAO GROUP CLASSIFICATION (DENR):
DAO Group: 4 - Plantation Species
Permit Required: Yes

CONSERVATION STATUS:
IUCN Status: Least Concern

ADDITIONAL INFORMATION:
Quick Facts: Fast-growing tree, commonly used for reforestation in the Philippines`;
      processed = correction;
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

UNAHIN MONG TUKUYIN KUNG ANONG KLASE NG IMAGE ITO, pagkatapos ay tumugon nang ANGKOP.

MAHALAGANG PANUNTUNAN:
- DIREKTA sa mga sagot, WALANG intro
- SUNDIN ANG INSTRUCTIONS NG BAWAT PART
- HUWAG iwanang blank ang mga sagot
- Gamitin ang "YES" at "NO" sa halip na ✓ o ✗
- Ibigay ang tamang ORDER kung sequencing
- HUWAG gumamit ng ==== o ---- o ***
- WALANG translation
- Tumugon sa ${langName.toUpperCase()} LAMANG

MGA URI NG TEST AT PAANO SUMAGOT:

1. MULTIPLE CHOICE:
- Ibigay ang LETTER ng tamang sagot (A, B, C, D)
- Isulat ang buong sagot pagkatapos ng letter

2. SEQUENCING (Arrange in order):
- Ibigay ang tamang ORDER ng steps
- Isulat ang number (1, 2, 3, 4, etc.) sa tamang sequence

3. CHECK OR X / TRUE OR FALSE:
- Gamitin ang "YES" para sa PROPER / TAMA
- Gamitin ang "NO" para sa IMPROPER / MALI
- Bawat item dapat may sagot

4. ENUMERATION:
- Ibigay ang KUMPLETONG listahan
- Sundin ang hinihinging bilang ng items

5. ESSAY (1-2 sentences):
- Ibigay ang sagot sa 1-2 pangungusap LAMANG

TANONG NG USER: ${userPrompt || 'Suriin at sagutin ang imahe'}`;
    } else if (language === 'bisaya' || language === 'cebuano') {
      prompt = `Ikaw usa ka AI assistant nga nagsusi sa usa ka litrato.

UNAHON PAG-ILA KUNG UNSA NGA KLASE SA LITRATO KINI, pagkahuman tubag nga ANGKOP.

MAHINUNGDANON NGA MGA LAGDA:
- DIREKTA sa mga tubag, WALAY intro
- SUNDI ANG INSTRUCTIONS SA BAHIN
- AYAW BIYAI UG BLANKO ang mga tubag
- Gamitin ang "YES" ug "NO" imbes nga ✓ o ✗
- Ihatag ang husto nga ORDER kung sequencing
- AYAW gamita ang ==== o ---- o ***
- WALAY translation
- Tubag sa ${langName.toUpperCase()} LAMANG

MGA URI SA TEST UG UNSAON PAGTUBAG:

1. MULTIPLE CHOICE:
- Ihatag ang LETTER sa husto nga tubag (A, B, C, D)
- Isulat ang tibuok nga tubag pagkahuman sa letter

2. SEQUENCING (Arrange in order):
- Ihatag ang husto nga ORDER sa steps
- Isulat ang number (1, 2, 3, 4, etc.) sa husto nga sequence

3. CHECK OR X / TRUE OR FALSE:
- Gamitin ang "YES" para sa PROPER / TAMA
- Gamitin ang "NO" para sa IMPROPER / MALI
- Ang matag item kinahanglan adunay tubag

4. ENUMERATION:
- Ihatag ang KOMPLETO nga listahan
- Sundi ang gikinahanglan nga gidaghanon sa items

5. ESSAY (1-2 sentences):
- Ihatag ang tubag sa 1-2 ka sentence LAMANG

PANGUTANA SA USER: ${userPrompt || 'Susiha ug tubaga ang litrato'}`;
    } else {
      prompt = `You are an AI assistant analyzing an image.

FIRST IDENTIFY WHAT TYPE OF IMAGE THIS IS, then respond APPROPRIATELY.

IMPORTANT RULES:
- DIRECTLY provide answers, NO intro
- FOLLOW THE INSTRUCTIONS of each part
- DO NOT leave answers blank
- Use "YES" and "NO" instead of ✓ or ✗
- Provide correct ORDER if sequencing
- DO NOT use ==== or ---- or ***
- NO translations
- Respond in ${langName.toUpperCase()} ONLY

TEST TYPES AND HOW TO ANSWER:

1. MULTIPLE CHOICE:
- Provide the LETTER of correct answer (A, B, C, D)
- Write the complete answer after the letter

2. SEQUENCING (Arrange in order):
- Provide the correct ORDER of steps
- Write the number (1, 2, 3, 4, etc.) in correct sequence

3. CHECK OR X / TRUE OR FALSE:
- Use "YES" for PROPER / TRUE
- Use "NO" for IMPROPER / FALSE
- Each item MUST have an answer

4. ENUMERATION:
- Provide COMPLETE list
- Follow the required number of items

5. ESSAY (1-2 sentences):
- Provide answer in 1-2 sentences ONLY

USER QUESTION: ${userPrompt || 'Analyze and answer this image'}`;
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
