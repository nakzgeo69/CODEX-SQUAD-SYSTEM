const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images with OCR and provide precise accurate answers',
  usage: 'Send an image and the bot will analyze it',
  version: '19.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 10,

  // ============================================================
  // MAIN EXECUTE
  // ============================================================
  async execute(senderId, args, token, event) {
    try {
      const imageUrl = await this.extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, { text: 'Please send an image or reply to an image.' }, token);
        return;
      }

      const userPrompt = args.join(' ').trim();
      const detectedLanguage = this.detectLanguage(userPrompt || '');
      
      // Step 1: Extract text from image using GET OCR
      const ocrText = await this.extractTextFromImage(imageUrl);
      
      // Step 2: Detect content type
      const contentType = this.detectContentType(ocrText, userPrompt);
      
      // Step 3: Extract all questions/items
      const questions = this.extractQuestions(ocrText, contentType);
      
      // Step 4: Build prompt with extracted text and questions
      const prompt = this.buildPromptWithOCR(ocrText, questions, userPrompt, contentType, detectedLanguage);
      
      // Step 5: Call Gemini with multiple attempts
      let cleanResponse = await this.callGeminiWithRetry(prompt, imageUrl);
      
      // Step 6: Verify all questions are answered
      cleanResponse = await this.verifyAndComplete(cleanResponse, questions, imageUrl);
      
      // Step 7: Final clean and send
      if (!cleanResponse || cleanResponse.length < 5) {
        await sendMessage(senderId, { text: 'Unable to analyze. Please try again with a clearer image.' }, token);
        return;
      }

      cleanResponse = cleanResponse.substring(0, 8000);
      const chunks = this.splitMessage(cleanResponse, 1900);
      
      for (const chunk of chunks) {
        await sendMessage(senderId, { text: chunk }, token);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
    } catch (error) {
      console.error('[gemini] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // OCR: EXTRACT TEXT FROM IMAGE using GET
  // ============================================================
  async extractTextFromImage(imageUrl) {
    try {
      console.log('[OCR] Extracting text from image using GET OCR...');
      
      const apiKey = 'K85096363488957';
      
      // GET request - lahat nasa URL
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
  // DETECT CONTENT TYPE
  // ============================================================
  detectContentType(ocrText, userPrompt) {
    const combined = (ocrText + ' ' + userPrompt).toLowerCase();
    
    if (combined.includes('part i') || combined.includes('sequence') || combined.includes('arrange')) {
      return 'activity_sheet';
    }
    if (combined.includes('part ii') || combined.includes('harvest') || combined.includes('proper') || combined.includes('improper')) {
      return 'activity_sheet';
    }
    if (combined.includes('part iii') || combined.includes('explain why') || combined.includes('why should')) {
      return 'activity_sheet';
    }
    if (combined.includes('solve') || combined.includes('equation') || combined.includes('x =') || combined.includes('compute')) {
      return 'math';
    }
    if (combined.includes('logic') || combined.includes('puzzle') || combined.includes('reasoning')) {
      return 'logic';
    }
    if (combined.includes('multiple choice') || combined.includes('mcq') || combined.includes('choose')) {
      return 'multiple_choice';
    }
    if (combined.includes('true or false') || combined.includes('true/false')) {
      return 'true_false';
    }
    if (combined.includes('fill in the blank') || combined.includes('blank')) {
      return 'fill_blank';
    }
    if (combined.includes('son') || combined.includes('sister') || combined.includes('family') || combined.includes('people')) {
      return 'logic';
    }
    if (combined.includes('tire') || combined.includes('judge wisely')) {
      return 'logic';
    }
    
    return 'general';
  },

  // ============================================================
  // EXTRACT QUESTIONS
  // ============================================================
  extractQuestions(ocrText, contentType) {
    const questions = [];
    const lines = ocrText.split('\n');
    
    if (contentType === 'activity_sheet') {
      let currentSection = '';
      let questionNumber = 0;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.toLowerCase().includes('part ii') || trimmed.toLowerCase().includes('harvest')) {
          currentSection = 'part2';
          continue;
        }
        if (trimmed.toLowerCase().includes('part iii') || trimmed.toLowerCase().includes('explain why')) {
          currentSection = 'part3';
          continue;
        }
        
        const numMatch = trimmed.match(/^(\d+)\./);
        if (numMatch) {
          questionNumber = parseInt(numMatch[1]);
          let questionText = trimmed.replace(/^\d+\.\s*/, '').trim();
          if (!questionText) {
            const nextIndex = lines.indexOf(line) + 1;
            if (nextIndex < lines.length) {
              questionText = lines[nextIndex].trim();
            }
          }
          questions.push({
            number: questionNumber,
            text: questionText || `Question ${questionNumber}`,
            section: currentSection || 'part1',
            answered: false,
            answer: ''
          });
        }
      }
      
      if (questions.length === 0) {
        if (ocrText.includes('PART II')) {
          for (let i = 1; i <= 10; i++) {
            questions.push({
              number: i,
              text: `Item ${i}`,
              section: 'part2',
              answered: false,
              answer: ''
            });
          }
        }
        if (ocrText.includes('PART III')) {
          for (let i = 1; i <= 3; i++) {
            questions.push({
              number: i,
              text: `Question ${i}`,
              section: 'part3',
              answered: false,
              answer: ''
            });
          }
        }
      }
    } else if (contentType === 'math') {
      const mathMatch = ocrText.match(/[0-9+\-*/=()x^]+/g);
      if (mathMatch) {
        questions.push({
          number: 1,
          text: ocrText,
          section: 'math',
          answered: false,
          answer: ''
        });
      }
    } else {
      const numMatches = ocrText.match(/(\d+)\.\s*([^\n]+)/g);
      if (numMatches) {
        for (const match of numMatches) {
          const parts = match.match(/(\d+)\.\s*(.+)/);
          if (parts) {
            questions.push({
              number: parseInt(parts[1]),
              text: parts[2].trim(),
              section: 'general',
              answered: false,
              answer: ''
            });
          }
        }
      }
    }
    
    return questions;
  },

  // ============================================================
  // BUILD PROMPT WITH OCR TEXT
  // ============================================================
  buildPromptWithOCR(ocrText, questions, userPrompt, contentType, language) {
    const langName = this.getLanguageName(language);
    
    let prompt = `You are a precise AI assistant. You MUST answer EVERY question below.

EXTRACTED TEXT FROM IMAGE:
${ocrText}

QUESTIONS TO ANSWER:
${questions.map(q => `${q.number}. ${q.text}`).join('\n')}

RULES:
- Answer EVERY numbered question above.
- NO BLANKS. Every number must have an answer.
- Start directly with answers. NO introduction.
- NO emojis, NO markdown, NO extra text.

FORMAT:
`;
    
    if (contentType === 'activity_sheet') {
      prompt += `
- For Part II (numbers 1-10): Each gets ✓ or ✗ only.
- For Part III (numbers 1-3): Each gets 1-2 sentences only.
- For sequencing: Numbers in order only.
`;
    } else if (contentType === 'math') {
      prompt += `
- Show each step as "Step X:"
- End with "Final Answer: [number]"
`;
    } else if (contentType === 'logic') {
      prompt += `
- Show each reasoning step as "Step X:"
- End with "Final Answer: [number]"
- For family counting: Include father, mother, and all children.
`;
    } else {
      prompt += `
- Direct answers only.
- 1-2 sentences maximum.
`;
    }
    
    prompt += `
${userPrompt ? `Additional question: ${userPrompt}` : ''}

LANGUAGE: ${langName.toUpperCase()}

NOW ANSWER ALL QUESTIONS ABOVE. NO BLANKS.`;
    
    return prompt;
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
            return this.formatResponse(result);
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
  // VERIFY AND COMPLETE ANSWERS
  // ============================================================
  async verifyAndComplete(response, questions, imageUrl) {
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
      
      const missingPrompt = `Answer these specific questions ONLY (no introduction, no extra text):
${missingQuestions.map(q => `${q.number}. ${q.text}`).join('\n')}

Rules:
- Answer each number directly.
- For true/false: use ✓ or ✗.
- For explanation: 1-2 sentences.
- No emojis, no markdown.`;

      try {
        const missingAnswers = await this.callGeminiWithRetry(missingPrompt, imageUrl);
        verified += '\n\n' + missingAnswers;
      } catch (e) {
        console.log('[Verify] Failed to get missing answers:', e.message);
        for (const q of missingQuestions) {
          verified += `\n${q.number}. [Answer not provided]`;
        }
      }
    }
    
    return verified;
  },

  // ============================================================
  // FORMAT RESPONSE
  // ============================================================
  formatResponse(response) {
    let formatted = response || '';

    const introPatterns = [
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
      /^EXTRACTED TEXT FROM IMAGE:.*?\n/i,
      /^QUESTIONS TO ANSWER:.*?\n/i,
      /^RULES:.*?\n/i,
      /^FORMAT:.*?\n/i,
      /^NOW ANSWER ALL QUESTIONS.*?\n/i,
      /^You are a precise AI.*?\n/i,
      /^LANGUAGE:.*?\n/i,
      /^Additional question:.*?\n/i
    ];

    for (const pattern of introPatterns) {
      formatted = formatted.replace(pattern, '');
    }

    formatted = formatted
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

    formatted = formatted
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

    if (this.isMathOrLogic(formatted) && !formatted.toLowerCase().includes('final answer')) {
      const lines = formatted.split('\n');
      const lastLine = lines[lines.length - 1] || '';
      if (lastLine && !lastLine.toLowerCase().includes('answer')) {
        const lastNumber = this.extractLastNumber(lastLine);
        if (lastNumber) {
          formatted += '\n\nFinal Answer: ' + lastNumber;
        }
      }
    }

    return formatted;
  },

  // ============================================================
  // DETECT LANGUAGE
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
  isMathOrLogic(text) {
    const keywords = ['x =', 'solve', 'equation', 'step', 'compute', 'calculate', 'formula', 'sum', 'difference', 'product', 'quotient', 'equals', 'plus', 'minus', 'times', 'divided', 'logic', 'puzzle', 'reasoning', 'therefore', 'hence', 'thus'];
    const textLower = text.toLowerCase();
    return keywords.some(kw => textLower.includes(kw));
  },

  extractLastNumber(text) {
    const numbers = text.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      return numbers[numbers.length - 1];
    }
    return null;
  },

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
