const axios = require('axios');

class GeminiHandler {
  constructor() {
    this.geminiApiUrl = 'https://norch-project.gleeze.com/api/gemini';
    this.fallbackApiUrl = 'https://api-library-kohi-production.up.railway.app/api/pollination-ai';
    this.timeout = 90000;
    this.maxRetries = 3;
  }

  async callGeminiAPI(prompt, imageUrl = null, detectedLanguage = 'english') {
    try {
      if (imageUrl) {
        const detectedImageLanguage = await this.detectImageLanguage(imageUrl, detectedLanguage);
        const geminiPrompt = this.buildGeminiPrompt(prompt, detectedImageLanguage);
        const response = await this.executeGeminiRequest(geminiPrompt, imageUrl);
        const processed = this.processGeminiResponse(response);
        return processed || 'Unable to analyze image. Please try again.';
      }

      const response = await this.executeGeminiRequest(prompt, null);
      return this.processGeminiResponse(response);
      
    } catch (error) {
      console.error('[Gemini] Error:', error.message);
      return await this.fallbackAPI(prompt);
    }
  }

  async executeGeminiRequest(prompt, imageUrl = null) {
    let attempts = 0;
    let lastError = null;

    while (attempts < this.maxRetries) {
      try {
        attempts++;
        
        let apiUrl = `${this.geminiApiUrl}?prompt=${encodeURIComponent(prompt)}`;
        if (imageUrl) {
          apiUrl += `&imageurl=${encodeURIComponent(imageUrl)}`;
        }

        const response = await axios.get(apiUrl, {
          timeout: this.timeout,
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'GeminiBot/1.0'
          },
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024
        });

        if (response.status === 200 && response.data) {
          return response.data.response || response.data.message || response.data;
        }

        throw new Error(`API returned status ${response.status}`);

      } catch (error) {
        lastError = error;
        console.log(`[Gemini] Attempt ${attempts} failed:`, error.message);
        
        if (attempts >= this.maxRetries) break;
        
        const delay = this.calculateBackoff(attempts, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('All Gemini API attempts failed');
  }

  calculateBackoff(attempt, error) {
    if (error.response?.status === 429) return 10000;
    if (error.response?.status >= 500) return 5000;
    return 2000 * Math.pow(2, attempt - 1);
  }

  async detectImageLanguage(imageUrl, defaultLanguage = 'english') {
    try {
      const detectPrompt = `Analyze this image and determine what language the text in the image is written in. 
      Common languages: Tagalog, Filipino, English, Bisaya, Cebuano, Spanish, etc.
      Respond with ONLY the language name in English (e.g., "Tagalog", "English", "Bisaya", etc.).`;

      const detectUrl = `${this.geminiApiUrl}?prompt=${encodeURIComponent(detectPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
      
      const response = await axios.get(detectUrl, {
        timeout: 30000,
        headers: { 'Accept': 'application/json' }
      });

      if (response.data && response.data.response) {
        const langResult = response.data.response.toLowerCase().trim();
        
        const languageMap = {
          'tagalog': 'tagalog',
          'filipino': 'tagalog',
          'bisaya': 'bisaya',
          'cebuano': 'bisaya',
          'spanish': 'spanish',
          'english': 'english'
        };

        for (const [key, value] of Object.entries(languageMap)) {
          if (langResult.includes(key)) {
            return value;
          }
        }
      }
      
      return defaultLanguage;
      
    } catch (error) {
      return defaultLanguage;
    }
  }

  buildGeminiPrompt(userPrompt, language = 'english') {
    const langName = this.getLanguageName(language);
    
    if (language === 'tagalog' || language === 'bisaya' || language === 'cebuano') {
      return this.buildFilipinoPrompt(userPrompt, langName);
    }
    
    return this.buildEnglishPrompt(userPrompt, langName);
  }

  buildFilipinoPrompt(userPrompt, langName) {
    return `Ikaw ay isang AI assistant na nagsusuri ng isang imahe.

TUKUYIN KUNG ANO ANG NASA LARAWAN at tumugon nang naaayon:

1. ACTIVITY SHEET / WORKSHEET / QUIZ / HOMEWORK / ASSIGNMENT
   - Basahin at unawain ang bawat tanong
   - Magbigay ng TUMPAK na mga sagot
   - Para sa math: Ipakita ang step-by-step na solusyon

2. MATH PROBLEMS / EQUATIONS
   - Ipakita ang step-by-step na solusyon
   - Ibigay ang pinal na sagot

3. SCIENCE / DIAGRAMS / LABELS
   - Tukuyin ang mga bahagi at ang kanilang gamit
   - Ipaliwanag ang mga proseso

4. TEXTBOOK / NOTES / EDUCATIONAL CONTENT
   - Kunin ang mga pangunahing konsepto
   - Ibuod ang mga pangunahing ideya

5. MEME / HUMOROUS IMAGE
   - Tukuyin ang paksa
   - Ipaliwanag ang biro (1-2 pangungusap)
   - Panatilihing MAIKLI

6. GENERAL IMAGE (Photo, Art, Screenshot)
   - Ilarawan kung ano ang nakikita (1-3 pangungusap)
   - Panatilihing SIMPLE at DIREKTA

PARAAN NG PAGTUGON:

Para sa educational/content:
Sagot: [Direktang sagot sa tanong o pangunahing punto]
Paliwanag: [Maikling paliwanag, 1-2 pangungusap]

Para sa memes:
[Maikling paglalarawan ng meme, 1-2 pangungusap]

Para sa general images:
[Maikling paglalarawan, 2-3 pangungusap]

MAHALAGANG PANUNTUNAN:
- Gamitin ang Sagot/Paliwanag format LANG para sa educational content
- Para sa casual images, magbigay lang ng maikling paglalarawan
- Panatilihing MAIKLI at MALINAW ang mga tugon
- WALANG labis na teksto tungkol sa "content type"
- Tumugon sa ${langName.toUpperCase()} na wika
- HUWAG gumamit ng emojis o special characters
- MAGBIGAY lamang ng direktang sagot

TANONG NG USER: ${userPrompt || 'Suriin ang imaheng ito'}`;
  }

  buildEnglishPrompt(userPrompt, langName) {
    return `You are an AI assistant analyzing an image. 

DETECT WHAT THE IMAGE CONTAINS and respond accordingly:

1. ACTIVITY SHEET / WORKSHEET / QUIZ / HOMEWORK / ASSIGNMENT
   - Read and understand each question
   - Provide ACCURATE answers
   - For math: Show step-by-step solution

2. MATH PROBLEMS / EQUATIONS
   - Show step-by-step solution
   - Provide final answer

3. SCIENCE / DIAGRAMS / LABELS
   - Identify parts and their functions
   - Explain processes

4. TEXTBOOK / NOTES / EDUCATIONAL CONTENT
   - Extract key concepts
   - Summarize main ideas

5. MEME / HUMOROUS IMAGE
   - Identify the subject
   - Explain the joke briefly (1-2 sentences)
   - Keep it SHORT

6. GENERAL IMAGE (Photo, Art, Screenshot)
   - Describe what you see (1-3 sentences)
   - Keep it SIMPLE and DIRECT

RESPONSE FORMAT:

For educational/content:
Answer: [Direct answer to the question or main point]
Explanation: [Brief explanation, 1-2 sentences]

For memes:
[Brief description of the meme, 1-2 sentences]

For general images:
[Brief description, 2-3 sentences]

IMPORTANT RULES:
- Use the Answer/Explanation format ONLY for educational content
- For casual images, just give a brief description
- Keep responses SHORT and CLEAR
- NO excessive text about "content type"
- Respond in ${langName.toUpperCase()} language
- DO NOT use emojis or special characters
- Provide ONLY direct answers

USER QUESTION: ${userPrompt || 'Analyze this image'}`;
  }

  processGeminiResponse(response) {
    let processed = response || '';
    
    const introPatterns = [
      /^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i,
      /^Here is my analysis.*?\n/i,
      /^Let me analyze.*?\n/i,
      /^Based on my analysis.*?\n/i,
      /^I can see that.*?\n/i,
      /^Ako ay si Gemini.*?\n/i,
      /^Narito ang aking analysis.*?\n/i,
      /^Hayaan mong i-analyze ko.*?\n/i,
      /^Batay sa aking analysis.*?\n/i,
      /^Nakikita ko na.*?\n/i
    ];

    for (const pattern of introPatterns) {
      processed = processed.replace(pattern, '');
    }

    processed = processed
      .replace(/\n{3,}/g, '\n\n')
      .replace(/```/g, '')
      .replace(/`/g, '')
      .trim();

    return this.cleanResponse(processed);
  }

  cleanResponse(text) {
    if (!text) return 'No response.';
    
    let cleaned = text.trim();
    
    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/---+/g, '');
    cleaned = cleaned.replace(/__/g, '');
    cleaned = cleaned.replace(/_/g, '');
    cleaned = cleaned.replace(/~~/g, '');
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    
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
    
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/^[ \t]+|[ \t]+$/gm, '');
    
    return cleaned.trim() || 'No response.';
  }

  async fallbackAPI(prompt) {
    try {
      const url = `${this.fallbackApiUrl}?prompt=${encodeURIComponent(prompt)}`;
      const response = await axios.get(url, {
        timeout: 30000,
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.data?.status === true) {
        return response.data.data || 'No response from fallback API.';
      }
      
      throw new Error('Fallback API failed');
      
    } catch (error) {
      console.error('[Fallback] Error:', error.message);
      return 'Unable to process your request. Please try again later.';
    }
  }

  getLanguageName(languageCode) {
    const names = {
      'english': 'English',
      'tagalog': 'Tagalog',
      'bisaya': 'Bisaya',
      'cebuano': 'Cebuano',
      'ilocano': 'Ilocano',
      'waray': 'Waray',
      'hiligaynon': 'Hiligaynon',
      'kapampangan': 'Kapampangan',
      'spanish': 'Spanish'
    };
    return names[languageCode] || 'English';
  }

  buildImageFollowUpPrompt(prompt, previousResponse, previousPrompt, wantsDetailed, language = 'english') {
    const langName = this.getLanguageName(language);
    let final = '';
    
    final += `PREVIOUS IMAGE ANALYSIS:\n${previousResponse}\n\n`;
    final += `USER ASKED: "${prompt}"\n\n`;
    final += `Provide a helpful response in ${langName.toUpperCase()}.\n`;
    final += `Keep it CLEAR and DIRECT. Use Answer/Explanation format if applicable.\n`;
    
    if (wantsDetailed) {
      final += `Provide a detailed explanation.\n`;
    } else {
      final += `Keep it concise and to the point.\n`;
    }
    
    final += `DO NOT use emojis or special characters. Provide only direct answers.`;
    
    return final;
  }

  buildImageModificationPrompt(prompt, previousResponse, wantsDetailed, language = 'english') {
    const langName = this.getLanguageName(language);
    let final = '';
    
    final += `PREVIOUS IMAGE ANALYSIS:\n${previousResponse}\n\n`;
    final += `USER REQUEST: "${prompt}"\n\n`;
    
    const lower = prompt.toLowerCase();
    
    if (lower.includes('short') || lower.includes('concise') || lower.includes('brief') ||
        lower.includes('maikli') || lower.includes('iklian') || lower.includes('paikliin') ||
        lower.includes('mubo') || lower.includes('muboa') || lower.includes('halipot')) {
      final += `Make the analysis SHORTER. Keep only the key points.\n`;
    } else if (lower.includes('clear') || lower.includes('clarify') || lower.includes('linaw')) {
      final += `Make the analysis CLEARER. Use simpler language.\n`;
    } else if (lower.includes('simple') || lower.includes('simplify') || lower.includes('pasimplehin')) {
      final += `Provide a SIMPLER explanation.\n`;
    } else if (lower.includes('detail') || lower.includes('elaborate') || lower.includes('explain more')) {
      final += `Provide MORE DETAILS. Expand on each point.\n`;
    } else if (lower.includes('summar') || lower.includes('summary') || lower.includes('buod')) {
      final += `Provide a SUMMARY. Just the most important points.\n`;
    } else {
      final += `Modify the analysis as requested.\n`;
    }
    
    final += `\nRespond in ${langName.toUpperCase()}. Keep it clear and direct. DO NOT use emojis or special characters.`;
    
    return final;
  }

  async handleImageAnalysis(senderId, prompt, imageUrl, token, sendMessage) {
    try {
      const detectedLanguage = this.detectLanguage(prompt);
      const aiResponse = await this.callGeminiAPI(prompt, imageUrl, detectedLanguage);
      
      const chunks = this.splitMessage(aiResponse);
      for (const chunk of chunks) {
        await sendMessage(senderId, { text: chunk }, token);
      }
      
      return aiResponse;
      
    } catch (error) {
      console.error('[Image Analysis] Error:', error.message);
      throw error;
    }
  }

  splitMessage(text, maxChunk = 1900) {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxChunk) {
      chunks.push(text.slice(i, i + maxChunk));
    }
    return chunks;
  }

  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();
    
    const languages = {
      tagalog: {
        keywords: ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ho', 'oho', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'meron', 'mayroon', 'wala', 'hindi', 'oo', 'salamat', 'paki', 'pakiusap', 'tanong', 'sagot', 'sabi', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta'],
        minMatches: 2
      },
      bisaya: {
        keywords: ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'buhaton', 'hatagan', 'ipakita', 'isulti', 'tan-awa', 'basaha', 'sabta', 'tabang', 'tabangi', 'pasabta', 'pasabton', 'mubo', 'muboa', 'simple', 'pasimplehon', 'klaro', 'klaruha', 'kumusta', 'kamusta'],
        minMatches: 2
      },
      cebuano: {
        keywords: ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'buhaton', 'hatagan', 'ipakita', 'isulti', 'tan-awa', 'basaha', 'sabta', 'tabang', 'tabangi', 'pasabta', 'pasabton', 'mubo', 'muboa', 'simple', 'pasimplehon', 'klaro', 'klaruha', 'kumusta', 'kamusta'],
        minMatches: 2
      }
    };
    
    let bestMatch = 'english';
    let bestScore = 0;
    const words = lower.split(/\s+/);
    
    for (const [lang, config] of Object.entries(languages)) {
      let matchCount = 0;
      for (const word of words) {
        if (config.keywords.includes(word)) {
          matchCount++;
        }
      }
      for (const keyword of config.keywords) {
        if (keyword.includes(' ') && lower.includes(keyword)) {
          matchCount += 2;
        }
      }
      if (matchCount >= config.minMatches && matchCount > bestScore) {
        bestMatch = lang;
        bestScore = matchCount;
      }
    }
    return bestMatch;
  }
}

module.exports = new GeminiHandler();
