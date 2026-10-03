// ========== gemini.js - UNIVERSAL DYNAMIC SOLUTION PROVIDER v46.0.0 ==========
// + Word List Classification (Image) with OCR Cleaning
// + Diagram Interpretation for Math/Physics (Torque, Seesaw, Lever)
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Universal image analyzer with dynamic solution support',
  usage: 'Send an image and the bot will analyze it',
  version: '46.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 10,

  OCR_API_KEY: 'K81011572188957',
  MAX_CHUNK: 1900,
  NORCH_API: 'https://norch-project.gleeze.com/api/gemini',
  CHIPP_API: 'https://ceddsrestapi.vercel.app/ai/chipp',

  async execute(senderId, args, token, event) {
    try {
      const imageUrl = await this.extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, { text: 'Please send an image or reply to an image.' }, token);
        return;
      }

      const userPrompt = args.join(' ').trim() || 'Analyze this image and answer all questions';
      const detectedLanguage = this.detectLanguage(userPrompt || '');

      // ===== STEP 1: OCR =====
      let ocrText = '';
      let ocrSuccess = false;

      try {
        ocrText = await this.extractTextFromImage(imageUrl);
        if (ocrText && ocrText.length > 10) {
          ocrSuccess = true;
          console.log('[OCR] Success! Length:', ocrText.length);
        }
      } catch (error) {
        console.log('[OCR] Error:', error.message);
      }

      // ===== STEP 2: Language =====
      let imageLanguage = 'english';
      if (ocrSuccess && ocrText) {
        imageLanguage = this.detectLanguageFromText(ocrText);
      } else {
        imageLanguage = detectedLanguage || 'english';
      }

      // ===== STEP 3: Content type =====
      let questions = [];
      let contentType = 'general';
      let prompt = '';

      // Force word_list if user explicitly asks
      let forceType = null;
      if (/categorize|classify|classification|i-group|i-category|word\s*list/i.test(userPrompt)) {
        forceType = 'word_list';
        console.log('[Force] word_list activated by user prompt');
      }

      // Extra safety: kung ang OCR ay puro maikling salita
      if (!forceType && ocrSuccess && ocrText) {
        const detectLines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 1);
        const detectShort = detectLines.filter(l => {
          const w = l.split(/\s+/);
          return w.length >= 1 && w.length <= 4 && /^[A-Za-z][a-zA-Z\s\-'\.]+$/.test(l) && !/[?\!]/.test(l);
        });
        const detectAllWords = ocrText.split(/[\s,\n:]+/).filter(w => w.length > 1 && /^[A-Za-z]/.test(w));

        console.log('[Detection] Lines:', detectLines.length, '| Short:', detectShort.length, '| All words:', detectAllWords.length);

        if (detectShort.length >= 8 && detectShort.length / Math.max(detectLines.length, 1) > 0.35) {
          forceType = 'word_list';
          console.log('[Force] word_list activated by short lines');
        }

        if (!forceType && detectAllWords.length >= 25 && detectLines.length >= 15) {
          forceType = 'word_list';
          console.log('[Force] word_list activated by word count');
        }
      }

      if (ocrSuccess) {
        contentType = this.detectContentType(ocrText);
        questions = this.extractAllQuestions(ocrText, contentType);
        console.log('[Content] Type:', contentType, '| Questions:', questions.length);

        const effectiveType = forceType || contentType;

        switch (effectiveType) {
          case 'guidelines':
            prompt = this.buildGuidelinesPrompt(ocrText, userPrompt, imageLanguage);
            break;
          case 'activity_sheet':
            prompt = this.buildActivitySheetPrompt(ocrText, userPrompt, imageLanguage);
            break;
          case 'math_problem':
            prompt = this.buildMathPrompt(ocrText, userPrompt, imageLanguage);
            break;
          case 'science_problem':
            prompt = this.buildSciencePrompt(ocrText, userPrompt, imageLanguage);
            break;
          case 'coding_problem':
            prompt = this.buildCodingPrompt(ocrText, userPrompt, imageLanguage);
            break;
          case 'logic_puzzle':
            prompt = this.buildLogicPrompt(ocrText, userPrompt, imageLanguage);
            break;
          case 'multiple_choice':
            prompt = this.buildMultipleChoicePrompt(ocrText, userPrompt, imageLanguage);
            break;
          case 'case_study':
            prompt = this.buildCaseStudyPrompt(ocrText, userPrompt, imageLanguage);
            break;
          case 'word_list':
            prompt = this.buildWordListPrompt(ocrText, userPrompt, imageLanguage);
            break;
          default:
            prompt = this.buildUniversalPrompt(ocrText, questions, userPrompt, imageLanguage, contentType);
        }
      } else {
        prompt = this.buildDirectVisionPrompt(userPrompt, imageLanguage);
      }

      // ===== STEP 4: Call AI =====
      let cleanResponse = await this.callAIWithViceVersa(prompt, imageUrl);
      cleanResponse = this.cleanResponse(cleanResponse);

      // ===== STEP 5: Verify =====
      if (contentType === 'activity_sheet' || contentType === 'guidelines') {
        cleanResponse = this.formatDetailedResponse(cleanResponse);
      } else if (questions.length > 0 && contentType !== 'guidelines') {
        cleanResponse = await this.verifyAndComplete(cleanResponse, questions, imageUrl, imageLanguage, contentType);
      }

      // ===== STEP 6: Final cleanup =====
      cleanResponse = this.removePartIndicators(cleanResponse);
      cleanResponse = this.finalCleanup(cleanResponse);

      if (!cleanResponse || cleanResponse.length < 5) {
        cleanResponse = await this.callDirectVision(imageUrl, userPrompt, imageLanguage);
        cleanResponse = this.finalCleanup(cleanResponse);
      }

      if (!cleanResponse || cleanResponse.length < 5) {
        await sendMessage(senderId, { text: 'Unable to analyze. Please try again with a clearer image.' }, token);
        return;
      }

      await this.sendContinuous(senderId, cleanResponse, token);

    } catch (error) {
      console.error('[gemini] Error:', error.message);
      await sendMessage(senderId, { text: 'Error analyzing image. Please try again.' }, token);
    }
  },

  // ============================================================
  // DETECT CONTENT TYPE
  // ============================================================
  detectContentType(ocrText) {
    const lower = ocrText.toLowerCase();

    if (/lesson title|instructional objective|steps in making|guidelines|procedure|how to|steps to|process of|directions: read each part/i.test(lower)) {
      return 'guidelines';
    }

    if (/activity sheet|worksheet|answer the following|part i|part ii|part iii|test i|test ii/i.test(lower)) {
      return 'activity_sheet';
    }

    // MATH + PHYSICS (idagdag ang torque/seesaw/lever keywords)
    if (/solve for|find x|equation|calculate|compute|simplify|evaluate|derivative|integral|geometry|trigonometry|torque|seesaw|lever|force|weight|balance|pivot|moment/i.test(lower)) {
      return 'math_problem';
    }

    if (/photosynthesis|cell|dna|chemical reaction|balance|molecule|atom|physics|biology|chemistry|explain the process/i.test(lower)) {
      return 'science_problem';
    }

    if (/python|java|javascript|print\(|function|code|output|algorithm|program/i.test(lower)) {
      return 'coding_problem';
    }

    if (/logic|puzzle|riddle|reasoning|sons|sister|family|tire|judge wisely|who is/i.test(lower)) {
      return 'logic_puzzle';
    }

    if (/[a-d]\)/i.test(ocrText) || /[a-d]\.\s/i.test(ocrText) || /multiple choice|choose the|select the/i.test(lower)) {
      return 'multiple_choice';
    }

    if (/case study|scenario|situation|analyze the|read the case/i.test(lower)) {
      return 'case_study';
    }

    // ===== WORD LIST (Walang directions) =====
    const lines = ocrText.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const shortLines = lines.filter(l => {
      const words = l.split(/\s+/);
      return words.length >= 1 && words.length <= 4 && /^[A-Za-z][a-zA-Z\s\-'\.]+$/.test(l) && !/[?\!]/.test(l);
    });

    const allWords = ocrText.split(/[\s,\n:]+/).filter(w => w.length > 1 && /^[A-Za-z]/.test(w));

    if (shortLines.length >= 8 && shortLines.length / Math.max(lines.length, 1) > 0.35) {
      return 'word_list';
    }

    if (allWords.length >= 25 && lines.length >= 15) {
      return 'word_list';
    }

    if (/categorize|classify|classification|i-group|i-category|word\s*list|vocabulary|terminology/i.test(lower)) {
      return 'word_list';
    }

    return 'general';
  },

  // ============================================================
  // BUILD WORD LIST PROMPT (FIXED — with OCR cleaning)
  // ============================================================
  buildWordListPrompt(ocrText, userPrompt, language) {
    const langName = this.getLanguageName(language);

    let text = ocrText;
    if (text.length > 4000) text = text.substring(0, 4000);

    // LINISIN ang OCR text — alisin ang "Column 1:" at "Column 2:" labels
    text = text.replace(/Column\s*\d+\s*:?/gi, '').replace(/\n{3,}/g, '\n\n').trim();

    let prompt = `CRITICAL INSTRUCTION: You are a TAXONOMY and CLASSIFICATION EXPERT.\n`;
    prompt += `The image contains a WORD LIST. There are NO instructions.\n`;
    prompt += `You MUST REORGANIZE the words into LETTERED categories.\n`;
    prompt += `IGNORE any "Column 1" or "Column 2" labels in the OCR text.\n`;
    prompt += `DO NOT keep the "Column 1 / Column 2" structure.\n\n`;
    prompt += `WORDS FROM IMAGE:\n${text}\n\n`;
    prompt += `MANDATORY OUTPUT STRUCTURE:\n`;
    prompt += `Start with "Answer:" then LETTERED CATEGORIES (A, B, C, D, E, F...).\n`;
    prompt += `Each letter used EXACTLY ONCE. NO duplicates.\n`;
    prompt += `ONE WORD PER LINE, numbered (1, 2, 3...).\n`;
    prompt += `DO NOT group multiple words in one sentence.\n`;
    prompt += `Add a SHORT definition (5-15 words) for EACH word.\n\n`;
    prompt += `EXAMPLE OF CORRECT OUTPUT:\n`;
    prompt += `Answer:\n`;
    prompt += `A. Reproductive Processes\n`;
    prompt += `1. Parturition - The process of giving birth in animals\n`;
    prompt += `2. Calving - Parturition specifically in cattle\n`;
    prompt += `3. Farrowing - Parturition specifically in pigs\n\n`;
    prompt += `B. Animal Classification - Cattle\n`;
    prompt += `1. Bull - Adult intact male cattle\n`;
    prompt += `2. Cow - Adult female cattle\n\n`;
    prompt += `STRICT RULES:\n`;
    prompt += `1. NEVER use "Column 1", "Column 2", or any column labels in the output.\n`;
    prompt += `2. DO NOT output a plain list.\n`;
    prompt += `3. DO NOT group multiple words in one line.\n`;
    prompt += `4. Every single word must be placed in EXACTLY ONE category.\n`;
    prompt += `5. Every word must have a short definition.\n`;
    prompt += `6. Use at least 6 categories.\n`;
    prompt += `7. Use SEQUENTIAL letters WITHOUT duplicates: A, B, C, D, E, F, G, H, I, J...\n`;
    prompt += `8. If a category has NO words, SKIP IT entirely.\n`;
    prompt += `9. Use the SAME LANGUAGE as the input words.\n`;
    prompt += `10. If a word looks like a TYPO, use the CORRECT spelling (e.g., "truck" -> "buck").\n\n`;
    prompt += `LANGUAGE: ${langName.toUpperCase()}\n`;
    prompt += `NO LaTeX, NO markdown, NO emojis.\n\n`;
    prompt += `NOW OUTPUT THE CLASSIFIED LIST. START WITH "Answer:".\n\n`;
    prompt += `FINAL REMINDER: DO NOT use "Column 1" or "Column 2". DO NOT group words. USE LETTERED CATEGORIES A, B, C, D... ONE WORD PER LINE.`;

    return prompt;
  },

  buildGuidelinesPrompt(ocrText, userPrompt, language) {
    const langName = this.getLanguageName(language);

    let text = ocrText;
    if (text.length > 4000) text = text.substring(0, 4000);

    let prompt = `CRITICAL INSTRUCTION: DO NOT COPY THE TEXT FROM THE IMAGE.\n\n`;
    prompt += `The image contains GUIDELINES or INSTRUCTIONS.\n\n`;
    prompt += `GUIDELINES FROM IMAGE:\n${text}\n\n`;
    prompt += `YOUR TASK:\n`;
    prompt += `APPLY the guidelines by creating a COMPLETE SAMPLE OUTPUT.\n`;
    prompt += `DO NOT just copy or summarize the guidelines.\n`;
    prompt += `Instead, CREATE a sample output following the steps.\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- The TOPIC must come from the IMAGE itself.\n`;
    prompt += `- If the image already provides a sample topic, use it.\n`;
    prompt += `- If no sample topic is given, CREATE a realistic topic related to the guidelines.\n`;
    prompt += `- Apply EACH step in the guidelines to that topic.\n`;
    prompt += `- Provide SPECIFIC examples for each step.\n`;
    prompt += `- Show the COMPLETE output for each step.\n`;
    prompt += `- End with a Final Answer summary.\n\n`;
    prompt += `FORMAT:\n`;
    prompt += `Answer:\n`;
    prompt += `Based on the guidelines, here is a complete sample output.\n\n`;
    prompt += `TITLE:\n[Title from the image or related to the guidelines]\n\n`;
    prompt += `TOPIC:\n[Topic from the image, or created based on the guidelines]\n\n`;
    prompt += `OBJECTIVES:\n[Objectives from the image, or created based on the guidelines]\n\n`;
    prompt += `Then apply each step:\n`;
    prompt += `STEP 1: [Title from guidelines]\n[Applied output + specific example]\n\n`;
    prompt += `STEP 2: [Title from guidelines]\n[Applied output + specific example]\n\n`;
    prompt += `STEP 3: [Title from guidelines]\n[Applied output + specific example]\n\n`;
    prompt += `STEP 4: [Title from guidelines]\n[Applied output + specific example]\n\n`;
    prompt += `STEP 5: [Title from guidelines]\n[Applied output + specific example]\n\n`;
    prompt += `(Continue for all steps in the image)\n\n`;
    prompt += `Final Answer:\n[Summary of what was created]\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- DO NOT copy the text from the image\n`;
    prompt += `- APPLY the guidelines instead\n`;
    prompt += `- Use the SAME topics, steps, and structure from the image\n`;
    prompt += `- If the image has no topic, CREATE a relevant one\n`;
    prompt += `- Provide SPECIFIC examples\n`;
    prompt += `- Use plain text only\n`;
    prompt += `- NO LaTeX, NO markdown, NO emojis\n`;
    prompt += `- Respond in ${langName.toUpperCase()} language\n\n`;
    prompt += `NOW APPLY THE GUIDELINES AND CREATE A SAMPLE OUTPUT.`;

    return prompt;
  },

  buildActivitySheetPrompt(ocrText, userPrompt, language) {
    const langName = this.getLanguageName(language);

    let text = ocrText;
    if (text.length > 4000) text = text.substring(0, 4000);

    let prompt = `You are analyzing an ACTIVITY SHEET or WORKSHEET.\n\n`;
    prompt += `ACTIVITY SHEET CONTENT:\n${text}\n\n`;
    prompt += `TASK:\n`;
    prompt += `Answer ALL questions and complete ALL items.\n\n`;
    prompt += `REQUIREMENTS:\n`;
    prompt += `1. Read the instructions carefully.\n`;
    prompt += `2. Answer ALL items or parts completely.\n`;
    prompt += `3. Provide SPECIFIC examples where applicable.\n`;
    prompt += `4. Organize answers by Part (Part I, Part II, etc.).\n`;
    prompt += `5. Include examples for each item.\n`;
    prompt += `6. End with a Final Answer summary.\n\n`;
    prompt += `FORMAT:\n`;
    prompt += `Answer:\n`;
    prompt += `[Direct answer to the activity sheet]\n\n`;
    prompt += `For each part:\n`;
    prompt += `Part X: [Part Title]\n`;
    prompt += `1. [Item]\n`;
    prompt += `   Answer: [Direct answer]\n`;
    prompt += `   Example: [Specific example]\n`;
    prompt += `...\n\n`;
    prompt += `Final Answer:\n[Summary]\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- Be ACCURATE and THOROUGH\n`;
    prompt += `- Include ALL items\n`;
    prompt += `- Provide SPECIFIC examples\n`;
    prompt += `- Use plain text only\n`;
    prompt += `- NO LaTeX, NO markdown, NO emojis\n`;
    prompt += `- Respond in ${langName.toUpperCase()} language\n\n`;
    prompt += `NOW ANSWER ALL PARTS. NO BLANKS.`;

    return prompt;
  },

  // ============================================================
  // BUILD MATH PROMPT (FIXED — with Diagram Interpretation)
  // ============================================================
  buildMathPrompt(ocrText, userPrompt, language) {
    const langName = this.getLanguageName(language);

    let prompt = `You are a MATH and PHYSICS EXPERT. Analyze the problem from the image carefully.\n\n`;
    prompt += `PROBLEM FROM IMAGE:\n${ocrText}\n\n`;
    prompt += `USER REQUEST: ${userPrompt || 'Solve this problem'}\n\n`;
    prompt += `TASK:\n`;
    prompt += `Solve the problem step-by-step.\n\n`;
    prompt += `CRITICAL: DIAGRAM INTERPRETATION RULES\n`;
    prompt += `1. READ THE DIAGRAM CAREFULLY. Do NOT guess.\n`;
    prompt += `2. For TORQUE / SEESAW / LEVER problems:\n`;
    prompt += `   - Torque = Force × Distance from PIVOT (fulcrum center)\n`;
    prompt += `   - Distance is measured from the PIVOT (center of fulcrum) to the object.\n`;
    prompt += `   - DO NOT use the WIDTH of the fulcrum as the distance.\n`;
    prompt += `   - If two distances are shown on each side (e.g., "5 m" outer and "2 m" inner), use the OUTER distance (from pivot to object).\n`;
    prompt += `   - The "2 m" in the middle is likely the WIDTH of the fulcrum base — NOT the distance.\n`;
    prompt += `3. Compare TORQUE on each side. The side with HIGHER torque goes DOWN.\n`;
    prompt += `4. VERIFY your answer before finalizing.\n\n`;
    prompt += `REQUIREMENTS:\n`;
    prompt += `1. Identify what is given and what is asked.\n`;
    prompt += `2. State the formula or concept needed.\n`;
    prompt += `3. Show ALL steps clearly.\n`;
    prompt += `4. Use "Step X:" for each step.\n`;
    prompt += `5. Include the equation for each step.\n`;
    prompt += `6. VERIFY the answer before finalizing.\n`;
    prompt += `7. End with "Final Answer:"\n`;
    prompt += `8. If multiple choice, provide the letter.\n\n`;
    prompt += `FORMAT:\n`;
    prompt += `Answer:\n[Direct answer if known]\n\n`;
    prompt += `GIVEN:\n[Given values]\n\n`;
    prompt += `DIAGRAM INTERPRETATION:\n[What the diagram shows]\n\n`;
    prompt += `FORMULA:\n[Formula used]\n\n`;
    prompt += `SOLUTION:\n`;
    prompt += `Step 1: [Description]\nEquation: [calculation]\n\n`;
    prompt += `Step 2: [Description]\nEquation: [calculation]\n\n`;
    prompt += `...\n\n`;
    prompt += `VERIFICATION:\n[Check if answer makes sense]\n\n`;
    prompt += `Final Answer:\n[Final answer with units]\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- Be ACCURATE\n`;
    prompt += `- Show ALL steps\n`;
    prompt += `- READ the diagram carefully\n`;
    prompt += `- Use plain text for equations\n`;
    prompt += `- NO LaTeX symbols\n`;
    prompt += `- Respond in ${langName.toUpperCase()} language\n\n`;
    prompt += `NOW SOLVE THE PROBLEM.`;

    return prompt;
  },

  // ============================================================
  // BUILD SCIENCE PROMPT (FIXED — with Diagram Rule)
  // ============================================================
  buildSciencePrompt(ocrText, userPrompt, language) {
    const langName = this.getLanguageName(language);

    let prompt = `You are a SCIENCE EXPERT. Analyze the following.\n\n`;
    prompt += `SCIENCE CONTENT FROM IMAGE:\n${ocrText}\n\n`;
    prompt += `TASK:\n`;
    prompt += `Explain the science concept and provide the full process.\n\n`;
    prompt += `CRITICAL: DIAGRAM INTERPRETATION\n`;
    prompt += `- READ the diagram carefully. Do NOT guess.\n`;
    prompt += `- For FORCE / TORQUE / LEVER / SEESAW: Torque = Force × Distance from PIVOT.\n`;
    prompt += `- Distance is measured from the PIVOT (center of fulcrum).\n`;
    prompt += `- Do NOT use the WIDTH of the fulcrum as distance.\n\n`;
    prompt += `REQUIREMENTS:\n`;
    prompt += `1. Start with a clear definition.\n`;
    prompt += `2. Give the FULL PROCESS with numbered steps.\n`;
    prompt += `3. For each step, include description, example, and equation.\n`;
    prompt += `4. Use CAPITAL LETTERS for stage names.\n`;
    prompt += `5. Include the overall equation.\n`;
    prompt += `6. End with "Final Answer:"\n\n`;
    prompt += `FORMAT:\n`;
    prompt += `Answer:\n[Definition]\n\n`;
    prompt += `FULL PROCESS:\n`;
    prompt += `1. STAGE NAME\nLocation: [where]\nPurpose: [what]\n`;
    prompt += `Steps:\n`;
    prompt += `a. Step Name\nDescription: [what happens]\nExample: [example]\nEquation: [equation]\n\n`;
    prompt += `OVERALL EQUATION:\n[equation]\n\n`;
    prompt += `Final Answer:\n[summary]\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- Be ACCURATE and DETAILED\n`;
    prompt += `- Include examples\n`;
    prompt += `- Use plain text\n`;
    prompt += `- NO LaTeX symbols\n`;
    prompt += `- Respond in ${langName.toUpperCase()} language\n\n`;
    prompt += `NOW EXPLAIN THE SCIENCE CONCEPT.`;

    return prompt;
  },

  buildCodingPrompt(ocrText, userPrompt, language) {
    const langName = this.getLanguageName(language);

    let prompt = `You are a CODING EXPERT. Analyze the following code problem.\n\n`;
    prompt += `CODE FROM IMAGE:\n${ocrText}\n\n`;
    prompt += `TASK:\n`;
    prompt += `Analyze the code and determine the output.\n\n`;
    prompt += `REQUIREMENTS:\n`;
    prompt += `1. Identify the programming language.\n`;
    prompt += `2. Explain what each line does.\n`;
    prompt += `3. Show the step-by-step execution.\n`;
    prompt += `4. Determine the correct output.\n`;
    prompt += `5. If multiple choice, provide the letter.\n`;
    prompt += `6. End with "Final Answer:"\n\n`;
    prompt += `FORMAT:\n`;
    prompt += `Answer:\n[Direct answer]\n\n`;
    prompt += `LANGUAGE:\n[Programming language]\n\n`;
    prompt += `ANALYSIS:\n`;
    prompt += `Step 1: [What the code does]\nOutput: [intermediate result]\n\n`;
    prompt += `Step 2: [What the code does]\nOutput: [intermediate result]\n\n`;
    prompt += `...\n\n`;
    prompt += `Final Answer:\n[letter] [answer]\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- Be ACCURATE\n`;
    prompt += `- Show ALL steps\n`;
    prompt += `- NO LaTeX symbols\n`;
    prompt += `- Respond in ${langName.toUpperCase()} language\n\n`;
    prompt += `NOW ANALYZE THE CODE.`;

    return prompt;
  },

  buildLogicPrompt(ocrText, userPrompt, language) {
    const langName = this.getLanguageName(language);

    let prompt = `You are a LOGIC EXPERT. Solve the following puzzle.\n\n`;
    prompt += `PUZZLE FROM IMAGE:\n${ocrText}\n\n`;
    prompt += `TASK:\n`;
    prompt += `Solve the logic puzzle step-by-step.\n\n`;
    prompt += `REQUIREMENTS:\n`;
    prompt += `1. Read the puzzle carefully.\n`;
    prompt += `2. Identify the logic pattern.\n`;
    prompt += `3. Show ALL reasoning steps.\n`;
    prompt += `4. Use "Step X:" for each step.\n`;
    prompt += `5. End with "Final Answer:"\n`;
    prompt += `6. For family problems: Include parents.\n\n`;
    prompt += `FORMAT:\n`;
    prompt += `Answer:\n[Direct answer]\n\n`;
    prompt += `REASONING:\n`;
    prompt += `Step 1: [Reasoning]\nResult: [result]\n\n`;
    prompt += `Step 2: [Reasoning]\nResult: [result]\n\n`;
    prompt += `...\n\n`;
    prompt += `Final Answer:\n[answer]\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- Be ACCURATE\n`;
    prompt += `- Show ALL reasoning\n`;
    prompt += `- Respond in ${langName.toUpperCase()} language\n\n`;
    prompt += `NOW SOLVE THE PUZZLE.`;

    return prompt;
  },

  buildMultipleChoicePrompt(ocrText, userPrompt, language) {
    const langName = this.getLanguageName(language);

    let prompt = `You are a QUIZ EXPERT. Answer the following multiple choice questions.\n\n`;
    prompt += `QUIZ FROM IMAGE:\n${ocrText}\n\n`;
    prompt += `TASK:\n`;
    prompt += `Answer ALL multiple choice questions.\n\n`;
    prompt += `REQUIREMENTS:\n`;
    prompt += `1. Read each question carefully.\n`;
    prompt += `2. Choose the BEST answer (A, B, C, D).\n`;
    prompt += `3. Write ONLY the letter and answer text.\n`;
    prompt += `4. Answer ALL questions. NO BLANKS.\n`;
    prompt += `5. End with "Final Answer: 1-X, 2-X..."\n\n`;
    prompt += `FORMAT:\n`;
    prompt += `Answer:\n`;
    prompt += `1. C) Answer text\n`;
    prompt += `2. B) Answer text\n`;
    prompt += `...\n\n`;
    prompt += `Final Answer:\n1-C, 2-B, ...\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- Answer ALL questions\n`;
    prompt += `- NO explanations unless asked\n`;
    prompt += `- Respond in ${langName.toUpperCase()} language\n\n`;
    prompt += `NOW ANSWER ALL QUESTIONS.`;

    return prompt;
  },

  buildCaseStudyPrompt(ocrText, userPrompt, language) {
    const langName = this.getLanguageName(language);

    let prompt = `You are an EXPERT ANALYST. Analyze the following case study.\n\n`;
    prompt += `CASE STUDY FROM IMAGE:\n${ocrText}\n\n`;
    prompt += `TASK:\n`;
    prompt += `Analyze the case study and provide a solution.\n\n`;
    prompt += `REQUIREMENTS:\n`;
    prompt += `1. Summarize the situation.\n`;
    prompt += `2. Identify the core issue.\n`;
    prompt += `3. Analyze the problem.\n`;
    prompt += `4. Provide a solution.\n`;
    prompt += `5. Give recommendations.\n`;
    prompt += `6. End with "Final Answer:"\n\n`;
    prompt += `FORMAT:\n`;
    prompt += `Answer:\n[Summary of the situation]\n\n`;
    prompt += `CORE ISSUE:\n[Main problem]\n\n`;
    prompt += `ANALYSIS:\n1. [Point]\n2. [Point]\n...\n\n`;
    prompt += `SOLUTION:\n1. [Solution]\n2. [Solution]\n...\n\n`;
    prompt += `Final Answer:\n[Summary]\n\n`;
    prompt += `IMPORTANT:\n`;
    prompt += `- Be ACCURATE and THOROUGH\n`;
    prompt += `- Provide SPECIFIC solutions\n`;
    prompt += `- Respond in ${langName.toUpperCase()} language\n\n`;
    prompt += `NOW ANALYZE THE CASE STUDY.`;

    return prompt;
  },

  // ============================================================
  // BUILD UNIVERSAL PROMPT (FIXED — with Diagram Rule)
  // ============================================================
  buildUniversalPrompt(ocrText, questions, userPrompt, language, contentType) {
    const langName = this.getLanguageName(language);

    let text = ocrText;
    if (text.length > 3000) text = text.substring(0, 3000);

    let prompt = `Answer EVERY question. Follow instructions EXACTLY.\n\n`;
    prompt += `TEXT FROM IMAGE:\n${text}\n\n`;
    prompt += `QUESTIONS (${questions.length} items):\n${questions.map(q => `${q.number}. ${q.text}`).join('\n')}\n\n`;
    prompt += `RULES:\n`;
    prompt += `1. Answer ALL questions. NO BLANKS.\n`;
    prompt += `1b. READ THE DIAGRAM CAREFULLY. Do NOT guess. For torque/seesaw: use distance from PIVOT (not fulcrum width).\n`;
    prompt += `2. NO introduction. Start with answers.\n`;
    prompt += `3. NO conclusion.\n`;
    prompt += `4. NO emojis, NO markdown, NO LaTeX.\n`;
    prompt += `5. For true/false: use check or X.\n`;
    prompt += `6. For multiple choice: letter + answer.\n`;
    prompt += `7. For explanation: 1-2 sentences.\n`;
    prompt += `8. Respond in ${langName.toUpperCase()}.\n\n`;
    prompt += `NOW ANSWER ALL QUESTIONS.`;

    return prompt;
  },

  buildDirectVisionPrompt(userPrompt, language) {
    const langName = this.getLanguageName(language);
    return `Analyze this image and answer ALL questions.\n\nUser question: ${userPrompt}\n\nRULES:\n- Answer directly.\n- READ THE DIAGRAM CAREFULLY. For torque/seesaw: use distance from PIVOT (not fulcrum width).\n- Show step-by-step for math/coding.\n- For activity sheets: answer ALL items.\n- NO introduction, NO conclusion.\n- NO emojis, NO markdown.\n- Respond in ${langName.toUpperCase()}.`;
  },

  formatDetailedResponse(response) {
    let formatted = response;

    if (!formatted.match(/^(Answer|Sagot):/i)) {
      formatted = 'Answer:\n' + formatted;
    }

    if (!formatted.toLowerCase().includes('final answer') && formatted.length > 300) {
      const lastSentence = formatted.split(/(?<=[.!?])\s+/).pop();
      if (lastSentence && lastSentence.length < 300) {
        formatted += '\n\nFinal Answer:\n' + lastSentence;
      }
    }

    return formatted;
  },

  extractAllQuestions(ocrText, contentType) {
    const questions = [];
    const lines = ocrText.split('\n');
    let section = 'general';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.match(/PART\s*I\b/i) && !trimmed.match(/PART\s*II/i)) section = 'part1';
      else if (trimmed.match(/PART\s*II\b/i) && !trimmed.match(/PART\s*III/i)) section = 'part2';
      else if (trimmed.match(/PART\s*III/i)) section = 'part3';
      else if (trimmed.match(/^I\.\s+/i)) section = 'part1';

      const match = trimmed.match(/^(\d+)\.\s*(.+)/);
      if (match) {
        const num = parseInt(match[1]);
        const txt = match[2].trim();
        if (txt.length > 0) {
          questions.push({ number: num, text: txt, section: section });
        }
      }
    }

    return questions;
  },

  async verifyAndComplete(response, questions, imageUrl, language, contentType) {
    let verified = response;
    const lines = verified.split('\n');
    const answeredNumbers = new Set();

    for (const line of lines) {
      const match = line.match(/^(\d+)\.\s*/);
      if (match) answeredNumbers.add(parseInt(match[1]));
    }

    const missing = questions.filter(q => !answeredNumbers.has(q.number));

    if (missing.length > 0) {
      console.log('[Verify] Missing answers:', missing.map(q => q.number).join(', '));

      const langName = this.getLanguageName(language);

      const missingPrompt = `Answer these specific questions ONLY:\n\n${missing.map(q => `${q.number}. ${q.text}`).join('\n')}\n\nRULES:\n- Answer each number directly.\n- NO extra text.\n- Respond in ${langName.toUpperCase()}.`;

      try {
        const missingAnswers = await this.callAIWithViceVersa(missingPrompt, imageUrl);
        const cleanMissing = this.cleanResponse(missingAnswers);
        if (cleanMissing && cleanMissing.length > 5) {
          verified += '\n' + cleanMissing;
        }
      } catch (e) {
        console.log('[Verify] Failed:', e.message);
      }
    }

    return verified;
  },

  async callAIWithViceVersa(prompt, imageUrl) {
    try {
      console.log('[ViceVersa] Trying Norch...');
      const norchResult = await this.callNorchAPI(prompt, imageUrl);
      if (norchResult && norchResult.length > 10) {
        console.log('[ViceVersa] Norch success!');
        return this.cleanResponse(norchResult);
      }
    } catch (norchError) {
      console.log('[ViceVersa] Norch failed:', norchError.message);
    }

    try {
      console.log('[ViceVersa] Trying Chipp...');
      const chippResult = await this.callChippAPI(prompt, imageUrl);
      if (chippResult && chippResult.length > 10) {
        console.log('[ViceVersa] Chipp success!');
        return this.cleanResponse(chippResult);
      }
    } catch (chippError) {
      console.log('[ViceVersa] Chipp failed:', chippError.message);
    }

    throw new Error('All AI services failed');
  },

  async callNorchAPI(prompt, imageUrl) {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        let finalPrompt = prompt;
        if (finalPrompt.length > 4000) finalPrompt = finalPrompt.substring(0, 4000);

        const url = `${this.NORCH_API}?prompt=${encodeURIComponent(finalPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
        const response = await axios.get(url, { timeout: 90000, headers: { 'Accept': 'application/json' } });

        if (response.data?.response || response.data?.message) {
          return response.data.response || response.data.message;
        }
        throw new Error('Empty response');
      } catch (error) {
        if (attempts >= maxAttempts) throw error;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  },

  async callChippAPI(prompt, imageUrl) {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        let finalPrompt = prompt;
        if (finalPrompt.length > 4000) finalPrompt = finalPrompt.substring(0, 4000);

        const url = `${this.CHIPP_API}?message=${encodeURIComponent(finalPrompt)}&url=${encodeURIComponent(imageUrl)}`;
        const response = await axios.get(url, { timeout: 90000, headers: { 'Accept': 'application/json' } });

        if (response.data?.status === true && response.data?.response) {
          return response.data.response;
        }
        throw new Error('Empty response');
      } catch (error) {
        if (attempts >= maxAttempts) throw error;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  },

  async callDirectVision(imageUrl, userPrompt, language) {
    const langName = this.getLanguageName(language);

    const visionPrompt = `Analyze this image and answer ALL questions.\n\nUser question: ${userPrompt}\n\nRULES:\n- Answer directly.\n- READ THE DIAGRAM CAREFULLY. For torque/seesaw: use distance from PIVOT (not fulcrum width).\n- Show step-by-step for math/coding.\n- For activity sheets: answer ALL items.\n- NO introduction, NO conclusion.\n- Respond in ${langName.toUpperCase()}.`;

    try {
      const url = `${this.NORCH_API}?prompt=${encodeURIComponent(visionPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(url, { timeout: 90000 });
      if (response.data?.response || response.data?.message) {
        return this.cleanResponse(response.data.response || response.data.message);
      }
    } catch (e) {}

    try {
      const chippUrl = `${this.CHIPP_API}?message=${encodeURIComponent(visionPrompt)}&url=${encodeURIComponent(imageUrl)}`;
      const chippResponse = await axios.get(chippUrl, { timeout: 90000 });
      if (chippResponse.data?.status === true && chippResponse.data?.response) {
        return this.cleanResponse(chippResponse.data.response);
      }
    } catch (e) {}

    throw new Error('Direct vision failed');
  },

  detectLanguageFromText(text) {
    if (!text) return 'english';
    const lower = text.toLowerCase();

    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'ni', 'para', 'dahil', 'kasi', 'kaya', 'ako', 'ikaw', 'siya', 'gusto', 'pwede', 'hindi', 'oo'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kini', 'unsa', 'ngano', 'asa', 'gusto', 'pwede', 'dili', 'salamat'];

    const codingKeywords = ['python', 'java', 'javascript', 'print', 'function', 'class'];
    const mathKeywords = ['solve', 'equation', 'formula', 'calculate'];

    for (const kw of codingKeywords) if (lower.includes(kw)) return 'english';
    for (const kw of mathKeywords) if (lower.includes(kw)) return 'english';

    let tagCount = 0, bisCount = 0;
    const words = lower.split(/\s+/);
    for (const word of words) {
      if (tagalogKeywords.includes(word)) tagCount++;
      if (bisayaKeywords.includes(word)) bisCount++;
    }

    if (tagCount >= 3 && tagCount > bisCount) return 'tagalog';
    if (bisCount >= 3 && bisCount > tagCount) return 'bisaya';
    return 'english';
  },

  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'ni', 'para', 'dahil', 'ako', 'ikaw', 'siya', 'gusto', 'pwede', 'hindi'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kini', 'unsa', 'ngano', 'asa', 'gusto', 'pwede', 'dili'];
    let tagCount = 0, bisCount = 0;
    const words = lower.split(/\s+/);
    for (const word of words) {
      if (tagalogKeywords.includes(word)) tagCount++;
      if (bisayaKeywords.includes(word)) bisCount++;
    }
    if (tagCount >= 2 && tagCount >= bisCount) return 'tagalog';
    if (bisCount >= 2 && bisCount > tagCount) return 'bisaya';
    return 'english';
  },

  getLanguageName(code) {
    const names = { 'english': 'English', 'tagalog': 'Tagalog', 'bisaya': 'Bisaya' };
    return names[code] || 'English';
  },

  async extractTextFromImage(imageUrl) {
    try {
      const url = `https://api.ocr.space/parse/imageurl?apikey=${this.OCR_API_KEY}&url=${encodeURIComponent(imageUrl)}&language=eng,tgl&isOverlayRequired=false&OCREngine=2&scale=true&isTable=true`;
      const response = await axios.get(url, { timeout: 60000, headers: { 'Accept': 'application/json' } });
      if (response.data.IsErroredOnProcessing) return '';
      return response.data?.ParsedResults?.[0]?.ParsedText || '';
    } catch (error) {
      return '';
    }
  },

  cleanResponse(text) {
    if (!text) return 'No response.';
    let cleaned = text.trim();

    cleaned = cleaned.replace(/\\\[/g, '');
    cleaned = cleaned.replace(/\\\]/g, '');
    cleaned = cleaned.replace(/\\\(/g, '');
    cleaned = cleaned.replace(/\\\)/g, '');
    cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
    cleaned = cleaned.replace(/\\rightarrow/g, '->');
    cleaned = cleaned.replace(/\\times/g, 'x');
    cleaned = cleaned.replace(/\\cdot/g, '*');
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');
    cleaned = cleaned.replace(/\$\$/g, '');
    cleaned = cleaned.replace(/\$/g, '');

    cleaned = cleaned.replace(/₂/g, '2');
    cleaned = cleaned.replace(/₃/g, '3');
    cleaned = cleaned.replace(/₄/g, '4');
    cleaned = cleaned.replace(/₅/g, '5');
    cleaned = cleaned.replace(/₆/g, '6');
    cleaned = cleaned.replace(/₇/g, '7');
    cleaned = cleaned.replace(/₈/g, '8');
    cleaned = cleaned.replace(/₉/g, '9');
    cleaned = cleaned.replace(/₀/g, '0');
    cleaned = cleaned.replace(/₁/g, '1');

    cleaned = cleaned.replace(/²/g, '^2');
    cleaned = cleaned.replace(/³/g, '^3');
    cleaned = cleaned.replace(/⁴/g, '^4');
    cleaned = cleaned.replace(/⁵/g, '^5');

    cleaned = cleaned.replace(/ν/g, 'v');
    cleaned = cleaned.replace(/α/g, 'alpha');
    cleaned = cleaned.replace(/β/g, 'beta');
    cleaned = cleaned.replace(/γ/g, 'gamma');

    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');
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
    cleaned = cleaned.replace(/[\u{1FA00}-\u{1FAFF}]/gu, '');
    cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');
    cleaned = cleaned.replace(/[\u{24C2}-\u{1F251}]/gu, '');

    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/ +\n/g, '\n');
    cleaned = cleaned.replace(/\n +/g, '\n');

    return cleaned.trim() || 'No response.';
  },

  finalCleanup(response) {
    if (!response) return '';
    let cleaned = response;
    cleaned = cleaned.replace(/^(Answer|Sagot|ANSWER):\s*/gim, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    if (cleaned && !cleaned.match(/^(Answer|Sagot|ANSWER):/i)) {
      cleaned = 'Answer: ' + cleaned;
    }
    return cleaned;
  },

  removePartIndicators(text) {
    if (!text) return text;
    return text.replace(/\[Part\s*\d+\/\d+\]\s*/gi, '');
  },

  async sendContinuous(senderId, text, token) {
    if (!text) return;

    if (text.length <= this.MAX_CHUNK) {
      await sendMessage(senderId, { text: text }, token);
      return;
    }

    const chunks = this.splitIntelligently(text);

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];
      if (!chunk) continue;

      if (i > 0) {
        chunk = chunk.replace(/^(Answer|Sagot):\s*/i, '');
        chunk = `[continue ${i + 1}/${chunks.length}]\n\n${chunk}`;
      } else if (chunks.length > 1) {
        chunk = `${chunk}\n\n[Part 1/${chunks.length}]`;
      }

      try {
        await sendMessage(senderId, { text: chunk }, token);
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
      } catch (error) {
        console.error('[Continuous] Error:', error.message);
      }
    }
  },

  splitIntelligently(text) {
    if (!text) return [];
    if (text.length <= this.MAX_CHUNK) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= this.MAX_CHUNK) {
        chunks.push(remaining);
        break;
      }

      let chunk = remaining.substring(0, this.MAX_CHUNK);
      const breakPoints = ['\n\n', '. ', '! ', '? ', '\n', '; ', ', ', '.', ' '];

      let bestIndex = -1;
      for (const bp of breakPoints) {
        const idx = chunk.lastIndexOf(bp);
        if (idx > this.MAX_CHUNK * 0.3) { bestIndex = idx + bp.length; break; }
      }

      if (bestIndex === -1) bestIndex = this.MAX_CHUNK;

      chunks.push(remaining.substring(0, bestIndex).trim());
      remaining = remaining.substring(bestIndex).trim();
    }

    return chunks;
  },

  async extractImageUrl(event, token) {
    try {
      if (event?._scanImageUrl) return event._scanImageUrl;
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
      console.error('[Replied Image] Failed:', err.message);
      return null;
    }
  }
};
