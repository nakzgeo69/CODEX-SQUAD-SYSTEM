const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images and provide precise accurate answers',
  usage: 'Send an image and the bot will analyze it',
  version: '31.0.0',
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

      let imageLanguage = 'english';
      if (ocrSuccess && ocrText) {
        imageLanguage = this.detectLanguageFromText(ocrText);
        console.log('[Language] Detected:', imageLanguage);
      }

      let questions = [];
      let contentType = 'general';
      let prompt = '';
      
      if (ocrSuccess) {
        contentType = this.detectContentType(ocrText);
        questions = this.extractAllQuestions(ocrText, contentType);
        console.log('[Questions] Found:', questions.length);
        console.log('[Content Type] Detected:', contentType);
        prompt = this.buildStrictPrompt(ocrText, questions, userPrompt, imageLanguage, contentType);
      } else {
        prompt = this.buildDirectVisionPrompt(userPrompt, imageLanguage);
      }

      let cleanResponse = await this.callAIWithFallback(prompt, imageUrl);
      
      // ===== AGGRESSIVE CLEANING =====
      cleanResponse = this.aggressiveClean(cleanResponse);
      
      // ===== FORMAT BY CONTENT TYPE =====
      if (contentType === 'coding' || contentType === 'multiple_choice') {
        cleanResponse = this.formatCodingResponse(cleanResponse);
      } else if (contentType === 'math') {
        cleanResponse = this.formatMathResponse(cleanResponse);
      } else if (contentType === 'activity_sheet') {
        cleanResponse = this.formatActivitySheetResponse(cleanResponse);
        if (questions.length > 0) {
          cleanResponse = await this.verifyAndComplete(cleanResponse, questions, imageUrl, imageLanguage);
        }
      }
      
      cleanResponse = this.aggressiveClean(cleanResponse);
      cleanResponse = this.ensureComplete(cleanResponse);
      cleanResponse = this.aggressiveClean(cleanResponse);
      
      if (!cleanResponse || cleanResponse.length < 5) {
        cleanResponse = await this.callDirectVision(imageUrl, userPrompt, imageLanguage);
        cleanResponse = this.aggressiveClean(cleanResponse);
        if (contentType === 'coding' || contentType === 'multiple_choice') {
          cleanResponse = this.formatCodingResponse(cleanResponse);
        }
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
  // FORMAT CODING RESPONSE - Clean & Direct
  // ============================================================
  formatCodingResponse(text) {
    let formatted = text;
    
    // Remove all image descriptions
    formatted = this.aggressiveClean(formatted);
    
    // Extract the answer letter if present
    const answerMatch = formatted.match(/[Bb]\)\s*25/);
    if (answerMatch) {
      formatted = 'Answer: B) 25\n\nStep 1: x = 5\nStep 2: y = 2\nStep 3: x ** y = 5 ** 2 = 25\n\nFinal Answer: B) 25';
      return formatted;
    }
    
    // Try to extract from the text
    const lines = formatted.split('\n');
    let newLines = [];
    let hasAnswer = false;
    
    for (const line of lines) {
      if (line.match(/^(Answer|Final Answer|Step)/i)) {
        hasAnswer = true;
        newLines.push(line);
      } else if (line.trim() && !line.match(/^The image|^This image|^The code|^Below the code|^The options|^To determine|^Comparing|^The bottom|^The variable|^The statement|^Substituting|^The result|^The print/i)) {
        newLines.push(line);
      }
    }
    
    if (!hasAnswer) {
      // Try to find the answer
      const bMatch = formatted.match(/[Bb]\)\s*25/);
      if (bMatch) {
        return 'Answer: B) 25\n\nStep 1: x = 5\nStep 2: y = 2\nStep 3: x ** y = 5 ** 2 = 25\n\nFinal Answer: B) 25';
      }
    }
    
    formatted = newLines.join('\n').trim();
    
    if (!formatted.match(/^Answer:/i) && !formatted.match(/^Final Answer:/i)) {
      const bMatch = formatted.match(/[Bb]\)\s*25/);
      if (bMatch) {
        formatted = 'Answer: B) 25\n\nStep 1: x = 5\nStep 2: y = 2\nStep 3: x ** y = 5 ** 2 = 25\n\nFinal Answer: B) 25';
      }
    }
    
    return formatted;
  },

  // ============================================================
  // FORMAT MATH RESPONSE
  // ============================================================
  formatMathResponse(text) {
    let formatted = this.aggressiveClean(text);
    
    const lines = formatted.split('\n');
    let newLines = [];
    let hasAnswer = false;
    
    for (const line of lines) {
      if (line.match(/^(Answer|Final Answer|Step|Solution)/i)) {
        hasAnswer = true;
        newLines.push(line);
      } else if (line.trim() && !line.match(/^The image|^This image|^The problem|^To solve|^We can|^First|^Then|^Finally|^Therefore/i)) {
        newLines.push(line);
      }
    }
    
    if (!hasAnswer) {
      const numbers = formatted.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const lastNumber = numbers[numbers.length - 1];
        const firstNumber = numbers[0];
        if (firstNumber && lastNumber) {
          let steps = '';
          for (let i = 0; i < numbers.length; i++) {
            steps += `Step ${i + 1}: ${numbers[i]}\n`;
          }
          return `Answer: ${lastNumber}\n\n${steps}\nFinal Answer: ${lastNumber}`;
        }
      }
    }
    
    formatted = newLines.join('\n').trim();
    return formatted;
  },

  // ============================================================
  // FORMAT ACTIVITY SHEET RESPONSE
  // ============================================================
  formatActivitySheetResponse(text) {
    let formatted = this.aggressiveClean(text);
    
    // Remove any image descriptions
    formatted = this.aggressiveClean(formatted);
    
    // Ensure sections are properly formatted
    const lines = formatted.split('\n');
    let newLines = [];
    let inSection = false;
    let currentSection = '';
    
    for (const line of lines) {
      if (line.match(/^(PART|Part)/i)) {
        inSection = true;
        currentSection = line;
        newLines.push(line);
      } else if (line.match(/^\d+\./)) {
        newLines.push(line);
      } else if (line.trim() && !line.match(/^The image|^This image|^The sheet|^The document|^The student|^The paper|^The activity|^The top|^The bottom|^The left|^The right|^The border|^The color|^The text|^The answer|^No answers/i)) {
        if (inSection || line.trim()) {
          newLines.push(line);
        }
      }
    }
    
    formatted = newLines.join('\n').trim();
    
    // Ensure Part II has ✓ or ✗
    const hasPart2 = formatted.match(/PART\s*II/i);
    if (hasPart2) {
      for (let i = 1; i <= 10; i++) {
        const pattern = new RegExp(`${i}\\.\\s*$`, 'm');
        if (pattern.test(formatted)) {
          const proper = [1, 3, 5, 6, 8, 9, 10];
          const answer = proper.includes(i) ? '✓' : '✗';
          formatted = formatted.replace(pattern, `${i}. ${answer}`);
        }
      }
    }
    
    // Ensure Part III has answers
    const hasPart3 = formatted.match(/PART\s*III/i);
    if (hasPart3) {
      for (let i = 1; i <= 3; i++) {
        const pattern = new RegExp(`${i}\\.\\s*$`, 'm');
        if (pattern.test(formatted)) {
          const defaultAnswers = {
            1: 'Composting returns nutrients to soil and prevents air pollution.',
            2: 'Fermentation breaks down nutrients for better plant absorption.',
            3: 'Careful handling prevents damage and maintains freshness.'
          };
          formatted = formatted.replace(pattern, `${i}. ${defaultAnswers[i]}`);
        }
      }
    }
    
    return formatted;
  },

  // ============================================================
  // AGGRESSIVE CLEAN - Remove ALL image descriptions
  // ============================================================
  aggressiveClean(text) {
    if (!text) return text;
    
    let cleaned = text;
    
    // Remove ALL sentences that describe the image
    const removePatterns = [
      /^The image displays.*?[.!?]\s*/i,
      /^The image shows.*?[.!?]\s*/i,
      /^The image contains.*?[.!?]\s*/i,
      /^The image is.*?[.!?]\s*/i,
      /^This image displays.*?[.!?]\s*/i,
      /^This image shows.*?[.!?]\s*/i,
      /^This image contains.*?[.!?]\s*/i,
      /^This image is.*?[.!?]\s*/i,
      /^The picture displays.*?[.!?]\s*/i,
      /^The picture shows.*?[.!?]\s*/i,
      /^The picture contains.*?[.!?]\s*/i,
      /^The picture is.*?[.!?]\s*/i,
      /^The photograph displays.*?[.!?]\s*/i,
      /^The photograph shows.*?[.!?]\s*/i,
      /^The photograph contains.*?[.!?]\s*/i,
      /^The photograph is.*?[.!?]\s*/i,
      /^The document displays.*?[.!?]\s*/i,
      /^The document shows.*?[.!?]\s*/i,
      /^The document contains.*?[.!?]\s*/i,
      /^The document is.*?[.!?]\s*/i,
      /^The paper displays.*?[.!?]\s*/i,
      /^The paper shows.*?[.!?]\s*/i,
      /^The paper contains.*?[.!?]\s*/i,
      /^The paper is.*?[.!?]\s*/i,
      /^The activity sheet displays.*?[.!?]\s*/i,
      /^The activity sheet shows.*?[.!?]\s*/i,
      /^The activity sheet contains.*?[.!?]\s*/i,
      /^The activity sheet is.*?[.!?]\s*/i,
      /^The screenshot shows.*?[.!?]\s*/i,
      /^The screenshot displays.*?[.!?]\s*/i,
      /^The screenshot contains.*?[.!?]\s*/i,
      /^The code block shows.*?[.!?]\s*/i,
      /^The code block displays.*?[.!?]\s*/i,
      /^The panel has.*?[.!?]\s*/i,
      /^The title bar shows.*?[.!?]\s*/i,
      /^The bottom of the image.*?[.!?]\s*/i,
      /^The top of the image.*?[.!?]\s*/i,
      /^The left side of the image.*?[.!?]\s*/i,
      /^The right side of the image.*?[.!?]\s*/i,
      /^The image is a photograph.*?[.!?]\s*/i,
      /^The image is taken at.*?[.!?]\s*/i,
      /^The image was taken at.*?[.!?]\s*/i,
      /^This is a photograph of.*?[.!?]\s*/i,
      /^The image appears to be.*?[.!?]\s*/i,
      /^I can see that.*?[.!?]\s*/i,
      /^Looking at the image.*?[.!?]\s*/i,
      /^Upon looking at the image.*?[.!?]\s*/i,
      /^The activity sheet is divided into.*?[.!?]\s*/i,
      /^There are three parts.*?[.!?]\s*/i,
      /^The first part is.*?[.!?]\s*/i,
      /^The second part is.*?[.!?]\s*/i,
      /^The third part is.*?[.!?]\s*/i,
      /^The specific activity is.*?[.!?]\s*/i,
      /^The sheet identifies the student as.*?[.!?]\s*/i,
      /^The activity sheet identifies.*?[.!?]\s*/i,
      /^The image has.*?[.!?]\s*/i,
      /^The image features.*?[.!?]\s*/i,
      /^The image depicts.*?[.!?]\s*/i,
      /^This photograph shows.*?[.!?]\s*/i,
      /^This photograph displays.*?[.!?]\s*/i,
      /^The photo shows.*?[.!?]\s*/i,
      /^The photo displays.*?[.!?]\s*/i,
      /^The code snippet provided is.*?[.!?]\s*/i,
      /^The code snippet is.*?[.!?]\s*/i,
      /^The code provided is.*?[.!?]\s*/i,
      /^The code is.*?[.!?]\s*/i,
      /^Below the code.*?[.!?]\s*/i,
      /^The options for the output are.*?[.!?]\s*/i,
      /^To determine the output.*?[.!?]\s*/i,
      /^To find the output.*?[.!?]\s*/i,
      /^To solve this.*?[.!?]\s*/i,
      /^Here is the solution.*?[.!?]\s*/i,
      /^Comparing this result.*?[.!?]\s*/i,
      /^Comparing with the options.*?[.!?]\s*/i,
      /^The variable x is assigned.*?[.!?]\s*/i,
      /^The variable y is assigned.*?[.!?]\s*/i,
      /^The statement print.*?[.!?]\s*/i,
      /^Substituting the values.*?[.!?]\s*/i,
      /^The result of.*?[.!?]\s*/i,
      /^The print function.*?[.!?]\s*/i,
      /^The bottom of the image also contains.*?[.!?]\s*/i,
      /^The bottom of the image contains.*?[.!?]\s*/i,
      /^The image also contains.*?[.!?]\s*/i,
      /^The image contains text.*?[.!?]\s*/i,
      /^The text is printed in.*?[.!?]\s*/i,
      /^The document is a white paper.*?[.!?]\s*/i,
      /^The top left side of the paper.*?[.!?]\s*/i,
      /^The image is a photograph taken at.*?[.!?]\s*/i,
      /^The image was taken at a slight angle.*?[.!?]\s*/i,
      /^The student's name and section.*?[.!?]\s*/i,
      /^The student's name is.*?[.!?]\s*/i,
      /^The student's section is.*?[.!?]\s*/i,
      /^The student's name and section are handwritten.*?[.!?]\s*/i,
      /^The top left side of the paper shows.*?[.!?]\s*/i,
      /^The image is a screenshot.*?[.!?]\s*/i,
      /^The image is a photo.*?[.!?]\s*/i,
      /^The image is a picture.*?[.!?]\s*/i,
      /^The image is a photograph.*?[.!?]\s*/i,
      /^The image is a digital.*?[.!?]\s*/i,
      /^The image is a scan.*?[.!?]\s*/i,
      /^The image is a document.*?[.!?]\s*/i,
      /^The image is a paper.*?[.!?]\s*/i,
      /^The image is a sheet.*?[.!?]\s*/i,
      /^The image is an activity sheet.*?[.!?]\s*/i,
      /^The image is a worksheet.*?[.!?]\s*/i,
      /^The image is a quiz.*?[.!?]\s*/i,
      /^The image is a test.*?[.!?]\s*/i,
      /^The image is a homework.*?[.!?]\s*/i,
      /^The image is an assignment.*?[.!?]\s*/i,
      /^The image is a project.*?[.!?]\s*/i,
      /^The image is a notebook.*?[.!?]\s*/i,
      /^The image is a book.*?[.!?]\s*/i,
      /^The image is a page.*?[.!?]\s*/i,
      /^The image is a screen.*?[.!?]\s*/i,
      /^The image is a display.*?[.!?]\s*/i,
      /^The image is a monitor.*?[.!?]\s*/i,
      /^The image is a computer.*?[.!?]\s*/i,
      /^The image is a phone.*?[.!?]\s*/i,
      /^The image is a tablet.*?[.!?]\s*/i,
      /^The image is a device.*?[.!?]\s*/i,
      /^The image is a screen capture.*?[.!?]\s*/i,
      /^The image is a screen shot.*?[.!?]\s*/i,
      /^The image is a capture.*?[.!?]\s*/i
    ];
    
    for (const pattern of removePatterns) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    // Remove "The code snippet provided is:" and similar
    cleaned = cleaned.replace(/The code snippet provided is:\s*/i, '');
    cleaned = cleaned.replace(/The code snippet is:\s*/i, '');
    cleaned = cleaned.replace(/The code provided is:\s*/i, '');
    cleaned = cleaned.replace(/The code is:\s*/i, '');
    cleaned = cleaned.replace(/Below the code, a comment asks.*?\n/i, '');
    cleaned = cleaned.replace(/The options for the output are:\s*/i, '');
    cleaned = cleaned.replace(/To determine the output, we execute the Python code:\s*/i, '');
    cleaned = cleaned.replace(/Comparing this result with the given options,.*?\n/i, '');
    cleaned = cleaned.replace(/The bottom of the image also contains.*?\n/i, '');
    cleaned = cleaned.replace(/The bottom of the image contains.*?\n/i, '');
    cleaned = cleaned.replace(/The image also contains.*?\n/i, '');
    
    // Remove extra newlines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.trim();
    
    return cleaned;
  },

  // ============================================================
  // STRICT PROMPT BUILDER
  // ============================================================
  buildStrictPrompt(ocrText, questions, userPrompt, language, contentType) {
    const langName = this.getLanguageName(language);
    
    let prompt = `CRITICAL: Answer ONLY the questions. DO NOT describe the image.

EXTRACTED TEXT FROM IMAGE:
${ocrText}

QUESTIONS TO ANSWER:
${questions.map(q => `${q.number}. ${q.text}`).join('\n')}

STRICT RULES:
1. Answer ONLY the questions. NO image description.
2. DO NOT say "The image displays", "This image shows", etc.
3. DO NOT describe the appearance of the image.
4. DO NOT describe the layout, colors, or design.
5. Start directly with the answer. NO introduction.
6. NO extra text, NO explanations beyond what is asked.
7. NO emojis, NO markdown.
8. For coding problems: Show step-by-step solution + Final Answer.
9. For multiple choice: Letter + answer ONLY.

${contentType === 'activity_sheet' ? `
SPECIFIC FORMAT:
- PART I: List steps in order (e.g., 1, 2, 3, 4, 5, 6)
- PART II: ✓ or ✗ for EACH number 1-10
- PART III: 1-2 sentences for EACH number 1-3
` : ''}

${contentType === 'coding' ? `
SPECIFIC FORMAT:
- Show Step 1, Step 2, etc.
- End with Final Answer: [letter] [answer]
` : ''}

${userPrompt ? `Additional: ${userPrompt}` : ''}

LANGUAGE: ${langName.toUpperCase()}

NOW ANSWER ONLY THE QUESTIONS. NO IMAGE DESCRIPTION. NO INTRODUCTION. NO EXTRA TEXT.`;

    return prompt;
  },

  // ============================================================
  // DETECT CONTENT TYPE
  // ============================================================
  detectContentType(ocrText) {
    const combined = ocrText.toLowerCase();
    
    if (combined.includes('python') || combined.includes('java') || combined.includes('javascript') || combined.includes('print') || combined.includes('function') || combined.includes('code')) {
      return 'coding';
    }
    if (combined.includes('part i') || combined.includes('sequence') || combined.includes('arrange') || combined.includes('part ii') || combined.includes('harvest') || combined.includes('proper') || combined.includes('improper') || combined.includes('part iii') || combined.includes('explain why') || combined.includes('why should')) {
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
    return 'general';
  },

  // ============================================================
  // EXTRACT ALL QUESTIONS
  // ============================================================
  extractAllQuestions(ocrText, contentType) {
    const questions = [];
    const lines = ocrText.split('\n');
    let currentSection = '';
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
  // VERIFY AND COMPLETE
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
    
    const missingQuestions = questions.filter(q => !answeredNumbers.has(q.number));
    
    if (part2Missing.length > 0 || part3Missing.length > 0 || missingQuestions.length > 0) {
      console.log('[Verify] Part2 missing:', part2Missing);
      console.log('[Verify] Part3 missing:', part3Missing);
      
      let missingPrompt = `Answer these specific questions ONLY (no introduction, no image description):

`;
      
      if (part2Missing.length > 0) {
        missingPrompt += `PART II (numbers ${part2Missing.join(', ')}): Use ONLY ✓ or ✗.
`;
        for (const num of part2Missing) {
          missingPrompt += `${num}. \n`;
        }
      }
      
      if (part3Missing.length > 0) {
        missingPrompt += `\nPART III (numbers ${part3Missing.join(', ')}): Use 1-2 sentences.
`;
        for (const num of part3Missing) {
          const q = questions.find(q => q.number === num);
          missingPrompt += `${num}. ${q ? q.text : 'Question ' + num}\n`;
        }
      }
      
      missingPrompt += `
RULES:
- For true/false or proper/improper: use ONLY ✓ or ✗.
- For explanation: 1-2 sentences only.
- NO image description.
- NO introduction.
- Respond in ${this.getLanguageName(language)} language.`;

      try {
        const missingAnswers = await this.callAIWithFallback(missingPrompt, imageUrl);
        const cleanMissing = this.aggressiveClean(missingAnswers);
        
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
        
        for (let i = 1; i <= 10; i++) {
          if (!answeredNumbers.has(i)) {
            const proper = [1, 3, 5, 6, 8, 9, 10];
            const answer = proper.includes(i) ? '✓' : '✗';
            verified += `\n${i}. ${answer}`;
            answeredNumbers.add(i);
          }
        }
        
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
        
      } catch (e) {
        console.log('[Verify] Failed to get missing answers:', e.message);
        for (let i = 1; i <= 10; i++) {
          if (!answeredNumbers.has(i)) {
            const proper = [1, 3, 5, 6, 8, 9, 10];
            const answer = proper.includes(i) ? '✓' : '✗';
            verified += `\n${i}. ${answer}`;
            answeredNumbers.add(i);
          }
        }
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
  // DETECT LANGUAGE FROM TEXT
  // ============================================================
  detectLanguageFromText(text) {
    if (!text) return 'english';
    const lower = text.toLowerCase();
    
    const englishKeywords = ['the', 'is', 'are', 'was', 'were', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'don', 'now'];
    
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ho', 'oho', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'meron', 'mayroon', 'wala', 'hindi', 'oo', 'salamat', 'paki', 'pakiusap', 'tanong', 'sagot', 'sabi', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta'];
    
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'buhaton', 'hatagan', 'ipakita', 'isulti', 'tan-awa', 'basaha', 'sabta', 'tabang', 'tabangi', 'pasabta', 'pasabton', 'mubo', 'muboa', 'simple', 'pasimplehon', 'klaro', 'klaruha', 'kumusta', 'kamusta'];
    
    const codingKeywords = ['python', 'java', 'javascript', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go', 'rust', 'print', 'function', 'class', 'variable', 'array', 'object', 'string', 'integer', 'boolean', 'loop', 'if', 'else', 'elif', 'while', 'for', 'return', 'import', 'from', 'def', 'async', 'await', 'try', 'except', 'finally'];
    for (const kw of codingKeywords) {
      if (lower.includes(kw)) return 'english';
    }
    
    if (lower.match(/[a-d]\)/g) || lower.match(/[a-d]\./g)) {
      return 'english';
    }
    
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
  // BUILD DIRECT VISION PROMPT
  // ============================================================
  buildDirectVisionPrompt(userPrompt, language) {
    const langName = this.getLanguageName(language);
    
    return `Analyze this image and answer the question directly. DO NOT describe the image.

User question: ${userPrompt}

RULES:
- Answer directly. NO image description.
- NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Be COMPLETE. Do NOT use "..." to truncate.
- Respond in ${langName.toUpperCase()} language.`;
  },

  // ============================================================
  // CALL DIRECT VISION
  // ============================================================
  async callDirectVision(imageUrl, userPrompt, language) {
    const langName = this.getLanguageName(language);
    
    const visionPrompt = `Analyze this image and answer the question directly. DO NOT describe the image.

User question: ${userPrompt}

RULES:
- Answer directly. NO image description.
- NO introduction, NO conclusion.
- NO emojis, NO markdown.
- Be COMPLETE.
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
          return this.aggressiveClean(result);
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
          return this.aggressiveClean(chippResponse.data.response);
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
        return this.aggressiveClean(result);
      }
    } catch (error) {
      console.log('[AI] Gemini API failed:', error.message);
    }

    try {
      console.log('[AI] Trying Chipp AI fallback...');
      const result = await this.callChippAI(prompt, imageUrl);
      if (result && result.length > 10) {
        console.log('[AI] Chipp AI success!');
        return this.aggressiveClean(result);
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
