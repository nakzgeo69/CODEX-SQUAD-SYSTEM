const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images and respond in the SAME language as the image',
  usage: 'Send an image and the bot will analyze it',
  version: '26.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 10,

  async execute(senderId, args, token, event) {
    try {
      const imageUrl = await this.extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, { text: 'Please send an image or reply to an image.' }, token);
        return;
      }

      const userPrompt = args.join(' ').trim() || 'Analyze this image';
      const detectedLanguage = this.detectLanguage(userPrompt || '');
      
      // ===== STEP 1: Try OCR first =====
      let ocrText = '';
      let ocrSuccess = false;
      
      try {
        ocrText = await this.extractTextFromImage(imageUrl);
        if (ocrText && ocrText.length > 10) {
          ocrSuccess = true;
          console.log('[OCR] Success! Text length:', ocrText.length);
        } else {
          console.log('[OCR] Failed or text too short');
        }
      } catch (error) {
        console.log('[OCR] Error:', error.message);
      }

      // ===== STEP 2: Detect language from image text =====
      let imageLanguage = 'english';
      if (ocrSuccess && ocrText) {
        imageLanguage = this.detectLanguageFromText(ocrText);
        console.log('[Language] Detected from image:', imageLanguage);
      } else {
        // If OCR failed, use user prompt language or default to English
        imageLanguage = detectedLanguage || 'english';
        console.log('[Language] Using user language:', imageLanguage);
      }

      // ===== STEP 3: Extract questions =====
      let questions = [];
      let contentType = 'general';
      let prompt = '';
      
      if (ocrSuccess) {
        contentType = this.detectContentType(ocrText);
        questions = this.extractAllQuestions(ocrText, contentType);
        prompt = this.buildForceAnswerPrompt(ocrText, questions, userPrompt, imageLanguage, contentType);
      } else {
        prompt = this.buildDirectVisionPrompt(userPrompt, imageLanguage);
      }

      // ===== STEP 4: Call AI =====
      let cleanResponse = '';
      
      if (ocrSuccess && questions.length > 0) {
        cleanResponse = await this.callAIWithFallback(prompt, imageUrl);
        cleanResponse = this.cleanResponse(cleanResponse);
        cleanResponse = await this.verifyAndComplete(cleanResponse, questions, imageUrl, imageLanguage);
      } else {
        cleanResponse = await this.callDirectVision(imageUrl, userPrompt, imageLanguage);
      }

      // ===== STEP 5: Final cleanup =====
      cleanResponse = this.removePartIndicators(cleanResponse);
      cleanResponse = this.removeDuplicateAnswer(cleanResponse);
      cleanResponse = this.ensureComplete(cleanResponse);
      
      if (!cleanResponse || cleanResponse.length < 5) {
        cleanResponse = await this.callDirectVision(imageUrl, userPrompt, imageLanguage);
      }
      
      if (!cleanResponse || cleanResponse.length < 5) {
        await sendMessage(senderId, { text: 'Unable to analyze. Please try again with a clearer image.' }, token);
        return;
      }

      cleanResponse = cleanResponse.substring(0, 8000);
      await this.sendAllChunks(senderId, cleanResponse, token);
      
    } catch (error) {
      console.error('[gemini] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // DETECT LANGUAGE FROM IMAGE TEXT
  // ============================================================
  detectLanguageFromText(text) {
    if (!text) return 'english';
    const lower = text.toLowerCase();
    
    // English indicators
    const englishKeywords = ['the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'don', 'now'];
    
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ho', 'oho', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'meron', 'mayroon', 'wala', 'hindi', 'oo', 'salamat', 'paki', 'pakiusap', 'tanong', 'sagot', 'sabi', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta'];
    
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'buhaton', 'hatagan', 'ipakita', 'isulti', 'tan-awa', 'basaha', 'sabta', 'tabang', 'tabangi', 'pasabta', 'pasabton', 'mubo', 'muboa', 'simple', 'pasimplehon', 'klaro', 'klaruha', 'kumusta', 'kamusta'];
    
    const codingKeywords = ['python', 'java', 'javascript', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go', 'rust', 'print', 'function', 'class', 'variable', 'array', 'object', 'string', 'integer', 'boolean', 'loop', 'if', 'else', 'elif', 'while', 'for', 'return', 'import', 'from', 'def', 'async', 'await', 'try', 'except', 'finally'];
    
    const mathKeywords = ['solve', 'equation', 'formula', 'calculate', 'compute', 'x =', 'y =', 'plus', 'minus', 'times', 'divided', 'sum', 'difference', 'product', 'quotient', 'angle', 'degree', 'radius', 'diameter', 'circumference', 'area', 'volume'];
    
    // Check for coding content - always English
    for (const kw of codingKeywords) {
      if (lower.includes(kw)) return 'english';
    }
    
    // Check for math content - always English
    for (const kw of mathKeywords) {
      if (lower.includes(kw)) return 'english';
    }
    
    // Check for multiple choice patterns - usually English
    if (lower.match(/[a-d]\)/g) || lower.match(/[a-d]\./g)) {
      return 'english';
    }
    
    // Count language indicators
    let englishCount = 0;
    let tagalogCount = 0;
    let bisayaCount = 0;
    
    const words = lower.split(/\s+/);
    for (const word of words) {
      if (englishKeywords.includes(word)) englishCount++;
      if (tagalogKeywords.includes(word)) tagalogCount++;
      if (bisayaKeywords.includes(word)) bisayaCount++;
    }
    
    // Determine language
    if (tagalogCount >= 2 && tagalogCount > englishCount) return 'tagalog';
    if (bisayaCount >= 2 && bisayaCount > englishCount) return 'bisaya';
    return 'english';
  },

  // ============================================================
  // VERIFY AND COMPLETE WITH LANGUAGE
  // ============================================================
  async verifyAndComplete(response, questions, imageUrl, language) {
    let verified = response;
    const lines = verified.split('\n');
    const answeredNumbers = new Set();
    
    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*([✓✗A-Za-z])/);
      if (match) {
        answeredNumbers.add(parseInt(match[1]));
      }
    }
    
    const missingQuestions = questions.filter(q => !answeredNumbers.has(q.number));
    
    if (missingQuestions.length > 0) {
      console.log('[Verify] Missing answers for:', missingQuestions.map(q => q.number).join(', '));
      
      const langName = this.getLanguageName(language);
      
      const missingPrompt = `Answer these specific questions ONLY (no introduction, no extra text):

${missingQuestions.map(q => `${q.number}. ${q.text}`).join('\n')}

RULES:
- Answer each number directly.
- For true/false or proper/improper: use ✓ or ✗ only.
- For explanation: 1-2 sentences only.
- NO extra text, NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Respond in ${langName.toUpperCase()} language.`;

      try {
        const missingAnswers = await this.callAIWithFallback(missingPrompt, imageUrl);
        const cleanMissing = this.cleanResponse(missingAnswers);
        verified += '\n\n' + cleanMissing;
      } catch (e) {
        console.log('[Verify] Failed to get missing answers:', e.message);
        try {
          const visionAnswer = await this.callDirectVision(imageUrl, 'Answer all questions in the image.', language);
          verified += '\n\n' + visionAnswer;
        } catch (visionError) {
          console.log('[Verify] Direct vision fallback failed');
        }
      }
    }
    
    return verified;
  },

  // ============================================================
  // BUILD FORCE ANSWER PROMPT WITH LANGUAGE
  // ============================================================
  buildForceAnswerPrompt(ocrText, questions, userPrompt, language, contentType) {
    const langName = this.getLanguageName(language);
    
    let prompt = `CRITICAL: You MUST answer EVERY numbered question below. NO BLANKS.

EXTRACTED TEXT FROM IMAGE:
${ocrText}

QUESTIONS TO ANSWER:
${questions.map(q => `${q.number}. ${q.text}`).join('\n')}

RULES:
1. Answer EVERY numbered question above.
2. NO BLANKS. Every number must have an answer.
3. Start directly with answers. NO introduction, NO conclusion.
4. NO extra text, NO explanations beyond what is asked.
5. NO emojis, NO markdown.
6. For true/false or proper/improper: use ONLY ✓ or ✗.
7. For explanation: 1-2 sentences only.
8. For sequencing: numbers in order only.
9. For multiple choice: letter + answer only.
10. If you don't know the answer, state "Unknown" - but DO NOT leave blank.
11. Respond in ${langName.toUpperCase()} language - EXACTLY matching the image language.

DETECTED CONTENT TYPE: ${contentType}

${contentType === 'activity_sheet' ? `
SPECIFIC FORMAT:
- Part II (numbers 1-10): Each gets ✓ or ✗ only.
- Part III (numbers 1-3): Each gets 1-2 sentences only.
` : ''}

${userPrompt ? `Additional: ${userPrompt}` : ''}

LANGUAGE: ${langName.toUpperCase()} (MUST respond in this language)

NOW ANSWER ALL QUESTIONS ABOVE. NO BLANKS.`;

    return prompt;
  },

  // ============================================================
  // BUILD DIRECT VISION PROMPT WITH LANGUAGE
  // ============================================================
  buildDirectVisionPrompt(userPrompt, language) {
    const langName = this.getLanguageName(language);
    
    return `Analyze this image and provide a COMPLETE answer.

User question: ${userPrompt}

RULES:
- Answer directly. NO introduction, NO conclusion.
- NO emojis, NO markdown.
- If it's a multiple choice question, provide the letter and answer.
- If it's a math problem, show steps and final answer.
- If it's a logic puzzle, show reasoning and final answer.
- If it's an activity sheet, answer all questions.
- Be COMPLETE. Do NOT use "..." to truncate.
- Respond in ${langName.toUpperCase()} language.

Now analyze the image and answer the question.`;
  },

  // ============================================================
  // CALL DIRECT VISION WITH LANGUAGE
  // ============================================================
  async callDirectVision(imageUrl, userPrompt, language) {
    const langName = this.getLanguageName(language);
    
    const visionPrompt = `Analyze this image and provide a COMPLETE answer.

User question: ${userPrompt}

RULES:
- Answer directly. NO introduction, NO conclusion.
- NO emojis, NO markdown.
- If it's a multiple choice question, provide the letter and answer.
- If it's a math problem, show steps and final answer.
- If it's a logic puzzle, show reasoning and final answer.
- If it's an activity sheet, answer all questions.
- Be COMPLETE. Do NOT use "..." to truncate.
- Respond in ${langName.toUpperCase()} language.`;

    try {
      const encodedPrompt = encodeURIComponent(visionPrompt);
      const url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}&imageurl=${encodeURIComponent(imageUrl)}`;
      
      const response = await axios.get(url, {
        timeout: 120000,
        headers: { 'Accept': 'application/json' },
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });
      
      if (response.status === 200 && response.data) {
        const result = response.data.response || response.data.message || '';
        if (result && result.length > 10) {
          console.log('[DirectVision] Gemini success!');
          return this.cleanResponse(result);
        }
      }
      
      throw new Error('Gemini direct vision failed');
      
    } catch (error) {
      console.log('[DirectVision] Gemini failed, trying Chipp AI...');
      
      try {
        const chippUrl = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(visionPrompt)}&url=${encodeURIComponent(imageUrl)}`;
        const chippResponse = await axios.get(chippUrl, {
          timeout: 60000,
          headers: { 'Accept': 'application/json' }
        });
        
        if (chippResponse.data && chippResponse.data.status === true && chippResponse.data.response) {
          console.log('[DirectVision] Chipp AI success!');
          return this.cleanResponse(chippResponse.data.response);
        }
      } catch (chippError) {
        console.log('[DirectVision] Chipp AI failed:', chippError.message);
      }
      
      throw new Error('All direct vision methods failed');
    }
  },

  // ============================================================
  // EXTRACT ALL QUESTIONS
  // ============================================================
  extractAllQuestions(ocrText, contentType) {
    const questions = [];
    const lines = ocrText.split('\n');
    let currentSection = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.match(/PART\s*II/i) || trimmed.match(/HARVEST/i)) {
        currentSection = 'part2';
        continue;
      }
      if (trimmed.match(/PART\s*III/i) || trimmed.match(/EXPLAIN WHY/i)) {
        currentSection = 'part3';
        continue;
      }
      
      const match = trimmed.match(/^(\d+)\.\s*(.+)/);
      if (match) {
        questions.push({
          number: parseInt(match[1]),
          text: match[2].trim(),
          section: currentSection || 'general'
        });
      }
    }
    
    if (questions.length === 0) {
      const numMatches = ocrText.match(/(\d+)\.\s*([^\n]+)/g);
      if (numMatches) {
        for (const match of numMatches) {
          const parts = match.match(/(\d+)\.\s*(.+)/);
          if (parts) {
            questions.push({
              number: parseInt(parts[1]),
              text: parts[2].trim(),
              section: 'general'
            });
          }
        }
      }
    }
    
    return questions;
  },

  // ============================================================
  // DETECT CONTENT TYPE
  // ============================================================
  detectContentType(ocrText) {
    const combined = ocrText.toLowerCase();
    
    if (combined.includes('part i') || combined.includes('sequence') || combined.includes('arrange')) {
      return 'activity_sheet';
    }
    if (combined.includes('part ii') || combined.includes('harvest') || combined.includes('proper') || combined.includes('improper')) {
      return 'activity_sheet';
    }
    if (combined.includes('part iii') || combined.includes('explain why') || combined.includes('why should')) {
      return 'activity_sheet';
    }
    if (combined.includes('solve') || combined.includes('equation') || combined.includes('x =')) {
      return 'math';
    }
    if (combined.includes('logic') || combined.includes('puzzle') || combined.includes('reasoning')) {
      return 'logic';
    }
    if (combined.includes('multiple choice') || combined.includes('choose') || combined.includes('a)') || combined.includes('a.')) {
      return 'multiple_choice';
    }
    if (combined.includes('python') || combined.includes('java') || combined.includes('javascript') || combined.includes('print') || combined.includes('function')) {
      return 'coding';
    }
    return 'general';
  },

  // ============================================================
  // CALL AI WITH FALLBACK
  // ============================================================
  async callAIWithFallback(prompt, imageUrl) {
    try {
      console.log('[AI] Trying Gemini API...');
      const result = await this.callGeminiWithRetry(prompt, imageUrl);
      if (result && result.length > 10) {
        console.log('[AI] Gemini API success!');
        return this.cleanResponse(result);
      }
    } catch (error) {
      console.log('[AI] Gemini API failed:', error.message);
    }

    try {
      console.log('[AI] Trying Chipp AI fallback...');
      const result = await this.callChippAI(prompt, imageUrl);
      if (result && result.length > 10) {
        console.log('[AI] Chipp AI success!');
        return this.cleanResponse(result);
      }
    } catch (error) {
      console.log('[AI] Chipp AI failed:', error.message);
    }

    throw new Error('All AI services failed');
  },

  // ============================================================
  // CALL CHIPP AI
  // ============================================================
  async callChippAI(prompt, imageUrl) {
    try {
      const url = `https://ceddsrestapi.vercel.app/ai/chipp?message=${encodeURIComponent(prompt)}&url=${encodeURIComponent(imageUrl)}`;
      
      const response = await axios.get(url, {
        timeout: 60000,
        headers: { 'Accept': 'application/json' }
      });

      const data = response.data;

      if (data.status === true && data.response) {
        return data.response;
      }

      throw new Error('Chipp AI returned invalid response');
      
    } catch (error) {
      console.error('[Chipp AI] Error:', error.message);
      throw error;
    }
  },

  // ============================================================
  // OCR: EXTRACT TEXT FROM IMAGE
  // ============================================================
  async extractTextFromImage(imageUrl) {
    try {
      console.log('[OCR] Extracting text from image...');
      
      const apiKey = 'K85096363488957';
      const url = `https://api.ocr.space/parse/imageurl?apikey=${apiKey}&url=${encodeURIComponent(imageUrl)}&language=eng,tgl&isOverlayRequired=false`;
      
      const response = await axios.get(url, {
        timeout: 60000,
        headers: { 'Accept': 'application/json' }
      });
      
      const data = response.data;
      
      if (data.IsErroredOnProcessing) {
        console.log('[OCR] Error:', data.ErrorMessage?.[0] || 'Unknown OCR error');
        return '';
      }
      
      const parsedText = data?.ParsedResults?.[0]?.ParsedText || '';
      console.log('[OCR] Extracted text length:', parsedText.length);
      
      return parsedText;
      
    } catch (error) {
      console.error('[OCR] Error:', error.message);
      return '';
    }
  },

  // ============================================================
  // CALL GEMINI WITH RETRY
  // ============================================================
  async callGeminiWithRetry(prompt, imageUrl) {
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`[Gemini] Attempt ${attempts}...`);
        
        const encodedPrompt = encodeURIComponent(prompt);
        let url = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}`;
        if (imageUrl) {
          url += `&imageurl=${encodeURIComponent(imageUrl)}`;
        }
        
        const response = await axios.get(url, {
          timeout: 120000,
          headers: { 'Accept': 'application/json' },
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024
        });
        
        if (response.status === 200 && response.data) {
          const result = response.data.response || response.data.message || '';
          if (result && result.length > 10) {
            console.log(`[Gemini] Success on attempt ${attempts}`);
            return result;
          }
        }
        
        throw new Error('Empty or invalid response');
        
      } catch (error) {
        lastError = error;
        console.log(`[Gemini] Attempt ${attempts} failed:`, error.message);
        
        if (attempts < maxAttempts) {
          const delay = error.response?.status === 429 ? 10000 : 
                       error.response?.status >= 500 ? 5000 : 3000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('All Gemini attempts failed');
  },

  // ============================================================
  // CLEAN RESPONSE
  // ============================================================
  cleanResponse(response) {
    let cleaned = response || '';

    const patterns = [
      /^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i,
      /^Here is my analysis.*?\n/i,
      /^Let me analyze.*?\n/i,
      /^Based on my analysis.*?\n/i,
      /^I can see that.*?\n/i,
      /^The image appears to be.*?\n/i,
      /^This looks like.*?\n/i,
      /^Upon examination.*?\n/i,
      /^After analyzing.*?\n/i,
      /^The image shows.*?\n/i,
      /^Ako ay si Gemini.*?\n/i,
      /^Narito ang aking analysis.*?\n/i,
      /^Hayaan mong i-analyze ko.*?\n/i,
      /^Batay sa aking analysis.*?\n/i,
      /^Nakikita ko na.*?\n/i,
      /^CRITICAL:.*?\n/i,
      /^EXTRACTED TEXT FROM IMAGE:.*?\n/i,
      /^QUESTIONS TO ANSWER:.*?\n/i,
      /^RULES:.*?\n/i,
      /^DETECTED CONTENT TYPE:.*?\n/i,
      /^SPECIFIC FORMAT:.*?\n/i,
      /^LANGUAGE:.*?\n/i,
      /^Additional:.*?\n/i,
      /^NOW ANSWER ALL QUESTIONS.*?\n/i,
      /^You are a precise AI.*?\n/i,
      /^\{"operator":.*?\n/i,
      /^\{"timestamp":.*?\n/i,
      /^\{"responseTime":.*?\n/i,
      /^\{"status":.*?\n/i,
      /^\{"response":.*?\n/i,
      /^\{/
    ];

    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    cleaned = cleaned
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/#{1,6}\s*/g, '')
      .replace(/---+/g, '')
      .replace(/__/g, '')
      .replace(/_/g, '')
      .replace(/~~/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    cleaned = cleaned
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F700}-\u{1F77F}]/gu, '')
      .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')
      .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[\u{24C2}-\u{1F251}]/gu, '');

    if (!cleaned.match(/^(Answer|Sagot):/i)) {
      const lines = cleaned.split('\n');
      const firstLine = lines[0] || '';
      if (firstLine.trim()) {
        cleaned = 'Answer: ' + cleaned;
      }
    }

    return cleaned;
  },

  // ============================================================
  // REMOVE PART INDICATORS
  // ============================================================
  removePartIndicators(text) {
    if (!text) return text;
    return text.replace(/\[Part\s*\d+\/\d+\]\s*/gi, '');
  },

  // ============================================================
  // REMOVE DUPLICATE "Answer:"
  // ============================================================
  removeDuplicateAnswer(text) {
    if (!text) return text;
    
    const lines = text.split('\n');
    let newLines = [];
    let foundAnswer = false;
    
    for (const line of lines) {
      if (line.match(/^(Answer|Sagot):/i)) {
        if (!foundAnswer) {
          newLines.push(line);
          foundAnswer = true;
        }
      } else {
        newLines.push(line);
      }
    }
    
    if (!foundAnswer && newLines.length > 0) {
      const firstLine = newLines[0] || '';
      if (firstLine.trim()) {
        newLines[0] = 'Answer: ' + firstLine;
      }
    }
    
    return newLines.join('\n');
  },

  // ============================================================
  // ENSURE COMPLETE RESPONSE
  // ============================================================
  ensureComplete(text) {
    if (!text) return text;

    if (text.trim().endsWith('...')) {
      text = text.replace(/\.\.\.$/, '');
    }

    const lastChar = text.trim().slice(-1);
    if (!['.', '!', '?'].includes(lastChar) && text.length > 50) {
      const sentences = text.match(/[^.!?]+[.!?]/g);
      if (sentences && sentences.length > 0) {
        text = sentences.join(' ');
      }
    }

    return text;
  },

  // ============================================================
  // SEND ALL CHUNKS
  // ============================================================
  async sendAllChunks(senderId, text, token) {
    if (!text) return;

    if (text.length <= 1900) {
      await sendMessage(senderId, { text: text }, token);
      return;
    }

    const chunks = this.splitMessage(text, 1900);
    let firstChunk = true;

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      if (!chunk) continue;

      if (!firstChunk) {
        chunk = chunk.replace(/^(Answer|Sagot):\s*/i, '');
      }

      try {
        await sendMessage(senderId, { text: chunk }, token);
        firstChunk = false;

        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error('[sendAllChunks] Error:', error.message);
      }
    }
  },

  // ============================================================
  // DETECT LANGUAGE FROM USER PROMPT
  // ============================================================
  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();
    
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ho', 'oho', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'meron', 'mayroon', 'wala', 'hindi', 'oo', 'salamat', 'paki', 'pakiusap', 'tanong', 'sagot', 'sabi', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'buhaton', 'hatagan', 'ipakita', 'isulti', 'tan-awa', 'basaha', 'sabta', 'tabang', 'tabangi', 'pasabta', 'pasabton', 'mubo', 'muboa', 'simple', 'pasimplehon', 'klaro', 'klaruha', 'kumusta', 'kamusta'];
    
    let tagalogCount = 0;
    let bisayaCount = 0;
    const words = lower.split(/\s+/);
    
    for (const word of words) {
      if (tagalogKeywords.includes(word)) tagalogCount++;
      if (bisayaKeywords.includes(word)) bisayaCount++;
    }
    
    if (tagalogCount >= 2 && tagalogCount >= bisayaCount) return 'tagalog';
    if (bisayaCount >= 2 && bisayaCount > tagalogCount) return 'bisaya';
    return 'english';
  },

  getLanguageName(languageCode) {
    const names = {
      'english': 'English',
      'tagalog': 'Tagalog',
      'bisaya': 'Bisaya'
    };
    return names[languageCode] || 'English';
  },

  // ============================================================
  // UTILITY FUNCTIONS
  // ============================================================
  getErrorMessage(error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return 'Server is busy. Please wait a moment and try again.';
    }
    if (error.response?.status === 400) {
      return 'Invalid image format. Please send a valid image.';
    }
    if (error.response?.status === 500 || error.response?.status === 502 || error.response?.status === 503) {
      return 'Server is currently down. Please try again later.';
    }
    if (error.response?.status === 429) {
      return 'API rate limit reached. Please wait a moment and try again.';
    }
    if (error.response?.status === 413) {
      return 'Image too large. Please compress and try again.';
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return 'Connection failed. Please check your internet connection.';
    }
    return 'Error analyzing image. Please try again.';
  },

  async extractImageUrl(event, token) {
    try {
      if (event?.message?.reply_to?.mid) {
        return await this.getRepliedImage(event.message.reply_to.mid, token);
      }
      if (event?.message?.attachments && event.message.attachments.length > 0) {
        for (const attachment of event.message.attachments) {
          if (attachment.type === 'image' || attachment.type === 'photo') {
            const url = attachment.payload?.url || attachment.url || null;
            if (url) {
              const urlObj = new URL(url);
              urlObj.searchParams.set('access_token', token);
              return urlObj.toString();
            }
          }
        }
      }
    } catch (err) {
      console.error('[Image Extraction] Failed:', err);
    }
    return null;
  },

  async getRepliedImage(mid, token) {
    try {
      const url = `https://graph.facebook.com/v21.0/${mid}/attachments`;
      const params = { access_token: token };
      const response = await axios.get(url, { params, timeout: 30000 });
      if (response?.data?.data && response.data.data.length > 0) {
        const attachment = response.data.data[0];
        const imageUrl = attachment?.image_data?.url || attachment?.url || null;
        if (imageUrl) {
          const urlObj = new URL(imageUrl);
          urlObj.searchParams.set('access_token', token);
          return urlObj.toString();
        }
      }
      return null;
    } catch (err) {
      console.error('[Replied Image] Failed:', err.response?.data || err.message);
      return null;
    }
  },

  splitMessage(text, maxLength) {
    const chunks = [];
    if (text.length <= maxLength) {
      return [text];
    }
    const lines = text.split('\n');
    let currentChunk = '';
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    return chunks;
  }
};
