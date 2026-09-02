const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images and follow instructions exactly',
  usage: 'Send an image and the bot will analyze it',
  version: '21.0.0',
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

      const userPrompt = args.join(' ').trim();
      const detectedLanguage = this.detectLanguage(userPrompt || '');
      
      // Step 1: Extract text from image
      const ocrText = await this.extractTextFromImage(imageUrl);
      
      // Step 2: Extract instructions from image
      const instructions = this.extractInstructions(ocrText);
      
      // Step 3: Extract questions
      const questions = this.extractQuestions(ocrText);
      
      // Step 4: Build prompt that follows image instructions
      const prompt = this.buildFollowInstructionsPrompt(ocrText, instructions, questions, userPrompt, detectedLanguage);
      
      // Step 5: Call Gemini
      let cleanResponse = await this.callGeminiWithRetry(prompt, imageUrl);
      
      // Step 6: Clean and format
      cleanResponse = this.cleanResponse(cleanResponse);
      
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
  // EXTRACT INSTRUCTIONS FROM IMAGE
  // ============================================================
  extractInstructions(ocrText) {
    const instructions = [];
    const lines = ocrText.split('\n');
    
    let currentInstruction = '';
    let inInstruction = false;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Look for instruction keywords
      if (trimmed.match(/^(Directions|Instructions|Write|Arrange|Answer|Fill|Choose|Match|Identify|Explain|Define|List|Enumerate|Solve|Compute|Calculate|Show|Prove|Describe|Discuss|Compare|Contrast|Analyze|Evaluate|Summarize)/i)) {
        inInstruction = true;
        currentInstruction = trimmed;
      } else if (inInstruction && trimmed.length > 0 && !trimmed.match(/^\d+\./)) {
        currentInstruction += ' ' + trimmed;
      } else if (inInstruction && trimmed.match(/^\d+\./)) {
        // End of instruction, next is question
        if (currentInstruction) {
          instructions.push(currentInstruction);
          currentInstruction = '';
        }
        inInstruction = false;
      }
    }
    
    if (currentInstruction) {
      instructions.push(currentInstruction);
    }
    
    return instructions;
  },

  // ============================================================
  // EXTRACT QUESTIONS
  // ============================================================
  extractQuestions(ocrText) {
    const questions = [];
    const lines = ocrText.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)\.\s*(.+)/);
      if (match) {
        questions.push({
          number: parseInt(match[1]),
          text: match[2].trim()
        });
      }
    }
    
    return questions;
  },

  // ============================================================
  // BUILD PROMPT - FOLLOW IMAGE INSTRUCTIONS
  // ============================================================
  buildFollowInstructionsPrompt(ocrText, instructions, questions, userPrompt, language) {
    const langName = this.getLanguageName(language);
    
    let prompt = `CRITICAL: You MUST follow the instructions EXACTLY as they appear in the image.

INSTRUCTIONS FROM IMAGE:
${instructions.join('\n')}

QUESTIONS FROM IMAGE:
${questions.map(q => `${q.number}. ${q.text}`).join('\n')}

RULES:
1. FOLLOW the instructions from the image EXACTLY.
2. Answer ONLY what is asked.
3. Use the EXACT format specified in the instructions.
4. NO extra text, NO explanations beyond what is asked.
5. NO introduction, NO conclusion.
6. NO emojis, NO markdown.
7. If instructions say "write ✓ or ✗" - use ONLY ✓ or ✗.
8. If instructions say "arrange in order" - write ONLY the numbers.
9. If instructions say "answer in 1-2 sentences" - use ONLY 1-2 sentences.
10. If instructions say "explain why" - give ONLY the explanation.

WHAT THE INSTRUCTIONS ASK FOR:
${this.determineRequiredFormat(instructions)}

${userPrompt ? `Additional: ${userPrompt}` : ''}

LANGUAGE: ${langName.toUpperCase()}

NOW FOLLOW THE INSTRUCTIONS EXACTLY. NO EXTRA TEXT.`;

    return prompt;
  },

  // ============================================================
  // DETERMINE REQUIRED FORMAT FROM INSTRUCTIONS
  // ============================================================
  determineRequiredFormat(instructions) {
    const allText = instructions.join(' ').toLowerCase();
    
    if (allText.includes('write ✓') || allText.includes('write check') || allText.includes('proper') || allText.includes('improper')) {
      return '✓ or ✗ only';
    }
    if (allText.includes('arrange') || allText.includes('sequence') || allText.includes('order')) {
      return 'Numbers in order only (e.g., 1, 2, 3, 4)';
    }
    if (allText.includes('multiple choice') || allText.includes('choose')) {
      return 'Letter and answer only (e.g., A. Answer)';
    }
    if (allText.includes('solve') || allText.includes('compute') || allText.includes('calculate')) {
      return 'Step-by-step solution + Final Answer';
    }
    if (allText.includes('explain') || allText.includes('why')) {
      return '1-2 sentences only';
    }
    if (allText.includes('fill in the blank')) {
      return 'Direct answer only';
    }
    if (allText.includes('true') || allText.includes('false')) {
      return '✓ or ✗ only';
    }
    
    return 'Direct answers only';
  },

  // ============================================================
  // OCR: EXTRACT TEXT FROM IMAGE using GET
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
            return this.cleanResponse(result);
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

    // Remove all introductions and extra text
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
      /^INSTRUCTIONS FROM IMAGE:.*?\n/i,
      /^QUESTIONS FROM IMAGE:.*?\n/i,
      /^RULES:.*?\n/i,
      /^WHAT THE INSTRUCTIONS ASK FOR:.*?\n/i,
      /^LANGUAGE:.*?\n/i,
      /^Additional:.*?\n/i,
      /^NOW FOLLOW THE INSTRUCTIONS.*?\n/i,
      /^You are a precise AI.*?\n/i
    ];

    for (const pattern of patterns) {
      cleaned = cleaned.replace(pattern, '');
    }

    // Remove markdown
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

    // Remove emojis
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

    // If math/logic and no Final Answer, add it
    if (this.isMathOrLogic(cleaned) && !cleaned.toLowerCase().includes('final answer')) {
      const lines = cleaned.split('\n');
      const lastLine = lines[lines.length - 1] || '';
      if (lastLine && !lastLine.toLowerCase().includes('answer')) {
        const lastNumber = this.extractLastNumber(lastLine);
        if (lastNumber) {
          cleaned += '\n\nFinal Answer: ' + lastNumber;
        }
      }
    }

    return cleaned;
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
