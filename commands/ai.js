// ========== ai.js - FINAL COMPLETE v61.0.0 ==========
// ALL SUBJECTS | ALL 60+ FUNCTIONS | Dynamic | No Hardcoded | Conversion Fix
// + Word List Classification with Deduplication & Empty-Skip
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

const GROQ_API_KEY = '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';
const CEREBRAS_API_KEY = 'csk-k3yc8j3tr9eh454t46xr48hh8v6tr3yj85rf9hhk3dnhmxrp';
const OVERCHAT_CLAUDE = 'https://ceddsrestapi.vercel.app/ai/overchat-claude';
const OVERCHAT_DEEPSEEK = 'https://ceddsrestapi.vercel.app/ai/overchat-deepseek';

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant - all subjects, all functions',
  usage: 'ai [question]',
  version: '61.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      const lowerPrompt = prompt.toLowerCase();
      const cleanPrompt = lowerPrompt.replace(/[.:!?,\s]+$/g, '').trim();

      // STEP 1: GREETINGS
      if (this.isGreetingOrConversational(prompt)) {
        const reply = this.buildConversationalReply(prompt);
        await sendMessage(senderId, { text: reply }, token);
        conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: reply, timestamp: Date.now() };
        return;
      }

      // STEP 2: UNIT CONVERSION (priority 1 — bago pa ang follow-up)
      const conversion = this.tryUnitConversion(prompt);
      if (conversion) {
        await this.sendComplete(senderId, conversion, token);
        conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: conversion, timestamp: Date.now() };
        return;
      }

      // STEP 3: FOLLOW-UP
      const isFollowUpCommand = this.isFollowUpCommand(cleanPrompt);
      let previousResponse = null;
      let previousPrompt = null;
      let isReply = false;

      if (event?.message?.reply_to?.mid) {
        isReply = true;
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        previousResponse = replyData.message;
      }

      if (!previousResponse && conversationHistory[senderId]) {
        const history = conversationHistory[senderId];
        if (history.lastResponse && Date.now() - history.timestamp < 30 * 60 * 1000) {
          previousResponse = history.lastResponse;
          previousPrompt = history.lastPrompt;
        }
      }

      if (isFollowUpCommand) {
        if (!previousResponse) {
          await sendMessage(senderId, { text: 'Walang previous response na ma-' + cleanPrompt + '.' }, token);
          return;
        }
        const action = this.getFollowUpAction(cleanPrompt);
        const followUpPrompt = this.buildFollowUpPrompt(action, previousResponse, prompt);
        const response = await this.callAIWithViceVersa(followUpPrompt, prompt, 'english', action);
        let cleaned = this.cleanOutput(response);
        cleaned = this.ensureComplete(cleaned);
        cleaned = this.removeDuplicates(cleaned);
        cleaned = this.organizeOutput(cleaned);
        conversationHistory[senderId] = { lastPrompt: previousPrompt || 'previous', lastResponse: cleaned, timestamp: Date.now() };
        this.cleanOldHistory();
        await this.sendComplete(senderId, cleaned, token);
        return;
      }

      // STEP 4: WORD LIST (synonyms/antonyms)
      if (this.isWordListQuestion(prompt)) {
        const wordAnswer = await this.handleWordList(senderId, prompt, token);
        if (wordAnswer) {
          await this.sendComplete(senderId, wordAnswer, token);
          conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: wordAnswer, timestamp: Date.now() };
          return;
        }
      }

      // STEP 5: WEIGHT
      if (this.shouldTriggerWeight(lowerPrompt, prompt)) {
        await this.handleWeightEstimation(senderId, prompt, token);
        return;
      }

      // STEP 6: REGULAR AI
      if (!prompt && !isReply) {
        await sendMessage(senderId, { text: 'Hello. I am Teacher Arlene.\n\nJust type: ai [your question]' }, token);
        return;
      }

      if (this.isOwnerQuestion(prompt)) {
        await sendMessage(senderId, { text: 'I was created by GeoDevz69. https://www.facebook.com/geotechph.net' }, token);
        return;
      }

      if (this.isUserInfoQuestion(prompt)) {
        await this.handleUserInfo(senderId, prompt, token);
        return;
      }

      // STEP 7: COMPREHEND INPUT
      const analysis = this.comprehendInput(prompt);
      console.log('[AI] Type:', analysis.type, '| Length:', prompt.length);

      // STEP 8: BUILD PROMPT
      const finalPrompt = this.buildStrictPrompt(prompt, analysis);

      // STEP 9: CALL API
      let aiResponse = await this.callAIWithViceVersa(finalPrompt, prompt, 'english', analysis.type);

      // STEP 10: CHECK REPEAT
      if (this.isRepeat(aiResponse, prompt)) {
        console.log('[AI] Repeat detected — retrying...');
        aiResponse = await this.callAIWithViceVersa(finalPrompt + '\n\nCRITICAL: Do NOT repeat the input. Give the ANSWER only.', prompt, 'english', analysis.type);
      }

      // STEP 11: CLEAN
      aiResponse = this.cleanOutput(aiResponse);
      aiResponse = this.removeDuplicates(aiResponse);
      aiResponse = this.organizeOutput(aiResponse);
      aiResponse = this.ensureComplete(aiResponse);

      conversationHistory[senderId] = { lastPrompt: prompt, lastResponse: aiResponse, timestamp: Date.now() };
      this.cleanOldHistory();

      await this.sendComplete(senderId, aiResponse, token);

    } catch (error) {
      console.error('[AI] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // CHECK IF REPEAT
  // ============================================================
  isRepeat(output, input) {
    if (!output || !input) return false;
    const out = output.toLowerCase().trim();
    const inp = input.toLowerCase().trim();
    if (out === inp) return true;
    const wordsOut = new Set(out.split(/\s+/));
    const wordsIn = new Set(inp.split(/\s+/));
    let common = 0;
    for (const w of wordsOut) if (wordsIn.has(w)) common++;
    const ratio = common / Math.max(wordsOut.size, wordsIn.size);
    return ratio > 0.8;
  },

  // ============================================================
  // BUILD STRICT PROMPT
  // ============================================================
  buildStrictPrompt(prompt, analysis) {
    let finalPrompt = '';

    finalPrompt += `=== USER'S INPUT ===\n${prompt}\n\n`;

    finalPrompt += `=== ABSOLUTE RULES ===\n`;
    finalPrompt += `1. Do NOT repeat the input question.\n`;
    finalPrompt += `2. Do NOT copy-paste the input.\n`;
    finalPrompt += `3. Do NOT add intro ("Here is...")\n`;
    finalPrompt += `4. Do NOT add outro ("Hope this helps")\n`;
    finalPrompt += `5. Do NOT add "Would you like..." or any follow-up.\n`;
    finalPrompt += `6. MIRROR the input format EXACTLY. If "1.", answer "1.". If "A.", answer "A.".\n`;
    finalPrompt += `7. Answer EVERY item. NO BLANKS.\n`;
    finalPrompt += `8. NO emojis, NO markdown, NO LaTeX.\n`;
    finalPrompt += `9. Respond in the SAME LANGUAGE as the input.\n\n`;

    // SEQUENCE
    if (analysis.type === 'sequence') {
      finalPrompt += `=== FOR SEQUENCE/ORDER QUESTIONS ===\n`;
      finalPrompt += `TASK: Arrange the steps in CORRECT ORDER.\n\n`;
      finalPrompt += `REASONING GUIDE:\n`;
      finalPrompt += `1. Read ALL steps carefully.\n`;
      finalPrompt += `2. Identify the FIRST step:\n`;
      finalPrompt += `   - Usually begins with "Gather", "Prepare", "Get", "Collect", "Choose"\n`;
      finalPrompt += `3. Identify the LAST step:\n`;
      finalPrompt += `   - Usually begins with "Wait", "Finish", "Complete", "Harvest", "Filter", "Use"\n`;
      finalPrompt += `4. For EACH step, ask: "What MUST happen BEFORE this step?"\n`;
      finalPrompt += `5. Arrange: Preparation → Main Action → Follow-up → Wait/Finish\n`;
      finalPrompt += `6. Verify: Each number 1-N used EXACTLY ONCE.\n\n`;
      finalPrompt += `OUTPUT FORMAT:\n`;
      finalPrompt += `- KEEP the ORIGINAL order of items\n`;
      finalPrompt += `- Write ONLY the correct number before each item\n\n`;
    }

    // MATH
    if (analysis.type === 'math') {
      finalPrompt += `=== FOR MATH ===\n`;
      finalPrompt += `1. Identify GIVEN and ASKED.\n`;
      finalPrompt += `2. State the FORMULA.\n`;
      finalPrompt += `3. Show ALL steps clearly.\n`;
      finalPrompt += `4. Verify the answer.\n`;
      finalPrompt += `5. Give the FINAL ANSWER.\n`;
      finalPrompt += `6. For multiple choice: provide LETTER and VALUE.\n\n`;
    }

    // LOGIC
    if (analysis.type === 'logic') {
      finalPrompt += `=== FOR LOGIC ===\n`;
      finalPrompt += `1. Identify ALL GIVEN facts.\n`;
      finalPrompt += `2. Identify what is ASKED.\n`;
      finalPrompt += `3. Draw conclusion STEP-BY-STEP.\n`;
      finalPrompt += `4. Consider ALL interpretations.\n`;
      finalPrompt += `5. Give the FINAL ANSWER.\n\n`;
    }

    // CODING
    if (analysis.type === 'coding') {
      finalPrompt += `=== FOR CODING ===\n`;
      finalPrompt += `1. Identify the language.\n`;
      finalPrompt += `2. Trace the execution step-by-step.\n`;
      finalPrompt += `3. Give the EXACT OUTPUT.\n\n`;
    }

    // ACTIVITY SHEET
    if (analysis.type === 'activity_sheet' || analysis.type === 'quiz' || analysis.type === 'exam') {
      finalPrompt += `=== FOR ACTIVITY SHEET ===\n`;
      finalPrompt += `1. MIRROR the format EXACTLY.\n`;
      finalPrompt += `2. Answer EVERY item. NO BLANKS.\n`;
      finalPrompt += `3. For "1." answer "1.". For "A." answer "A.".\n`;
      finalPrompt += `4. For "✓/✗" write the symbol.\n`;
      finalPrompt += `5. For sequence write the number.\n`;
      finalPrompt += `6. For "Explain" write 1-2 sentences.\n\n`;
    }

    // SCIENCE
    if (analysis.type === 'science') {
      finalPrompt += `=== FOR SCIENCE ===\n`;
      finalPrompt += `1. Give clear definition.\n`;
      finalPrompt += `2. Explain the process/stages.\n`;
      finalPrompt += `3. Include formula if applicable.\n`;
      finalPrompt += `4. Be ACCURATE.\n\n`;
    }

    // ESSAY
    if (analysis.type === 'essay') {
      finalPrompt += `=== FOR ESSAY ===\n`;
      finalPrompt += `1. Introduction with thesis statement.\n`;
      finalPrompt += `2. Body with 3-5 supporting points.\n`;
      finalPrompt += `3. Conclusion with summary.\n`;
      finalPrompt += `4. Follow required length.\n\n`;
    }

    // ============================================================
    // WORD LIST (FIXED — with dedup + empty-skip + typo-correction)
    // ============================================================
    if (analysis.type === 'word_list') {
      finalPrompt += `=== FOR WORD LIST CLASSIFICATION ===\n`;
      finalPrompt += `TASK: GROUP all the words into LOGICAL CATEGORIES.\n\n`;
      finalPrompt += `STRICT RULES:\n`;
      finalPrompt += `1. DO NOT copy the list. You MUST GROUP the words.\n`;
      finalPrompt += `2. Use LETTERED categories: A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P...\n`;
      finalPrompt += `3. Each letter must be USED EXACTLY ONCE. NO duplicates (e.g., no two "F.").\n`;
      finalPrompt += `4. NUMBER items under each category (1, 2, 3...).\n`;
      finalPrompt += `5. Give each category a CLEAR TITLE.\n`;
      finalPrompt += `6. Add a SHORT definition for EACH word (5-15 words).\n`;
      finalPrompt += `7. Every word must appear in EXACTLY ONE category.\n`;
      finalPrompt += `8. Do NOT skip any word.\n`;
      finalPrompt += `9. Do NOT include a category with NO words. If a category has no matching word, SKIP IT entirely.\n`;
      finalPrompt += `10. Group by SCIENTIFIC / LOGICAL classification.\n`;
      finalPrompt += `11. Use the SAME LANGUAGE as the input words (if English input, English definitions).\n`;
      finalPrompt += `12. If a word looks like a TYPO, use the CORRECT spelling (e.g., "truck" -> "buck" if it makes sense).\n\n`;
      finalPrompt += `SUGGESTED CATEGORIES (use only if applicable):\n`;
      finalPrompt += `- Reproductive & Physiological Processes\n`;
      finalPrompt += `- Breeding & Genetic Factors\n`;
      finalPrompt += `- Animal Classification by Species, Sex, Age (e.g., Cattle, Equine, Swine, Sheep/Goat)\n`;
      finalPrompt += `- Products from Animals (meat, fiber)\n`;
      finalPrompt += `- Management & Surgical Procedures\n`;
      finalPrompt += `- Poultry Terms\n`;
      finalPrompt += `- Other Terms\n\n`;
      finalPrompt += `OUTPUT FORMAT (follow strictly):\n`;
      finalPrompt += `A. [Category Title]\n`;
      finalPrompt += `1. [Word] - [Short definition]\n`;
      finalPrompt += `2. [Word] - [Short definition]\n\n`;
      finalPrompt += `B. [Category Title]\n`;
      finalPrompt += `1. [Word] - [Short definition]\n`;
      finalPrompt += `2. [Word] - [Short definition]\n\n`;
      finalPrompt += `(continue for all categories using sequential letters)\n\n`;
    }

    finalPrompt += `=== NOW ANSWER (NO REPEAT) ===\n`;
    finalPrompt += `Answer:`;

    return finalPrompt;
  },

  // ============================================================
  // UNIT CONVERSION
  // ============================================================
  tryUnitConversion(prompt) {
    if (!prompt) return null;
    const lower = prompt.toLowerCase().trim();
    const cleaned = lower.replace(/^(convert|i-convert|change|palitan|gawing|make it|compute|calculate)\s+/i, '').trim();

    const match = cleaned.match(/^(\d+\.?\d*)\s*(lbs?|pounds?|kg|kilograms?|g|grams?|oz|ounces?|cm|centimeters?|m|meters?|ft|feet|in|inches?|km|kilometers?|mi|miles?|c|celsius|f|fahrenheit|k|kelvin)\s*(?:to|sa|into|->)\s*(lbs?|pounds?|kg|kilograms?|g|grams?|oz|ounces?|cm|centimeters?|m|meters?|ft|feet|in|inches?|km|kilometers?|mi|miles?|c|celsius|f|fahrenheit|k|kelvin)/i);

    if (!match) return null;

    const value = parseFloat(match[1]);
    const from = this.normalizeUnit(match[2]);
    const to = this.normalizeUnit(match[3]);

    const conversions = {
      'lbs->kg': value * 0.453592, 'kg->lbs': value * 2.20462,
      'kg->g': value * 1000, 'g->kg': value / 1000,
      'oz->g': value * 28.3495, 'g->oz': value / 28.3495,
      'cm->m': value / 100, 'm->cm': value * 100,
      'm->ft': value * 3.28084, 'ft->m': value / 3.28084,
      'cm->in': value / 2.54, 'in->cm': value * 2.54,
      'km->mi': value * 0.621371, 'mi->km': value / 0.621371,
      'm->km': value / 1000, 'km->m': value * 1000,
      'ft->in': value * 12, 'in->ft': value / 12,
      'c->f': (value * 9/5) + 32, 'f->c': (value - 32) * 5/9,
      'c->k': value + 273.15, 'k->c': value - 273.15,
      'lbs->g': value * 453.592, 'g->lbs': value / 453.592,
      'kg->oz': value * 35.274, 'oz->kg': value / 35.274
    };

    const key = from + '->' + to;
    if (conversions[key] !== undefined) {
      const result = conversions[key];
      const unitName = { 'kg': 'kg', 'lbs': 'lbs', 'g': 'g', 'oz': 'oz', 'cm': 'cm', 'm': 'm', 'ft': 'ft', 'in': 'in', 'km': 'km', 'mi': 'mi', 'c': '°C', 'f': '°F', 'k': 'K' };
      return `${value} ${unitName[from]} = ${result.toFixed(2)} ${unitName[to]}`;
    }

    return null;
  },

  normalizeUnit(unit) {
    const u = unit.toLowerCase();
    if (/^(lbs?|pounds?)$/.test(u)) return 'lbs';
    if (/^(kg|kilograms?)$/.test(u)) return 'kg';
    if (/^(g|grams?)$/.test(u)) return 'g';
    if (/^(oz|ounces?)$/.test(u)) return 'oz';
    if (/^(cm|centimeters?)$/.test(u)) return 'cm';
    if (/^(m|meters?)$/.test(u)) return 'm';
    if (/^(ft|feet)$/.test(u)) return 'ft';
    if (/^(in|inches?)$/.test(u)) return 'in';
    if (/^(km|kilometers?)$/.test(u)) return 'km';
    if (/^(mi|miles?)$/.test(u)) return 'mi';
    if (/^(c|celsius)$/.test(u)) return 'c';
    if (/^(f|fahrenheit)$/.test(u)) return 'f';
    if (/^(k|kelvin)$/.test(u)) return 'k';
    return u;
  },

  // ============================================================
  // COMPREHEND INPUT
  // ============================================================
  comprehendInput(prompt) {
    if (!prompt) return { type: 'general', language: 'english' };
    const lower = prompt.toLowerCase();
    const analysis = { type: 'general', language: 'english' };

    // SEQUENCE
    if (/sequence|arrange\s+in\s+(the\s+)?correct\s+order|write\s+1-\d+|number\s+the\s+steps|arrange\s+the\s+steps|correct\s+order|put\s+in\s+order/i.test(lower)) {
      analysis.type = 'sequence';
      return analysis;
    }

    // MATH
    const hasMathKeywords = /(solve|compute|calculate|evaluate|find\s+x|find\s+the\s+value|equation|solution|derivative|integral|limit|what\s+is\s+the\s+value\s+of|answer\s+and\s+solve|solve\s+this|full\s+solution|step\s+by\s+step)/i.test(lower);
    const hasPureNumbers = /^[\d\s\+\-\*\/\(\)\.\,×÷\^]+$/i.test(prompt.replace(/\s/g, ''));
    const hasMathEquations = /\d+\s*[\+\-\*\/\^]\s*\d+|\d*x\s*[\+\-\*\/]\s*\d+|x\s*[\+\-\*\/]\s*\d+|\d+\s*=\s*\d+/i.test(prompt);
    if (hasMathKeywords || hasPureNumbers || hasMathEquations) {
      analysis.type = 'math';
      return analysis;
    }

    // LOGIC
    if (/\bif\s+x\s+and\s+y\b/i.test(lower) || /\breal\s+numbers\b/i.test(lower) ||
        /\blogic\b|\breasoning\b|\briddle\b|\bpuzzle\b|\bbugtong\b/i.test(lower) ||
        /\bhow\s+many\s+(people|sons|daughters|brothers|sisters|children|family)\b/i.test(lower) ||
        /\beach\s+(son|daughter|brother|sister|child)\b/i.test(lower)) {
      analysis.type = 'logic';
      return analysis;
    }

    // CODING
    if (/\bpython\b|\bjava\b|\bjavascript\b|\bc\+\+\b|\bprint\s*\(|\bconsole\.log/i.test(lower)) {
      analysis.type = 'coding';
      return analysis;
    }

    // ACTIVITY SHEET / QUIZ / EXAM
    if (/(^|\n)\s*\d+\s*[\.\)]\s*\S/i.test(prompt) || /panuto|directions|piliin|choose|answer/i.test(lower)) {
      if (/activity\s+sheet|worksheet|gawain/i.test(lower)) analysis.type = 'activity_sheet';
      else if (/exam|test|quiz|summative|assessment/i.test(lower)) analysis.type = 'exam';
      else if (/(^|\n)\s*\d+\s*[\.\)]\s*\S/i.test(prompt)) analysis.type = 'quiz';
      return analysis;
    }

    // ESSAY
    if (/\b(essay|sanaysay|write\s+an?\s+essay|composition|magsulat\s+ng)\b/i.test(lower)) {
      analysis.type = 'essay';
      return analysis;
    }

    // SCIENCE
    if (/\bphotosynthesis|respiration|cell|dna|lifecycle|life\s*cycle|cycle|process|stages|phases\b/i.test(lower) ||
        /\batom|molecule|gravity|force|energy|ecosystem|biome|evolution|mitosis|meiosis\b/i.test(lower) ||
        /\bwater\s+cycle|carbon\s+cycle|nitrogen\s+cycle|rock\s+cycle\b/i.test(lower)) {
      analysis.type = 'science';
      return analysis;
    }

    // DEFINITION / EXPLANATION
    if (/^(what\s+is|what\s+are|define|definition\s+of|meaning\s+of|ano\s+ang|kahulugan\s+ng)\b/i.test(lower)) {
      analysis.type = 'definition';
      return analysis;
    }

    if (/^(explain|describe|discuss|ipaliwanag|why\s+does|why\s+is|bakit\s+ang)\b/i.test(lower)) {
      analysis.type = 'explanation';
      return analysis;
    }

    // ============================================================
    // WORD LIST — Auto-detect pag listahan lang
    // ============================================================
    const inputLines = prompt.split('\n').map(l => l.trim()).filter(l => l.length > 1);
    const shortLines = inputLines.filter(l => {
      const words = l.split(/\s+/);
      return words.length >= 1 && words.length <= 4 && /^[A-Za-z][a-zA-Z\s\-'\.]+$/.test(l) && !/[?\!]/.test(l);
    });

    console.log('[AI Detection] Total:', inputLines.length, '| Short:', shortLines.length);

    if (shortLines.length >= 8 && shortLines.length / inputLines.length > 0.4) {
      analysis.type = 'word_list';
      return analysis;
    }

    if (/categorize|classify|classification|i-group|i-category|word\s*list|vocabulary|terminology/i.test(lower)) {
      analysis.type = 'word_list';
      return analysis;
    }

    return analysis;
  },

  // ============================================================
  // CALL AI — Priority (all APIs)
  // ============================================================
  async callAIWithViceVersa(prompt, originalPrompt, language, intent) {
    const safePrompt = prompt.length > 8000 ? prompt.substring(0, 8000) : prompt;

    const providers = [
      { name: 'Groq', call: () => this.callGroqAPI(safePrompt) },
      { name: 'Cerebras', call: () => this.callCerebrasAPI(safePrompt) },
      { name: 'Overchat Claude', call: () => this.callCeddsAPI(safePrompt, OVERCHAT_CLAUDE) },
      { name: 'Overchat DeepSeek', call: () => this.callCeddsAPI(safePrompt, OVERCHAT_DEEPSEEK) }
    ];

    for (const provider of providers) {
      try {
        console.log(`[AI] Trying ${provider.name}...`);
        const result = await provider.call();
        if (!result || result.trim().length < 3) continue;
        if (this.hasErrorKeyword(result.toLowerCase())) continue;
        console.log(`[AI] ✓ Using ${provider.name}`);
        return result.trim();
      } catch (error) {
        console.log(`[AI] ✗ ${provider.name}: ${error.message}`);
      }
    }
    throw new Error('All AI providers failed');
  },

  hasErrorKeyword(lower) {
    const keywords = [
      'not enough credits', 'insufficient', 'quota', 'exceeded', 'limit reached',
      'rate limit', 'too many requests', 'api key', 'out of credits'
    ];
    return keywords.some(kw => lower.includes(kw));
  },

  async callGroqAPI(prompt) {
    if (!GROQ_API_KEY) throw new Error('Groq key not set');
    const r = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are an accurate AI assistant. NEVER repeat the input question. Give the ANSWER directly. For math: show step-by-step. For sequence: arrange logically. For activity sheets: mirror format. For word lists: GROUP into lettered categories (A, B, C...) with definitions, ensure NO duplicate letters and SKIP empty categories. Answer in the same language as the input.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 8000
    }, {
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 90000
    });
    return r.data?.choices?.[0]?.message?.content;
  },

  async callCerebrasAPI(prompt) {
    if (!CEREBRAS_API_KEY) throw new Error('Cerebras key not set');
    const r = await axios.post('https://api.cerebras.ai/v1/chat/completions', {
      model: 'llama3.1-70b',
      messages: [
        { role: 'system', content: 'You are an accurate AI assistant. NEVER repeat the input question. Give the ANSWER directly. For math: show step-by-step. For sequence: arrange logically. For activity sheets: mirror format. For word lists: GROUP into lettered categories (A, B, C...) with definitions, ensure NO duplicate letters and SKIP empty categories. Answer in the same language as the input.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 8000
    }, {
      headers: { 'Authorization': `Bearer ${CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 90000
    });
    return r.data?.choices?.[0]?.message?.content;
  },

  async callCeddsAPI(prompt, url) {
    const r = await axios.get(`${url}?message=${encodeURIComponent(prompt)}`, {
      timeout: 90000,
      headers: { 'Accept': 'application/json' }
    });
    const data = r.data;
    if (data?.result) return data.result;
    if (data?.response) return data.response;
    if (data?.message) return data.message;
    if (typeof data === 'string') return data;
    throw new Error('No response');
  },

  // ============================================================
  // CLEAN OUTPUT
  // ============================================================
  cleanOutput(text) {
    if (!text) return '';
    let cleaned = text.trim();

    cleaned = cleaned.replace(/^As an AI.*?\n/i, '');
    cleaned = cleaned.replace(/^Here is.*?\n/i, '');
    cleaned = cleaned.replace(/^Here's.*?\n/i, '');
    cleaned = cleaned.replace(/^Let me.*?\n/i, '');
    cleaned = cleaned.replace(/^I hope.*?\n/i, '');
    cleaned = cleaned.replace(/^Hope this helps.*?\n/i, '');
    cleaned = cleaned.replace(/^Of course.*?\n/i, '');
    cleaned = cleaned.replace(/^Certainly.*?\n/i, '');
    cleaned = cleaned.replace(/^Sure,.*?\n/i, '');

    cleaned = cleaned.replace(/\n+(Would you like|If you need|If you want|Feel free to|Let me know|Do you want|I can also|Which language|Please specify).*$/is, '');
    cleaned = cleaned.replace(/\n+(Hope this helps|Good luck|Best of luck).*$/is, '');

    cleaned = cleaned.replace(/^(TITLE|Title):\s*\n[^\n]+\n+/i, '');
    cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/`{1,3}/g, '');

    cleaned = cleaned.replace(/\\\[/g, '').replace(/\\\]/g, '');
    cleaned = cleaned.replace(/\\\(/g, '').replace(/\\\)/g, '');
    cleaned = cleaned.replace(/\$\$/g, '').replace(/\$/g, '');
    cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');

    cleaned = cleaned.replace(/₂/g, '2').replace(/₃/g, '3').replace(/₄/g, '4');
    cleaned = cleaned.replace(/₅/g, '5').replace(/₆/g, '6').replace(/₇/g, '7');
    cleaned = cleaned.replace(/₈/g, '8').replace(/₉/g, '9').replace(/₀/g, '0').replace(/₁/g, '1');
    cleaned = cleaned.replace(/²/g, '^2').replace(/³/g, '^3').replace(/⁴/g, '^4').replace(/⁵/g, '^5');

    cleaned = cleaned.replace(/^\s+/, '').replace(/\s+$/, '');
    return cleaned.trim();
  },

  removeDuplicates(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const result = [];
    const seen = new Set();
    const seenCategories = new Set();
    let currentPart = '';
    for (const line of lines) {
      const trimmed = line.trim();

      // PART indicator
      const partMatch = trimmed.match(/^PART\s+[IVX\d]+/i);
      if (partMatch) { currentPart = partMatch[0].toUpperCase(); result.push(line); continue; }

      // CATEGORY (letter) — deduplicate letters
      const catMatch = trimmed.match(/^([A-Z])\.\s+(.+)/);
      if (catMatch) {
        const letter = catMatch[1];
        if (seenCategories.has(letter)) {
          // Skip duplicate letter
          continue;
        }
        seenCategories.add(letter);
        currentPart = letter;
        result.push(line);
        continue;
      }

      // NUMBERED item — deduplicate within currentPart
      const itemMatch = trimmed.match(/^([✓✗\s_\-*]*)(\d+)[\.\)]\s/);
      if (itemMatch) {
        const key = currentPart + '::' + itemMatch[2];
        if (seen.has(key)) continue;
        seen.add(key);
      }
      result.push(line);
    }
    return result.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  },

  organizeOutput(output) {
    if (!output) return output;
    return output.replace(/^\n+/, '').replace(/\n+$/, '').replace(/\n{3,}/g, '\n\n').trim();
  },

  ensureComplete(text) {
    if (!text) return text;
    if (text.trim().endsWith('...')) text = text.replace(/\.\.\.$/, '');
    return text.trim();
  },

  // ============================================================
  // SEND COMPLETE
  // ============================================================
  async sendComplete(senderId, text, token) {
    if (!text) return;
    if (text.length <= MAX_CHUNK) {
      await sendMessage(senderId, { text }, token);
      return;
    }
    const chunks = this.splitComplete(text);
    for (let i = 0; i < chunks.length; i++) {
      try {
        await sendMessage(senderId, { text: chunks[i] }, token);
        if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
      } catch (error) { console.error('[sendComplete]', error.message); }
    }
  },

  splitComplete(text) {
    if (!text) return [];
    if (text.length <= MAX_CHUNK) return [text];
    const chunks = [];
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK) { chunks.push(remaining); break; }
      let chunk = remaining.substring(0, MAX_CHUNK);
      const breakPoints = ['\n\n', '. ', '! ', '? ', '\n', '; ', ', ', '.', ' '];
      let bestIndex = -1;
      for (const bp of breakPoints) {
        const idx = chunk.lastIndexOf(bp);
        if (idx > MAX_CHUNK * 0.3) { bestIndex = idx + bp.length; break; }
      }
      if (bestIndex === -1) bestIndex = MAX_CHUNK;
      chunks.push(remaining.substring(0, bestIndex).trim());
      remaining = remaining.substring(bestIndex).trim();
    }
    return chunks;
  },

  // ============================================================
  // GREETINGS
  // ============================================================
  isGreetingOrConversational(prompt) {
    if (!prompt) return false;
    const p = prompt.trim().toLowerCase().replace(/[.:!?,\s]+$/g, '').trim();
    if (p.length > 60) return false;
    const patterns = [
      /^(hai|hi|hey|hello|helo|hallo|yo|sup|hola)$/i,
      /^(kumusta|kamusta|musta|musta na)$/i,
      /^(good\s*(morning|afternoon|evening|day|night))$/i,
      /^(magandang\s*(araw|umaga|hapon|gabi|tanghali))$/i,
      /^(help|tulong|tabang)$/i,
      /^(thank|thanks|thank you|salamat|salamat po)$/i,
      /^(ok|okay|sige|sure|noted)$/i,
      /^(bye|goodbye|paalam|ingat)$/i,
      /^(sorry|pasensya|paumanhin)$/i,
      /^(yes|oo|opo|no|hindi)$/i,
      /^(good|nice|great|galing|magaling)$/i,
      /^(sino|who)\s*(ka|ka po|kayo)$/i,
      /^(ano|what)\s*(pangalan mo|name mo)$/i
    ];
    return patterns.some(pattern => pattern.test(p));
  },

  buildConversationalReply(prompt) {
    const p = prompt.trim().toLowerCase().replace(/[.:!?,\s]+$/g, '').trim();
    if (/^(hai|hi|hey|hello|helo|hallo|yo|sup|hola)$/i.test(p)) {
      return 'Hello! Ako si Teacher Arlene, ang iyong AI assistant.\n\nPaano kita matutulungan ngayon?\n\nI-type lang ang iyong tanong o i-paste ang activity sheet.';
    }
    if (/^(kumusta|kamusta|musta)/i.test(p)) return 'Kumusta! Ano ang itatanong mo?';
    if (/^(help|tulong|tabang)$/i.test(p)) {
      return 'HELP GUIDE\n\n1. AI - Magtanong ng kahit ano (math, science, english, filipino, AP, TLE, MAPEH, etc.)\n2. WEIGHT - Estimate ng timbang\n3. UNIT CONVERSION - "84.4 lbs to kg"\n4. FOLLOW-UP - I-reply ang AI response\n5. WORD LIST - Synonyms, Antonyms\n6. ACTIVITY SHEET / QUIZ - I-paste lang';
    }
    if (/^(thank|thanks|salamat)/i.test(p)) return 'Walang anuman!';
    if (/^(ok|okay|sige|sure|noted)/i.test(p)) return 'Sige!';
    if (/^(bye|goodbye|paalam|ingat)$/i.test(p)) return 'Paalam! Ingat palagi.';
    if (/^(sorry|pasensya|paumanhin)$/i.test(p)) return 'Walang problema!';
    if (/^(yes|oo|opo)/i.test(p)) return 'Sige! Ano ang gusto mong itanong?';
    if (/^(no|hindi)/i.test(p)) return 'Okay, narito lang ako kung kailangan mo.';
    if (/^(good|nice|great|galing|magaling)$/i.test(p)) return 'Salamat!';
    if (/^(sino|who)\s*(ka|ka po|kayo)$/i.test(p)) return 'Ako si Teacher Arlene, AI assistant na ginawa ni GeoDevz69.';
    if (/^(ano|what)\s*(pangalan mo|name mo)$/i.test(p)) return 'Ang pangalan ko ay Teacher Arlene.';
    return 'Hello! Ako si Teacher Arlene.\n\nPaano kita matutulungan?';
  },

  // ============================================================
  // FOLLOW-UP — COMPLETE (60+ functions)
  // ============================================================
  isFollowUpCommand(cleanPrompt) {
    if (!cleanPrompt) return false;
    const p = cleanPrompt.toLowerCase().trim();

    if (/^(convert|i-convert|change|palitan|gawing)\s+/i.test(p)) return true;
    if (/^\d+\.?\d*\s*(lbs?|pounds?|kg|kilograms?|g|grams?|oz|ounces?|cm|centimeters?|m|meters?|ft|feet|in|inches?|km|kilometers?|mi|miles?|c|celsius|f|fahrenheit|k|kelvin)\s*(to|sa|into|->)/i.test(p)) return true;

    if (/^(translate|isalin|salin)\s+(to|sa)\s+\w+/i.test(p)) return true;
    if (/^(translate|isalin|salin)( it| this| that| mo| po| lang)?$/i.test(p)) return true;

    if (/^(elaborate|explain more|explain further|paliwanag|ipaliwanag|dagdag paliwanag)( more| further| pa| po)?$/i.test(p)) return true;
    if (/^(elaborate|explain)\s+(it|this|that|mo|po|nga)?$/i.test(p)) return true;
    if (/^(more explanation|more details|add more details|give more details|mas detalyado)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(full solution|complete solution|show full solution|ipakita ang buong solution)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(step by step|step.?by.?step solution|show step by step|ipakita ang step by step)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(purpose|what is the purpose|purpose of this|ano ang purpose|ano ang layunin)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(example|give example|give examples|examples? of this|halimbawa|magbigay ng halimbawa)( it| this| that| mo| po| of)?$/i.test(p)) return true;

    if (/^(simplify|simple|pasimplehin|gawing simple|simplify it)( it| this| that| mo| po| lang| naman)?$/i.test(p)) return true;
    if (/^(correct|fix|ayusin|itama|proofread)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(define|definition|i-define|bigyan ng kahulugan)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(describe|ilarawan|give description)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(solve|i-solve|solve it|ipakita ang solution)( it| this| that| mo| po)?$/i.test(p)) return true;

    if (/^(paraphrase|rephrase|rewrite|i-paraphrase|baguhin ang salita)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(expand|dagdagan|add more|more details)( it| this| that| mo| po| naman)?$/i.test(p)) return true;
    if (/^(summarize|summary|buod|paikliin|shorten|brief|make it short)( it| this| that| mo| po| lang)?$/i.test(p)) return true;
    if (/^(humanize|make it natural|gawing natural|gawing tao)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(compare|contrast|ihambing|difference|kaibahan)( it| this| that| mo| po| with| to)?$/i.test(p)) return true;
    if (/^(bullet|bullet point|bullet form|list form)( it| this| that| mo| po| lang)?$/i.test(p)) return true;

    if (/^(formalize|i-formalize|gawing pormal|pormalin|make it academic)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(evaluate|assess|rate|suriin|i-rate)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(analyze|analysis|break down|suriin|i-analyze)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(criticize|critique|puna|punahin|comment on)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(construct|build|create|make|gumawa|i-gawa)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(outline|balangkas|make an outline)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(refine|polish|improve|pagandahin)( it| this| that| mo| po)?$/i.test(p)) return true;

    if (/^(cite|citation|apa|mla|cite it|gumawa ng citation)/i.test(p)) return true;
    if (/^(thesis|thesis statement|thesis outline|gumawa ng thesis)/i.test(p)) return true;
    if (/^(literature review|review of related literature|rrl|gumawa ng rrl)/i.test(p)) return true;
    if (/^(research methodology|research design|methodology)/i.test(p)) return true;
    if (/^(data analysis|statistical analysis|analyze data)/i.test(p)) return true;
    if (/^(abstract|executive summary|gumawa ng abstract)/i.test(p)) return true;
    if (/^(hypothesis|formulate hypothesis|gumawa ng hypothesis)/i.test(p)) return true;
    if (/^(research question|formulate research question)/i.test(p)) return true;
    if (/^(discussion|conclusion|recommendation)/i.test(p)) return true;

    if (/^(math solution|solve math|show math solution)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(graph|plot|i-graph|i-plot|describe graph)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(geometry|solve geometry|area|perimeter|volume|circumference)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(statistics|stats|mean|median|mode|standard deviation|variance)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(probability|probability of|compute probability|permutation|combination)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(equation solve|quadratic|system of equations|solve equation)( it| this| that| mo| po)?$/i.test(p)) return true;

    if (/^(balance chemical|chemical equation|balance equation)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(periodic table|element info|atomic number|element details)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(physics formula|physics solve|physics problem)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(biology|biology diagram|biology process)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(lab report|lab format|write lab report)( it| this| that| mo| po)?$/i.test(p)) return true;

    if (/^(grammar check|check grammar|grammar)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(sentence diagram|diagram sentence)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(poem analysis|analyze poem|poetry)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(literary analysis|analyze literature|analyze text)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(vocabulary|word analysis|word root|etymology)( it| this| that| mo| po)?$/i.test(p)) return true;

    if (/^(flashcards?|make flashcards?|generate flashcards?)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(quiz|generate quiz|make quiz|create quiz)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(study guide|make study guide|study plan)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(summary notes?|summarize notes?|bullet notes?|note summary)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(citation|generate citation|apa citation|mla citation)( it| this| that| mo| po)?$/i.test(p)) return true;

    if (/^(essay outline|outline essay|make essay outline)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(annotated bibliography|annotated bib)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(research paper|write research paper|draft research paper)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(essay draft|write essay|draft essay)( it| this| that| mo| po)?$/i.test(p)) return true;

    if (/^(test reviewer|make reviewer|reviewer)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(answer key|make answer key|generate answer key)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(score calculator|compute score|calculate grade)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(weakness analyzer|analyze weaknesses|identify weaknesses)( it| this| that| mo| po)?$/i.test(p)) return true;

    if (/^(plagiarism check|check plagiarism|check originality)( it| this| that| mo| po)?$/i.test(p)) return true;
    if (/^(study schedule|make study schedule|plan study)( it| this| that| mo| po)?$/i.test(p)) return true;

    return false;
  },

  getFollowUpAction(cleanPrompt) {
    const p = cleanPrompt.toLowerCase().trim();

    if (/^(convert|i-convert|change|palitan|gawing)\s+/i.test(p)) return 'convert';
    if (/^\d+\.?\d*\s*(lbs?|pounds?|kg|kilograms?|g|grams?|oz|ounces?|cm|centimeters?|m|meters?|ft|feet|in|inches?|km|kilometers?|mi|miles?|c|celsius|f|fahrenheit|k|kelvin)\s*(to|sa|into|->)/i.test(p)) return 'convert';

    const translateMatch = p.match(/^(?:translate|isalin|salin)\s+(?:to|sa)\s+(\w+)/i);
    if (translateMatch) return 'translate_to_' + translateMatch[1].toLowerCase();
    if (/^(translate|isalin|salin)/i.test(p)) return 'translate_to_english';

    if (/plagiarism check|check plagiarism/i.test(p)) return 'plagiarism_check';
    if (/study schedule|make study schedule/i.test(p)) return 'study_schedule';
    if (/test reviewer|make reviewer/i.test(p)) return 'test_reviewer';
    if (/answer key|make answer key/i.test(p)) return 'answer_key';
    if (/score calculator|compute score/i.test(p)) return 'score_calculator';
    if (/weakness analyzer|analyze weaknesses/i.test(p)) return 'weakness_analyzer';
    if (/essay outline|outline essay/i.test(p)) return 'essay_outline';
    if (/annotated bibliography|annotated bib/i.test(p)) return 'annotated_bib';
    if (/research paper|write research paper/i.test(p)) return 'research_paper';
    if (/essay draft|write essay/i.test(p)) return 'essay_draft';
    if (/flashcards?|make flashcards?/i.test(p)) return 'flashcards';
    if (/quiz|generate quiz|make quiz/i.test(p)) return 'quiz';
    if (/study guide|study plan/i.test(p)) return 'study_guide';
    if (/summary notes?|summarize notes?/i.test(p)) return 'summary_notes';
    if (/citation|generate citation|apa citation|mla citation/i.test(p)) return 'citation';
    if (/grammar check|check grammar/i.test(p)) return 'grammar_check';
    if (/sentence diagram|diagram sentence/i.test(p)) return 'sentence_diagram';
    if (/poem analysis|analyze poem|poetry/i.test(p)) return 'poem_analysis';
    if (/literary analysis|analyze literature/i.test(p)) return 'literary_analysis';
    if (/vocabulary|word root|etymology/i.test(p)) return 'vocabulary';
    if (/balance chemical|chemical equation/i.test(p)) return 'balance_chemical';
    if (/periodic table|element info/i.test(p)) return 'periodic_table';
    if (/physics solve|physics problem/i.test(p)) return 'physics_solve';
    if (/biology process|biology diagram/i.test(p)) return 'biology';
    if (/lab report|write lab report/i.test(p)) return 'lab_report';
    if (/math solution|solve math|show math solution/i.test(p)) return 'math_solution';
    if (/graph|plot|describe graph/i.test(p)) return 'graph';
    if (/geometry|area|perimeter|volume|circumference/i.test(p)) return 'geometry';
    if (/statistics|stats|mean|median|mode|standard deviation/i.test(p)) return 'statistics';
    if (/probability|permutation|combination/i.test(p)) return 'probability';
    if (/equation solve|quadratic|system of equations/i.test(p)) return 'equation_solve';
    if (/cite|citation|apa|mla/i.test(p)) return 'cite';
    if (/thesis statement|gumawa ng thesis/i.test(p)) return 'thesis';
    if (/literature review|rrl/i.test(p)) return 'literature_review';
    if (/research methodology|methodology/i.test(p)) return 'methodology';
    if (/data analysis|statistical/i.test(p)) return 'data_analysis';
    if (/abstract|executive summary/i.test(p)) return 'abstract';
    if (/hypothesis/i.test(p)) return 'hypothesis';
    if (/research question/i.test(p)) return 'research_question';
    if (/discussion|conclusion|recommendation/i.test(p)) return 'conclusion';
    if (/summarize|summary|buod|paikliin|shorten|brief/i.test(p)) return 'summarize';
    if (/humanize|make it human|make it natural|gawing natural/i.test(p)) return 'humanize';
    if (/evaluate|assess|rate|suriin/i.test(p)) return 'evaluate';
    if (/criticize|critique|puna|punahin/i.test(p)) return 'criticize';
    if (/analyze|analysis|break down/i.test(p)) return 'analyze';
    if (/compare|contrast|ihambing/i.test(p)) return 'compare';
    if (/outline|balangkas/i.test(p)) return 'outline';
    if (/bullet|bullet point|bullet form|list form/i.test(p)) return 'bullet';
    if (/define|definition|bigyan ng kahulugan/i.test(p)) return 'define';
    if (/describe|ilarawan|give description/i.test(p)) return 'describe';
    if (/examples?|give examples?|magbigay ng halimbawa/i.test(p)) return 'examples';
    if (/solve|i-solve|solve it|ipakita ang solution/i.test(p)) return 'solve';
    if (/purpose|ano ang purpose|ano ang layunin/i.test(p)) return 'purpose';
    if (/full solution|complete solution|ipakita ang buong solution/i.test(p)) return 'math_solution';
    if (/step by step|step.?by.?step solution|ipakita ang step by step/i.test(p)) return 'math_solution';
    if (/more explanation|more details|mas detalyado/i.test(p)) return 'elaborate';
    if (/refine|polish|improve|pagandahin/i.test(p)) return 'refine';
    if (/construct|build|create|make|gumawa|i-gawa/i.test(p)) return 'construct';
    if (/paraphrase|rephrase|rewrite|i-rewrite|i-paraphrase|baguhin/i.test(p)) return 'paraphrase';
    if (/simplify|simple|pasimplehin|gawing simple|madali/i.test(p)) return 'simplify';
    if (/expand|dagdagan|dagdag|add more|more details/i.test(p)) return 'expand';
    if (/correct|fix|i-correct|i-fix|ayusin|tama|itama|proofread/i.test(p)) return 'correct';
    if (/formalize|i-formalize|pormal|academic/i.test(p)) return 'formalize';
    if (/elaborate|explain more|explain further|paliwanag|ipaliwanag/i.test(p)) return 'elaborate';
    return 'elaborate';
  },

  buildFollowUpPrompt(action, previousResponse, userPrompt) {
    const actionInstructions = {
      'elaborate': 'ELABORATE. Add MORE DETAILS and examples.',
      'purpose': 'PURPOSE. Explain the PURPOSE.',
      'examples': 'GIVE EXAMPLES. Provide SPECIFIC examples.',
      'math_solution': 'FULL SOLUTION. Show step-by-step solution.',
      'convert': 'CONVERT. Convert the measurement to the target unit. Show the calculation.',
      'simplify': 'SIMPLIFY. Use SIMPLE WORDS.',
      'correct': 'CORRECT. Fix grammar and spelling.',
      'define': 'DEFINE. Give clear definition.',
      'describe': 'DESCRIBE. Give detailed description.',
      'solve': 'SOLVE STEP-BY-STEP. Show solution.',
      'paraphrase': 'PARAPHRASE. Rewrite in DIFFERENT WORDS.',
      'expand': 'EXPAND. Add MORE INFORMATION.',
      'summarize': 'SUMMARIZE. Give a BRIEF summary.',
      'humanize': 'HUMANIZE. Rewrite naturally.',
      'compare': 'COMPARE. Show similarities and differences.',
      'bullet': 'BULLET POINTS. Convert to bullets.',
      'formalize': 'FORMALIZE. Make it academic.',
      'evaluate': 'EVALUATE. Assess the quality.',
      'analyze': 'ANALYZE. Break down into parts.',
      'criticize': 'CRITICIZE. Provide constructive criticism.',
      'construct': 'CONSTRUCT. Build a new version.',
      'outline': 'OUTLINE. Create structured outline.',
      'refine': 'REFINE. Polish and improve.',
      'cite': 'CITE. Create proper citation in APA or MLA.',
      'thesis': 'THESIS. Create thesis statement and outline.',
      'literature_review': 'LITERATURE REVIEW. Create RRL.',
      'methodology': 'METHODOLOGY. Create research methodology.',
      'data_analysis': 'DATA ANALYSIS. Analyze data statistically.',
      'abstract': 'ABSTRACT. Create concise abstract.',
      'hypothesis': 'HYPOTHESIS. Formulate clear hypothesis.',
      'research_question': 'RESEARCH QUESTION. Formulate focused questions.',
      'conclusion': 'CONCLUSION. Create strong conclusion.',
      'graph': 'GRAPH. Describe the graph clearly.',
      'geometry': 'GEOMETRY. Solve geometry problem.',
      'statistics': 'STATISTICS. Compute required statistics.',
      'probability': 'PROBABILITY. Compute probability.',
      'equation_solve': 'EQUATION SOLVE. Solve step-by-step.',
      'balance_chemical': 'BALANCE CHEMICAL EQUATION. Show balanced equation.',
      'periodic_table': 'PERIODIC TABLE. Give element info.',
      'physics_solve': 'PHYSICS SOLVE. Show formula, substitution, answer.',
      'biology': 'BIOLOGY. Explain the biology concept.',
      'lab_report': 'LAB REPORT. Format the lab report.',
      'grammar_check': 'GRAMMAR CHECK. Identify and fix errors.',
      'sentence_diagram': 'SENTENCE DIAGRAM. Show structure.',
      'poem_analysis': 'POEM ANALYSIS. Analyze theme, meter, rhyme.',
      'literary_analysis': 'LITERARY ANALYSIS. Analyze theme, symbolism.',
      'vocabulary': 'VOCABULARY. Analyze word root, prefix, suffix.',
      'flashcards': 'FLASHCARDS. Create Q&A flashcard pairs.',
      'quiz': 'QUIZ. Generate quiz questions.',
      'study_guide': 'STUDY GUIDE. Create study guide.',
      'summary_notes': 'SUMMARY NOTES. Create bullet-point notes.',
      'citation': 'CITATION. Generate proper citation.',
      'essay_outline': 'ESSAY OUTLINE. Create detailed outline.',
      'annotated_bib': 'ANNOTATED BIBLIOGRAPHY. Create entries.',
      'research_paper': 'RESEARCH PAPER. Draft complete paper.',
      'essay_draft': 'ESSAY DRAFT. Write complete essay.',
      'test_reviewer': 'TEST REVIEWER. Generate comprehensive reviewer.',
      'answer_key': 'ANSWER KEY. Create answer key.',
      'score_calculator': 'SCORE CALCULATOR. Compute the score.',
      'weakness_analyzer': 'WEAKNESS ANALYZER. Identify weaknesses.',
      'plagiarism_check': 'PLAGIARISM CHECK. Analyze content for plagiarism.',
      'study_schedule': 'STUDY SCHEDULE. Create study schedule.'
    };

    let instruction;
    if (action.startsWith('translate_to_')) {
      const targetLang = action.replace('translate_to_', '').toUpperCase();
      instruction = `TRANSLATE the ORIGINAL RESPONSE to ${targetLang}. Do NOT ask for clarification.`;
    } else {
      instruction = actionInstructions[action] || actionInstructions['elaborate'];
    }

    let prompt = 'You are a text transformation expert.\n\n';
    prompt += 'TASK: ' + instruction + '\n\n';
    prompt += 'CRITICAL: Do NOT repeat the input. Do NOT ask for clarification.\n\n';
    prompt += 'USER REQUEST: ' + (userPrompt || 'N/A') + '\n\n';
    prompt += 'ORIGINAL RESPONSE:\n---START---\n' + previousResponse + '\n---END---\n\n';
    prompt += 'Now write the ' + action.toUpperCase() + ' version:';
    return prompt;
  },

  // ============================================================
  // WORD LIST (Synonyms/Antonyms)
  // ============================================================
  isWordListQuestion(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase().trim();
    return /^(other\s+term|other\s+word|another\s+word|synonym|antonym|opposite|kasingkahulugan|kasalungat|iba\s+pang|ibang\s+salita)/i.test(lower);
  },

  async handleWordList(senderId, prompt, token) {
    try {
      const lower = prompt.toLowerCase().trim();
      let listType = 'synonym';
      if (/antonym|opposite|kasalungat/i.test(lower)) listType = 'antonym';
      let targetWord = '';
      const patterns = [
        /^(?:other|another)\s+(?:term|word)s?\s+(?:for|of)\s+(.+)$/i,
        /^synonyms?\s+(?:for|of)\s+(.+)$/i,
        /^antonyms?\s+(?:for|of)\s+(.+)$/i,
        /^opposite\s+(?:of|word\s+for)\s+(.+)$/i,
        /^kasingkahulugan\s+(?:ng|nang)\s+(.+)$/i,
        /^kasalungat\s+(?:ng|nang)\s+(.+)$/i,
        /^iba\s+pang\s+(?:salita|tawag)\s+(?:sa|para sa)\s+(.+)$/i
      ];
      for (const pattern of patterns) {
        const match = prompt.match(pattern);
        if (match) { targetWord = match[1].trim().replace(/[?.!]+$/, ''); break; }
      }
      if (!targetWord) return null;
      const actionLabel = listType === 'antonym' ? 'ANTONYMS' : 'SYNONYMS';
      const finalPrompt = `Give ALL common ${actionLabel} of "${targetWord}". Output ONLY a NUMBERED LIST. Include brief meaning each.\n\nLIST:`;
      const response = await this.callAIWithViceVersa(finalPrompt, prompt, 'english', 'wordlist');
      let cleaned = this.cleanOutput(response);
      if (!cleaned || cleaned.length < 5) return null;
      return cleaned;
    } catch (error) { return null; }
  },

  // ============================================================
  // WEIGHT
  // ============================================================
  shouldTriggerWeight(lowerPrompt, originalPrompt) {
    const hasWeight = /\b(weight|timbang|weigh)\b/i.test(lowerPrompt);
    const hasAnimal = /\b(pig|baboy|chicken|manok|cow|baka|carabao|kalabaw|goat|kambing|sheep|tupa|fish|isda|duck|pato|turkey|pabo|horse|kabayo|dog|aso|cat|pusa)\b/i.test(lowerPrompt);
    const hasNumbers = /\d+/.test(originalPrompt);
    return hasWeight && hasAnimal && hasNumbers;
  },

  async handleWeightEstimation(senderId, prompt, token) {
    const lower = prompt.toLowerCase();
    const nums = prompt.match(/\d+\.?\d*/g) || [];
    let girth = nums.length >= 1 ? parseFloat(nums[0]) : null;
    let length = nums.length >= 2 ? parseFloat(nums[1]) : null;

    if (!girth) {
      await sendMessage(senderId, { text: 'Please provide heart girth and length.' }, token);
      return;
    }

    let name = '', divisor = 0, unit = 'cm', resultUnit = 'kg';
    if (lower.includes('pig') || lower.includes('baboy')) { name = 'PIG'; divisor = 400; unit = 'inches'; resultUnit = 'lbs'; }
    else if (lower.includes('chicken') || lower.includes('manok')) { name = 'CHICKEN'; }
    else if (lower.includes('cow') || lower.includes('baka') || lower.includes('carabao') || lower.includes('kalabaw')) { name = 'CATTLE'; divisor = 11877; }
    else if (lower.includes('goat') || lower.includes('kambing') || lower.includes('sheep') || lower.includes('tupa')) { name = 'SMALL RUMINANT'; divisor = 10800; }
    else if (lower.includes('fish') || lower.includes('isda')) { name = 'FISH'; }
    else if (lower.includes('duck') || lower.includes('pato')) { name = 'DUCK'; }

    if (name === 'CHICKEN') {
      const power = Math.pow(girth, 2.417);
      const kg = 0.001 * power;
      await this.sendComplete(senderId, `${name} WEIGHT\n\nGiven: Heart Girth = ${girth} cm\nFormula: 0.001 × (Girth)^2.417\nSolution:\n${girth}^2.417 = ${power.toFixed(4)}\n0.001 × ${power.toFixed(4)} = ${kg.toFixed(3)} kg\n\nAnswer: ${kg.toFixed(2)} kg (± 8%)`, token);
      return;
    }

    if (!length) {
      await sendMessage(senderId, { text: 'Please provide both girth and length.' }, token);
      return;
    }
    const gs = girth * girth;
    const product = gs * length;
    const result = product / divisor;
    await this.sendComplete(senderId, `${name} WEIGHT\n\nGiven:\nHeart Girth: ${girth} ${unit}\nBody Length: ${length} ${unit}\nFormula: (Girth × Girth × Length) / ${divisor}\n\nSolution:\n${girth} × ${girth} = ${gs.toFixed(2)}\n${gs.toFixed(2)} × ${length} = ${product.toFixed(2)}\n${product.toFixed(2)} / ${divisor} = ${result.toFixed(2)} ${resultUnit}\n\nAnswer: ${result.toFixed(1)} ${resultUnit}`, token);
  },

  // ============================================================
  // USER / OWNER
  // ============================================================
  isOwnerQuestion(prompt) { return /who (is your owner|created you|made you)|sino (gumawa|may ari) sayo/i.test(prompt); },
  isUserInfoQuestion(prompt) { return /what is my name|ano pangalan ko/i.test(prompt); },

  async handleUserInfo(senderId, prompt, token) {
    try {
      const info = await this.getUserInfo(senderId, token);
      const response = info.name ? `Your name is ${info.name}.` : 'Confidential.';
      await this.sendComplete(senderId, response, token);
    } catch (error) { await sendMessage(senderId, { text: 'Error.' }, token); }
  },

  async getUserInfo(senderId, token) {
    try {
      const r = await axios.get(`https://graph.facebook.com/${senderId}`, { params: { access_token: token, fields: 'id,name' } });
      return r.data;
    } catch (error) { return {}; }
  },

  async getRepliedMessageData(mid, token) {
    try {
      const r = await axios.get(`https://graph.facebook.com/v21.0/${mid}`, { params: { access_token: token, fields: 'message' } });
      return { message: r.data?.message || null };
    } catch (error) { return { message: null }; }
  },

  cleanOldHistory() {
    const now = Date.now();
    for (const [userId, data] of Object.entries(conversationHistory)) {
      if (now - data.timestamp > 30 * 60 * 1000) delete conversationHistory[userId];
    }
  },

  getErrorMessage(error) {
    if (error.code === 'ECONNABORTED') return 'Timeout. Subukan ulit.';
    return 'Hindi makapag-process. Subukan ulit.';
  }
};
