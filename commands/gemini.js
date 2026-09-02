// ========== gemini.js - Complete Image Analysis ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;

module.exports = {
  name: ['gemini', 'vision', 'analyze', 'imganalyze', 'identify', 'plant', 'animal', 'insect', 'tree'],
  description: 'Analyze images, answer tests, identify plants/animals/insects with complete classification',
  usage: 'gemini [description] (send/reply to image)',
  version: '2.3.0',
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
        if (!prompt) prompt = 'Analyze this image and provide complete details.';
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
        if (imageUrl && !prompt) prompt = 'Analyze this image and provide complete details.';
      }

      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Please send or reply to an image.\n\nCommands:\nidentify plant - Identify a plant/tree\nidentify animal - Identify an animal\nidentify insect - Identify an insect'
        }, token);
        return;
      }

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

      const detectedLanguage = this.detectLanguage(prompt);

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
      const response = await axios.get(apiUrl, { timeout: 90000, headers: { 'Accept': 'application/json' } });
      if (!response || !response.data) {
        throw new Error('No response from Gemini API');
      }
      return this.processIdentifyResponse(response.data.response || '', detectedLanguage);
    } catch (error) {
      console.error('[Identify] Error:', error.message);
      return 'Cannot identify this image. Please try again with a clearer image.';
    }
  },

  buildIdentifyPrompt(userPrompt, language = 'english') {
    const langName = this.getLanguageName(language);
    let prompt;
    
    if (language === 'tagalog' || language === 'filipino') {
      prompt = `Ikaw ay isang biologist at botanist na eksperto sa pagkilala ng mga halaman, hayop, at insekto.

MAHALAGANG PANUNTUNAN:
- Kilalanin ang nasa larawan nang TUMPAK at KOMPLETO
- Magbigay ng KUMPLETONG impormasyon sa bawat kategorya
- HUWAG gumamit ng "N/A" o "Unknown" - magbigay ng aktwal na impormasyon
- Kung hindi sigurado, ibigay ang pinaka-malapit na posibleng sagot
- HUWAG gumamit ng mga simbolo tulad ng ==== o ---- o ***
- Gumamit LAMANG ng plain text
- Tumugon sa ${langName.toUpperCase()} LAMANG

KUMPLETONG FORMAT NG SAGOT:

PANGKALAHATANG IMPORMASYON:
Uri: [Halaman/Hayop/Insekto/Puno]
Pangalan: [Common name]
Lokal na Pangalan: [Local name]
Ibang Pangalan: [Other names]

SCIENTIFIC CLASSIFICATION:
Kaharian (Kingdom): 
Dibisyon/Pangkat (Phylum/Division): 
Hati (Class): 
Subclass: 
Ayos (Order): 
Pamilya (Family): 
Subfamily: 
Sari (Genus): 
Espesye (Species): 
Subspecies/Variety: 
Kasingkahulugan (Synonyms): 

PISIKAL NA KATANGIAN:
A. Taas/Laki:
Pinakamataas na Taas: 
Diameter sa Dibdib: 
Bilis ng Paglaki: 

B. Puno/Balát:
Kulay ng Balát: 
Tekstura ng Balát: 
Kapal ng Balát: 
Hugis ng Puno: 

C. Dahon:
Uri ng Dahon: 
Hugis ng Dahon: 
Kulay ng Dahon: 
Laki ng Dahon: 
Gilid ng Dahon: 
Pagkakaayos ng Dahon: 
Venation: 
Nalalagas ba ang Dahon: 

D. Bulaklak:
Kulay ng Bulaklak: 
Laki ng Bulaklak: 
Uri ng Bulaklak: 
Panahon ng Pamumulaklak: 
Uri ng Inflorescence: 

E. Bunga/Buto:
Uri ng Bunga: 
Kulay ng Bunga: 
Laki ng Bunga: 
Panahon ng Bunga: 
Uri ng Buto: 
Bilang ng Buto: 

TIRAHAN AT DISTRIBUSYON:
Likas na Tirahan: 
Altitude Range: 
Uri ng Lupa: 
Pangangailangan sa Ulan: 
Temperature Range: 
Native Distribution: 
Distribusyon sa Pilipinas: 
Katayuan ng Introduksyon: 

GAMIT AT KAHALAGAHAN:
A. Pang-ekonomiyang Gamit:
Kahoy/Timber: 
Muwebles: 
Konstruksyon: 
Pulp at Papel: 
Panggatong/Charcoal: 
Sining at Kasangkapan: 
Mga Prutas/Nuts: 
Essential Oils: 
Tina/Tannin: 

B. Ekolohikal na Kahalagahan:
Reforestation: 
Kontrol ng Erosion: 
Proteksyon ng Watershed: 
Suporta sa Biodiversity: 
Nitrogen Fixation: 
Carbon Sequestration: 

C. Medisinal na Gamit:
Bahaging Ginagamit: 
Tradisyonal na Gamit: 
Active Compounds: 
Kontraindikasyon: 

D. Iba pang Gamit:
Puno ng Lilim: 
Ornamental: 
Windbreak: 
Living Fence: 

DAO GROUP CLASSIFICATION (DENR):
DAO Group Number: [1-Commercial/2-Non-Commercial/3-Endangered/4-Plantation/5-Invasive]
DAO Classification: 
Permit Required: 
Restrictions: 

CONSERVATION STATUS:
IUCN Red List Category: 
Population Trend: 
Mga Banta: 
Conservation Measures: 
Protektado sa Batas ng Pilipinas: 
CITES Status: 

CULTIVATION AND PROPAGATION:
Paraan ng Pagpaparami: 
Pagtubo ng Buto: 
Distansya ng Pagtatanim: 
Pangangailangan sa Maintenance: 
Mga Peste at Sakit: 
Pag-aani: 

KARAGDAGANG IMPORMASYON:
Espesyal na Katangian: 
Cultural Significance: 
Lokal na Pangalan sa Iba't ibang Dialekto: 
Kaugnay na Espesye: 
Mabilis na Katotohanan: 

REFERENCES:
Inirerekomendang Sources: 

TANONG NG USER: ${userPrompt || 'Kilalanin ang nasa larangan'}`;
    } else if (language === 'bisaya' || language === 'cebuano') {
      prompt = `Ikaw usa ka biologist ug botanist nga eksperto sa pag-ila sa mga tanom, hayop, ug insekto.

MAHINUNGDANON NGA MGA LAGDA:
- Ilha ang naa sa litrato nga TUKMA ug KOMPLETO
- Paghatag og KOMPLETO nga impormasyon sa matag kategoriya
- AYAW gamita ang "N/A" o "Unknown" - paghatag og aktwal nga impormasyon
- Kung dili sigurado, ihatag ang pinaka-duol nga posible nga tubag
- AYAW gamita ang mga simbolo sama sa ==== o ---- o ***
- Gamita LAMANG ang plain text
- Tubag sa ${langName.toUpperCase()} LAMANG

KOMPLETO NGA FORMAT SA TUBAG:

PANGKINATIBUK-AN NGA IMPORMASYON:
Uri: [Tanom/Hayop/Insekto/Kahoy]
Pangalan: 
Lokal nga Pangalan: 
Ubang mga Pangalan: 

SCIENTIFIC CLASSIFICATION:
Ginharian (Kingdom): 
Dibisyon/Pangkat (Phylum/Division): 
Klase (Class): 
Subclass: 
Han-ay (Order): 
Pamilya (Family): 
Subfamily: 
Sari (Genus): 
Espesye (Species): 
Subspecies/Variety: 
Mga Kasingkahulugan (Synonyms): 

PISIKAL NGA MGA KATANGIAN:
A. Kataas/Gidak-on:
Pinakataas nga Kataas: 
Diameter sa Dughan: 
Katulin sa Pagtubo: 

B. Puno/Panit:
Kolor sa Panit: 
Tekstura sa Panit: 
Bagbag sa Panit: 
Porma sa Puno: 

C. Dahon:
Uri sa Dahon: 
Porma sa Dahon: 
Kolor sa Dahon: 
Gidak-on sa Dahon: 
Ngilit sa Dahon: 
Pagkahikay sa Dahon: 
Venation: 
Nalaya ba ang Dahon: 

D. Bulak:
Kolor sa Bulak: 
Gidak-on sa Bulak: 
Uri sa Bulak: 
Panahon sa Pagpamulak: 
Uri sa Inflorescence: 

E. Prutas/Liso:
Uri sa Prutas: 
Kolor sa Prutas: 
Gidak-on sa Prutas: 
Panahon sa Prutas: 
Uri sa Liso: 
Gidaghanon sa Liso: 

PUY-ANAN UG APOD-APOD:
Natural nga Puy-anan: 
Altitude Range: 
Uri sa Yuta: 
Kinahanglan sa Ulan: 
Temperature Range: 
Native Distribution: 
Apod-apod sa Pilipinas: 
Kahimtang sa Introduksyon: 

GAMIT UG KAHINUNGDANAN:
A. Pang-ekonomiya nga Gamit:
Kahoy/Timber: 
Muwebles: 
Konstruksyon: 
Pulp ug Papel: 
Panggatong/Charcoal: 
Arte ug Himan: 
Mga Prutas/Nuts: 
Essential Oils: 
Tina/Tannin: 

B. Ekolohikal nga Kahinungdanan:
Reforestation: 
Kontrol sa Erosion: 
Proteksyon sa Watershed: 
Suporta sa Biodiversity: 
Nitrogen Fixation: 
Carbon Sequestration: 

C. Medisinal nga Gamit:
Bahin nga Gigamit: 
Tradisyonal nga Gamit: 
Active Compounds: 
Kontraindikasyon: 

D. Ubang Gamit:
Landong nga Puno: 
Ornamental: 
Windbreak: 
Living Fence: 

DAO GROUP CLASSIFICATION (DENR):
DAO Group Number: [1-Commercial/2-Non-Commercial/3-Endangered/4-Plantation/5-Invasive]
DAO Classification: 
Permit Required: 
Restrictions: 

CONSERVATION STATUS:
IUCN Red List Category: 
Population Trend: 
Mga Hulga: 
Conservation Measures: 
Protektado sa Balood sa Pilipinas: 
CITES Status: 

CULTIVATION AND PROPAGATION:
Pamaagi sa Pagpatubo: 
Pagtubo sa Liso: 
Distansya sa Pagtanom: 
Kinahanglan sa Maintenance: 
Mga Peste ug Sakit: 
Pag-ani: 

KARAGDAGANG IMPORMASYON:
Espesyal nga mga Katingalahan: 
Cultural Significance: 
Lokal nga Pangalan sa Lain-laing mga Dialekto: 
Kaugnay nga mga Espesye: 
Paspas nga mga Kamatuoran: 

REFERENCES:
Girekomendar nga mga Sources: 

PANGUTANA SA USER: ${userPrompt || 'Ilha ang naa sa litrato'}`;
    } else {
      prompt = `You are a biologist and botanist expert in identifying plants, animals, and insects.

IMPORTANT RULES:
- Identify the subject in the image ACCURATELY and COMPLETELY
- Provide COMPLETE information for each category
- DO NOT use "N/A" or "Unknown" - provide actual information
- If unsure, provide the closest possible answer
- DO NOT use symbols like ==== or ---- or ***
- Use ONLY plain text
- Respond in ${langName.toUpperCase()} ONLY

COMPLETE RESPONSE FORMAT:

GENERAL INFORMATION:
Type: [Plant/Animal/Insect/Tree]
Common Name: 
Local Name: 
Other Names: 

SCIENTIFIC CLASSIFICATION:
Kingdom: 
Phylum/Division: 
Class: 
Subclass: 
Order: 
Family: 
Subfamily: 
Genus: 
Species: 
Subspecies/Variety: 
Synonyms: 

PHYSICAL CHARACTERISTICS:
A. Height/Size:
Maximum Height: 
Diameter at Breast Height: 
Growth Rate: 

B. Trunk/Bark:
Bark Color: 
Bark Texture: 
Bark Thickness: 
Trunk Form: 

C. Leaves:
Leaf Type: 
Leaf Shape: 
Leaf Color: 
Leaf Size: 
Leaf Margin: 
Leaf Arrangement: 
Venation: 
Deciduous or Evergreen: 

D. Flowers:
Flower Color: 
Flower Size: 
Flower Type: 
Flowering Season: 
Inflorescence Type: 

E. Fruits/Seeds:
Fruit Type: 
Fruit Color: 
Fruit Size: 
Fruit Season: 
Seed Type: 
Number of Seeds: 

HABITAT AND DISTRIBUTION:
Natural Habitat: 
Altitude Range: 
Soil Type: 
Rainfall Requirement: 
Temperature Range: 
Native Distribution: 
Distribution in the Philippines: 
Introduction Status: 

USES AND IMPORTANCE:
A. Economic Uses:
Timber/Wood: 
Furniture: 
Construction: 
Pulp and Paper: 
Fuelwood/Charcoal: 
Handicrafts: 
Fruits/Nuts: 
Essential Oils: 
Dye/Tannin: 

B. Ecological Importance:
Reforestation: 
Soil Erosion Control: 
Watershed Protection: 
Biodiversity Support: 
Nitrogen Fixation: 
Carbon Sequestration: 

C. Medicinal Uses:
Part Used: 
Traditional Uses: 
Active Compounds: 
Contraindications: 

D. Other Uses:
Shade Tree: 
Ornamental: 
Windbreak: 
Living Fence: 

DAO GROUP CLASSIFICATION (DENR):
DAO Group Number: [1-Commercial/2-Non-Commercial/3-Endangered/4-Plantation/5-Invasive]
DAO Classification: 
Permit Required: 
Restrictions: 

CONSERVATION STATUS:
IUCN Red List Category: 
Population Trend: 
Threats: 
Conservation Measures: 
Protected under Philippine Law: 
CITES Status: 

CULTIVATION AND PROPAGATION:
Propagation Methods: 
Seed Germination: 
Planting Distance: 
Maintenance Requirements: 
Pests and Diseases: 
Harvesting: 

ADDITIONAL INFORMATION:
Special Characteristics: 
Cultural Significance: 
Local Names in Different Dialects: 
Related Species: 
Quick Facts: 

REFERENCES:
Recommended Sources: 

USER QUESTION: ${userPrompt || 'Identify what is in the image'}`;
    }
    return prompt;
  },

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
      .replace(/^={2,}/gm, '')
      .replace(/^-{2,}/gm, '')
      .replace(/^\*{2,}/gm, '')
      .trim();
    
    if (processed.length < 100 || !processed.includes('Kingdom') && !processed.includes('Kaharian') && !processed.includes('Ginharian')) {
      const langName = this.getLanguageName(language);
      let fallback = '\n\nADDITIONAL INFORMATION:';
      if (language === 'tagalog' || language === 'filipino') {
        fallback += '\nKung kailangan mo ng mas detalyadong impormasyon, mangyaring magbigay ng mas malinaw na larawan o tukuyin ang halaman/hayop na nais mong kilalanin.';
      } else if (language === 'bisaya' || language === 'cebuano') {
        fallback += '\nKung kinahanglan nimo ug mas detalyado nga impormasyon, palihug paghatag og mas klaro nga litrato o ilha ang tanom/hayop nga gusto nimong ilhon.';
      } else {
        fallback += '\nIf you need more specific details, please provide a clearer image or specify the plant/animal you want to identify.';
      }
      processed += fallback;
    }
    
    return processed;
  },

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
