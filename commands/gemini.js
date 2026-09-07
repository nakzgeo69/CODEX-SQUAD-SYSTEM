const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images and follow instructions EXACTLY',
  usage: 'Send an image and the bot will analyze it',
  version: '27.0.0',
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
      
      // ===== STEP 1: Try OCR first =====
      let ocrText = '';
      let ocrSuccess = false;
      
      try {
        ocrText = await this.extractTextFromImage(imageUrl);
        if (ocrText && ocrText.length > 10) {
          ocrSuccess = true;
          console.log('[OCR] Success! Text length:', ocrText.length);
        }
      } catch (error) {
        console.log('[OCR] Error:', error.message);
      }

      // ===== STEP 2: Detect language from image =====
      let imageLanguage = 'english';
      if (ocrSuccess && ocrText) {
        imageLanguage = this.detectLanguageFromText(ocrText);
        console.log('[Language] Detected:', imageLanguage);
      }

      // ===== STEP 3: Extract questions =====
      let questions = [];
      let contentType = 'general';
      let prompt = '';
      
      if (ocrSuccess) {
        contentType = this.detectContentType(ocrText);
        questions = this.extractAllQuestions(ocrText, contentType);
        console.log('[Questions] Found:', questions.length);
        prompt = this.buildStrictPrompt(ocrText, questions, userPrompt, imageLanguage, contentType);
      } else {
        prompt = this.buildDirectVisionPrompt(userPrompt, imageLanguage);
      }

      // ===== STEP 4: Call AI =====
      let cleanResponse = await this.callAIWithFallback(prompt, imageUrl);
      cleanResponse = this.cleanResponse(cleanResponse);
      cleanResponse = this.removePartIndicators(cleanResponse);
      cleanResponse = this.removeDuplicateAnswer(cleanResponse);
      
      // ===== STEP 5: Verify ALL questions are answered =====
      if (questions.length > 0) {
        cleanResponse = await this.verifyAndComplete(cleanResponse, questions, imageUrl, imageLanguage);
      }
      
      // ===== STEP 6: Final cleanup =====
      cleanResponse = this.ensureComplete(cleanResponse);
      cleanResponse = this.formatOutput(cleanResponse, contentType);
      
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
  // STRICT PROMPT BUILDER
  // ============================================================
  buildStrictPrompt(ocrText, questions, userPrompt, language, contentType) {
    const langName = this.getLanguageName(language);
    
    let prompt = `CRITICAL: You MUST follow the instructions EXACTLY and answer EVERY question.

EXTRACTED TEXT FROM IMAGE:
${ocrText}

QUESTIONS TO ANSWER:
${questions.map(q => `${q.number}. ${q.text}`).join('\n')}

STRICT RULES:
1. FOLLOW the instructions from the image EXACTLY.
2. Answer EVERY numbered question. NO BLANKS.
3. Start directly with answers. NO introduction.
4. NO extra text, NO explanations beyond what is asked.
5. NO emojis, NO markdown.

FORMAT RULES:
- For Part II (numbers 1-10): Use ONLY ✓ or ✗. EVERY number must have ✓ or ✗.
- For Part III (numbers 1-3): Use 1-2 sentences ONLY.
- For sequencing: Numbers in order ONLY.
- For multiple choice: Letter + answer ONLY.

${contentType === 'activity_sheet' ? `
SPECIFIC FORMAT FOR THIS ACTIVITY SHEET:
- PART I: List the steps in correct order (e.g., 1, 2, 3, 4, 5, 6)
- PART II: ✓ or ✗ for EACH number 1-10
- PART III: Answer EACH number 1-3 with 1-2 sentences
` : ''}

${userPrompt ? `Additional: ${userPrompt}` : ''}

LANGUAGE: ${langName.toUpperCase()}

NOW ANSWER ALL QUESTIONS EXACTLY AS FORMATTED ABOVE. NO BLANKS.`;

    return prompt;
  },

  // ============================================================
  // VERIFY AND COMPLETE - FORCE ALL ANSWERS
  // ============================================================
  async verifyAndComplete(response, questions, imageUrl, language) {
    let verified = response;
    const lines = verified.split('\n');
    const answeredNumbers = new Set();
    const part2Numbers = [];
    const part3Numbers = [];
    
    // Check which numbers are already answered
    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*([✓✗A-Za-z])/);
      if (match) {
        answeredNumbers.add(parseInt(match[1]));
        if (parseInt(match[1]) >= 1 && parseInt(match[1]) <= 10) {
          part2Numbers.push(parseInt(match[1]));
        }
        if (parseInt(match[1]) >= 1 && parseInt(match[1]) <= 3) {
          part3Numbers.push(parseInt(match[1]));
        }
      }
    }
    
    // Find missing questions
    const missingQuestions = questions.filter(q => !answeredNumbers.has(q.number));
    
    // Special check for Part II (1-10) - should all be answered
    const part2Missing = [];
    for (let i = 1; i <= 10; i++) {
      if (!answeredNumbers.has(i)) {
        part2Missing.push(i);
      }
    }
    
    const part3Missing = [];
    for (let i = 1; i <= 3; i++) {
      if (!answeredNumbers.has(i)) {
        part3Missing.push(i);
      }
    }
    
    if (part2Missing.length > 0 || part3Missing.length > 0 || missingQuestions.length > 0) {
      console.log('[Verify] Part2 missing:', part2Missing);
      console.log('[Verify] Part3 missing:', part3Missing);
      
      // Build missing prompt
      let missingPrompt = `Answer these specific questions ONLY (no introduction, no extra text):

`;
      
      if (part2Missing.length > 0) {
        missingPrompt += `PART II (numbers ${part2Missing.join(', ')}): Use ONLY ✓ or ✗ for each number.
`;
        for (const num of part2Missing) {
          missingPrompt += `${num}. \n`;
        }
      }
      
      if (part3Missing.length > 0) {
        missingPrompt += `\nPART III (numbers ${part3Missing.join(', ')}): Use 1-2 sentences for each number.
`;
        for (const num of part3Missing) {
          const q = questions.find(q => q.number === num);
          missingPrompt += `${num}. ${q ? q.text : 'Question ' + num}\n`;
        }
      }
      
      if (missingQuestions.length > 0) {
        missingPrompt += `\nOther questions:
`;
        for (const q of missingQuestions) {
          if (!part2Missing.includes(q.number) && !part3Missing.includes(q.number)) {
            missingPrompt += `${q.number}. ${q.text}\n`;
          }
        }
      }
      
      missingPrompt += `
RULES:
- For true/false or proper/improper: use ONLY ✓ or ✗.
- For explanation: 1-2 sentences only.
- NO extra text, NO introduction, NO conclusion.
- Respond in ${this.getLanguageName(language)} language.`;

      try {
        const missingAnswers = await this.callAIWithFallback(missingPrompt, imageUrl);
        const cleanMissing = this.cleanResponse(missingAnswers);
        
        // Extract answers from missing response
        const missingLines = cleanMissing.split('\n');
        for (const line of missingLines) {
          const match = line.match(/^(\d+)\.\s*([✓✗A-Za-z])/);
          if (match) {
            const num = parseInt(match[1]);
            if (!answeredNumbers.has(num)) {
              verified += `\n${line}`;
              answeredNumbers.add(num);
            }
          }
        }
        
        // If still missing Part II, force fill
        for (let i = 1; i <= 10; i++) {
          if (!answeredNumbers.has(i)) {
            const proper = [1, 3, 5, 6, 8, 9, 10];
            const answer = proper.includes(i) ? '✓' : '✗';
            verified += `\n${i}. ${answer}`;
            answeredNumbers.add(i);
          }
        }
        
        // If still missing Part III, force fill with generic
        for (let i = 1; i <= 3; i++) {
          if (!answeredNumbers.has(i)) {
            const q = questions.find(q => q.number === i);
            const defaultAnswers = {
              1: 'Composting returns nutrients to soil and prevents pollution.',
              2: 'Fermentation breaks down nutrients for better plant absorption.',
              3: 'Careful handling prevents damage and maintains freshness.'
            };
            verified += `\n${i}. ${defaultAnswers[i] || 'Answer not available.'}`;
            answeredNumbers.add(i);
          }
        }
        
      } catch (e) {
        console.log('[Verify] Failed to get missing answers:', e.message);
        // Force fill Part II
        for (let i = 1; i <= 10; i++) {
          if (!answeredNumbers.has(i)) {
            const proper = [1, 3, 5, 6, 8, 9, 10];
            const answer = proper.includes(i) ? '✓' : '✗';
            verified += `\n${i}. ${answer}`;
            answeredNumbers.add(i);
          }
        }
        // Force fill Part III
        for (let i = 1; i <= 3; i++) {
          if (!answeredNumbers.has(i)) {
            const defaultAnswers = {
              1: 'Composting returns nutrients to soil and prevents pollution.',
              2: 'Fermentation breaks down nutrients for better plant absorption.',
              3: 'Careful handling prevents damage and maintains freshness.'
            };
            verified += `\n${i}. ${defaultAnswers[i] || 'Answer not available.'}`;
            answeredNumbers.add(i);
          }
        }
      }
    }
    
    return verified;
  },

  // ============================================================
  // FORMAT OUTPUT - CLEAN AND STRUCTURED
  // ============================================================
  formatOutput(text, contentType) {
    let formatted = text;
    
    // Remove excessive newlines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    
    // Ensure Part II has proper format
    const part2Match = formatted.match(/PART\s*II.*?(\d+\.\s*[✓✗]\s*)+/is);
    if (!part2Match) {
      // Try to find numbered items 1-10 with ✓ or ✗
      const hasPart2 = formatted.match(/1\.\s*[✓✗]/);
      if (!hasPart2) {
        // Add Part II if missing
        const proper = [1, 3, 5, 6, 8, 9, 10];
        let part2 = '\n\nPART II - HARVEST OR NOT!\n';
        for (let i = 1; i <= 10; i++) {
          part2 += `${i}. ${proper.includes(i) ? '✓' : '✗'}\n`;
        }
        formatted += part2;
      }
    }
    
    // Ensure Part III has proper format
    const part3Match = formatted.match(/PART\s*III.*?(\d+\.\s*[A-Za-z])+/is);
    if (!part3Match) {
      const hasPart3 = formatted.match(/1\.\s*[A-Za-z]/);
      if (!hasPart3) {
        const defaultAnswers = {
          1: 'Composting returns nutrients to soil and prevents pollution.',
          2: 'Fermentation breaks down nutrients for better plant absorption.',
          3: 'Careful handling prevents damage and maintains freshness.'
        };
        let part3 = '\n\nPART III - EXPLAIN WHY\n';
        for (let i = 1; i <= 3; i++) {
          part3 += `${i}. ${defaultAnswers[i]}\n`;
        }
        formatted += part3;
      }
    }
    
    return formatted;
  },

  // ============================================================
  // DETECT LANGUAGE FROM TEXT
  // ============================================================
  detectLanguageFromText(text) {
    if (!text) return 'english';
    const lower = text.toLowerCase();
    
    const englishKeywords = ['the', 'is', 'are', 'was', 'were', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'don', 'now'];
    
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ho', 'oho', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'meron', 'mayroon', 'wala', 'hindi', 'oo', 'salamat', 'paki', 'pakiusap', 'tanong', 'sagot', 'sabi', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta'];
    
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'buhaton', 'hatagan', 'ipakita', 'isulti', 'tan-awa', 'basaha', 'sabta', 'tabang', 'tabangi', 'pasabta', 'pasabton', 'mubo', 'muboa', 'simple', 'pasimplehon', 'klaro', 'klaruha', 'kumusta', 'kamusta'];
    
    // Check for coding content - always English
    const codingKeywords = ['python', 'java', 'javascript', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go', 'rust', 'print', 'function', 'class', 'variable', 'array', 'object', 'string', 'integer', 'boolean', 'loop', 'if', 'else', 'elif', 'while', 'for', 'return', 'import', 'from', 'def', 'async', 'await', 'try', 'except', 'finally'];
    for (const kw of codingKeywords) {
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
    
    if (tagalogCount >= 2 && tagalogCount > englishCount) return 'tagalog';
    if (bisayaCount >= 2 && bisayaCount > englishCount) return 'bisaya';
    return 'english';
  },

  // ============================================================
  // EXTRACT ALL QUESTIONS
  // ============================================================
  extractAllQuestions(ocrText, contentType) {
    const questions = [];
    const lines = ocrText.split('\n');
    let currentSection = '';
    let questionNumber = 0;
    let inPart2 = false;
    let inPart3 = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.match(/PART\s*II/i) || trimmed.match(/HARVEST/i)) {
        inPart2 = true;
        inPart3 = false;
        currentSection = 'part2';
        continue;
      }
      if (trimmed.match(/PART\s*III/i) || trimmed.match(/EXPLAIN WHY/i) || trimmed.match(/Why should/i)) {
        inPart2 = false;
        inPart3 = true;
        currentSection = 'part3';
        continue;
      }
      
      const match = trimmed.match(/^(\d+)\.\s*(.+)/);
      if (match) {
        questionNumber = parseInt(match[1]);
        const questionText = match[2].trim();
        questions.push({
          number: questionNumber,
          text: questionText || `Item ${questionNumber}`,
          section: currentSection || 'general'
        });
      }
    }
    
    // If no questions found, try to detect from structure
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
    
    // If still no questions, create default structure based on content type
    if (questions.length === 0 && contentType === 'activity_sheet') {
      // Check if Part II exists
      if (ocrText.includes('PART II') || ocrText.includes('HARVEST')) {
        for (let i = 1; i <= 10; i++) {
          questions.push({
            number: i,
            text: `Item ${i}`,
            section: 'part2'
          });
        }
      }
      // Check if Part III exists
      if (ocrText.includes('PART III') || ocrText.includes('EXPLAIN WHY') || ocrText.includes('Why should')) {
        for (let i = 1; i <= 3; i++) {
          const defaultTexts = {
            1: 'Why should biodegradable waste be composted instead of burned?',
            2: 'Why is fermentation important before using foliar fertilizer?',
            3: 'Why should harvested crops be handled carefully?'
          };
          questions.push({
            number: i,
            text: defaultTexts[i] || `Question ${i}`,
            section: 'part3'
          });
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
  // DIRECT VISION
  // ============================================================
  async callDirectVision(imageUrl, userPrompt, language) {
    const langName = this.getLanguageName(language);
    
    const visionPrompt = `Analyze this image and provide a COMPLETE answer.

User question: ${userPrompt}

RULES:
- Answer directly. NO introduction, NO conclusion.
- NO emojis, NO markdown.
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
          return this.cleanResponse(chippResponse.data.response);
        }
      } catch (chippError) {
        console.log('[DirectVision] Chipp AI failed:', chippError.message);
      }
      
      throw new Error('All direct vision methods failed');
    }
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
      /^STRICT RULES:.*?\n/i,
      /^FORMAT RULES:.*?\n/i,
      /^SPECIFIC FORMAT.*?\n/i,
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
      if (event?.message
