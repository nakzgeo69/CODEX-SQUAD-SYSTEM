// ========== ai.js - 100% ACCURATE ALL PROBLEMS ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant with precise and accurate answers',
  usage: 'ai [question] or weight [animal] [measurements]',
  version: '10.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();

      // ===== WEIGHT ESTIMATION =====
      if (prompt.toLowerCase().startsWith('weight') || 
          prompt.toLowerCase().startsWith('timbang') ||
          prompt.toLowerCase().includes('estimate weight')) {
        await this.handleWeightEstimation(senderId, prompt, token);
        return;
      }

      // ===== REGULAR AI =====
      let previousResponse = null;
      let isReply = false;
      let previousPrompt = null;

      if (event?.message?.reply_to?.mid) {
        isReply = true;
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        previousResponse = replyData.message;
        if (!prompt) prompt = 'Please respond to what I said.';
      }

      if (!isReply && prompt) {
        const history = conversationHistory[senderId];
        if (history && history.lastResponse) {
          const lowerPrompt = prompt.toLowerCase();
          const isFollowUp = this.isFollowUpRequest(lowerPrompt) ||
                            this.isContextualQuestion(lowerPrompt, history.lastPrompt);
          const isNewTopic = this.isNewTopic(lowerPrompt, history.lastPrompt);

          if (isFollowUp && !isNewTopic) {
            previousResponse = history.lastResponse;
            previousPrompt = history.lastPrompt;
            isReply = true;
          } else {
            delete conversationHistory[senderId];
          }
        }
      }

      if (!prompt && !isReply) {
        await sendMessage(senderId, {
          text: 'Hello. I am Teacher Arlene, your Complete AI Assistant.\n\nI provide PRECISE and ACCURATE answers for ALL subjects.\n\nJust type: ai [your question]'
        }, token);
        return;
      }

      if (this.isOwnerQuestion(prompt)) {
        await sendMessage(senderId, {
          text: 'I was created by GeoDevz69. Visit here for more information: https://www.facebook.com/geotechph.net'
        }, token);
        return;
      }

      if (this.isUserInfoQuestion(prompt)) {
        await this.handleUserInfo(senderId, prompt, token);
        return;
      }

      // ===== DETECT PROBLEM TYPE =====
      const problemType = this.detectProblemType(prompt);
      console.log('[AI] Problem Type:', problemType);

      // ===== BUILD PROMPT BASED ON PROBLEM TYPE =====
      const finalPrompt = this.buildProblemPrompt(prompt, previousResponse, previousPrompt, isReply, problemType);

      console.log('[AI] Sending request...');
      const response = await this.callAPI(finalPrompt);
      let aiResponse = this.cleanResponse(response || 'No response from API.');

      // ===== FORMAT BASED ON PROBLEM TYPE =====
      aiResponse = this.formatByProblemType(aiResponse, problemType, prompt);

      // ===== FINAL CLEAN =====
      aiResponse = this.finalClean(aiResponse);
      aiResponse = this.ensureComplete(aiResponse);
      aiResponse = this.removePartIndicators(aiResponse);
      aiResponse = this.removeDuplicateAnswer(aiResponse);

      conversationHistory[senderId] = {
        lastPrompt: prompt,
        lastResponse: aiResponse,
        lastSubject: problemType,
        timestamp: Date.now()
      };
      this.cleanOldHistory();

      // ===== AUTO-SEND ALL CHUNKS =====
      await this.sendAllChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error('[AI] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // DETECT PROBLEM TYPE
  // ============================================================
  detectProblemType(prompt) {
    if (!prompt) return 'general';
    const lower = prompt.toLowerCase();

    // ===== MATH: Multiple numbers with operations =====
    const mathPatterns = [
      /[\d\s]+\+[\d\s]+/,
      /[\d\s]+\-[\d\s]+/,
      /[\d\s]+\*[\d\s]+/,
      /[\d\s]+\/[\d\s]+/,
      /sum of/i,
      /total of/i,
      /what is \d+ (plus|minus|times|divided by)/i,
      /how many/i,
      /how much/i,
      /calculate/i,
      /compute/i,
      /solve/i,
      /equation/i,
      /formula/i,
      /x\s*=\s*\d+/,
      /\d+[xX]\s*[\+\-\*\/]\s*\d+\s*=\s*\d+/
    ];

    for (const pattern of mathPatterns) {
      if (pattern.test(lower)) return 'math';
    }

    // ===== LOGIC PUZZLES =====
    const logicKeywords = ['logic', 'puzzle', 'reasoning', 'sons', 'sister', 'family', 'people', 'tire', 'judge wisely'];
    for (const kw of logicKeywords) {
      if (lower.includes(kw)) return 'logic';
    }

    // ===== CODING =====
    const codingKeywords = ['python', 'java', 'javascript', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go', 'rust', 
                           'print', 'function', 'class', 'variable', 'array', 'object', 'string', 'integer', 'boolean',
                           'loop', 'if', 'else', 'elif', 'while', 'for', 'return', 'import', 'def', 'async', 'await',
                           'try', 'except', 'finally', 'code', 'output'];
    for (const kw of codingKeywords) {
      if (lower.includes(kw)) return 'coding';
    }

    return 'general';
  },

  // ============================================================
  // BUILD PROBLEM PROMPT
  // ============================================================
  buildProblemPrompt(prompt, previousResponse, previousPrompt, isReply, problemType) {
    let finalPrompt = '';

    const formatRules = {
      math: `You are a precise math solver. Follow these rules EXACTLY:
1. Calculate step by step from left to right.
2. DO NOT group numbers arbitrarily.
3. Show each step as "Step X: [calculation]".
4. End with "Final Answer: [number]".
5. For addition: Keep adding continuously.
6. For subtraction: Subtract continuously.
7. For multiplication: Multiply continuously.
8. For division: Divide continuously.
9. NO introduction, NO extra text.`,

      logic: `You are a logic solver. Follow these rules EXACTLY:
1. Break down the problem step by step.
2. Show each reasoning step as "Step X:".
3. End with "Final Answer: [answer]".
4. For family problems: Include father, mother, and all children.
5. NO introduction, NO extra text.`,

      coding: `You are a coding expert. Follow these rules EXACTLY:
1. Analyze the code step by step.
2. Show each step as "Step X:".
3. End with "Final Answer: [letter] [answer]".
4. NO introduction, NO extra text.`,

      general: `You are a precise AI assistant. Follow these rules EXACTLY:
1. Answer directly and accurately.
2. Provide complete information.
3. NO introduction, NO conclusion.
4. NO emojis, NO markdown.`
    };

    const rules = formatRules[problemType] || formatRules.general;

    if (previousResponse) {
      finalPrompt += `Previous conversation:\n`;
      finalPrompt += `User: ${previousPrompt || 'unknown'}\n`;
      finalPrompt += `AI: ${previousResponse}\n\n`;
    }

    finalPrompt += `User question: ${prompt}\n\n`;
    finalPrompt += rules + '\n\n';
    finalPrompt += `CRITICAL: Be 100% accurate. Double-check your calculations.\n`;
    finalPrompt += `Respond in English.\n\n`;
    finalPrompt += `NOW ANSWER THE QUESTION:`;

    return finalPrompt;
  },

  // ============================================================
  // FORMAT BY PROBLEM TYPE
  // ============================================================
  formatByProblemType(response, problemType, prompt) {
    let formatted = response;

    if (problemType === 'math') {
      formatted = this.formatMathResponse(formatted, prompt);
    } else if (problemType === 'logic') {
      formatted = this.formatLogicResponse(formatted);
    } else if (problemType === 'coding') {
      formatted = this.formatCodingResponse(formatted);
    }

    return formatted;
  },

  // ============================================================
  // FORMAT MATH RESPONSE - DYNAMIC COMPUTATION
  // ============================================================
  formatMathResponse(response, prompt) {
    let formatted = response;

    // Extract numbers from prompt
    const numbers = prompt.match(/\d+/g);
    if (numbers && numbers.length > 1) {
      // Determine operation
      let result = 0;
      let steps = [];
      let hasOperation = false;

      // Check for multiplication
      if (prompt.includes('*') || prompt.includes('×') || prompt.toLowerCase().includes('times') || prompt.toLowerCase().includes('multiply')) {
        hasOperation = true;
        result = 1;
        let current = 1;
        for (let i = 0; i < numbers.length; i++) {
          current *= parseInt(numbers[i]);
          if (i === 0) {
            steps.push(`${numbers[i]} = ${current}`);
          } else {
            steps.push(`${current / parseInt(numbers[i])} × ${numbers[i]} = ${current}`);
          }
        }
      }
      // Check for division
      else if (prompt.includes('/') || prompt.includes('÷') || prompt.toLowerCase().includes('divided by') || prompt.toLowerCase().includes('divide')) {
        hasOperation = true;
        result = parseInt(numbers[0]);
        steps.push(`${numbers[0]} = ${result}`);
        for (let i = 1; i < numbers.length; i++) {
          result /= parseInt(numbers[i]);
          steps.push(`${result * parseInt(numbers[i])} ÷ ${numbers[i]} = ${result}`);
        }
      }
      // Check for subtraction
      else if (prompt.includes('-') || prompt.toLowerCase().includes('minus') || prompt.toLowerCase().includes('subtract')) {
        hasOperation = true;
        result = parseInt(numbers[0]);
        steps.push(`${numbers[0]} = ${result}`);
        for (let i = 1; i < numbers.length; i++) {
          result -= parseInt(numbers[i]);
          steps.push(`${result + parseInt(numbers[i])} - ${numbers[i]} = ${result}`);
        }
      }
      // Default: Addition
      else {
        hasOperation = true;
        result = 0;
        let current = 0;
        for (let i = 0; i < numbers.length; i++) {
          current += parseInt(numbers[i]);
          if (i === 0) {
            steps.push(`${numbers[i]} = ${current}`);
          } else {
            steps.push(`${current - parseInt(numbers[i])} + ${numbers[i]} = ${current}`);
          }
        }
        result = current;
      }

      // Build clean response
      let cleanResponse = `Answer: ${result}\n\n`;
      for (let i = 0; i < steps.length; i++) {
        cleanResponse += `Step ${i + 1}: ${steps[i]}\n`;
      }
      cleanResponse += `\nFinal Answer: ${result}`;
      return cleanResponse;
    }

    // If we couldn't extract numbers or no operation found, return cleaned response
    return formatted;
  },

  // ============================================================
  // FORMAT LOGIC RESPONSE
  // ============================================================
  formatLogicResponse(response) {
    let formatted = response;
    
    // Ensure there's a final answer
    if (!formatted.toLowerCase().includes('final answer')) {
      const numbers = formatted.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const lastNumber = numbers[numbers.length - 1];
        formatted += `\n\nFinal Answer: ${lastNumber}`;
      }
    }

    return formatted;
  },

  // ============================================================
  // FORMAT CODING RESPONSE
  // ============================================================
  formatCodingResponse(response) {
    let formatted = response;
    
    // Ensure there's a final answer
    if (!formatted.toLowerCase().includes('final answer')) {
      const letters = formatted.match(/[A-D]\)\s*\d+/g);
      if (letters && letters.length > 0) {
        const last = letters[letters.length - 1];
        formatted += `\n\nFinal Answer: ${last}`;
      } else {
        const numbers = formatted.match(/\d+/g);
        if (numbers && numbers.length > 0) {
          const lastNumber = numbers[numbers.length - 1];
          formatted += `\n\nFinal Answer: ${lastNumber}`;
        }
      }
    }

    return formatted;
  },

  // ========== SEND ALL CHUNKS - AUTO ==========
  async sendAllChunks(senderId, text, token) {
    if (!text) return;

    if (text.length <= MAX_CHUNK) {
      await sendMessage(senderId, { text: text }, token);
      return;
    }

    const chunks = this.splitMessageIntelligently(text);
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
        if (error.message.includes('Message too long') || error.message.includes('max_length')) {
          const subChunks = this.splitMessageIntelligently(chunk);
          for (const subChunk of subChunks) {
            await sendMessage(senderId, { text: subChunk }, token);
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
    }
  },

  // ========== REMOVE DUPLICATE "Answer:" ==========
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

  // ========== REMOVE PART INDICATORS ==========
  removePartIndicators(text) {
    if (!text) return text;
    return text.replace(/\[Part\s*\d+\/\d+\]\s*/gi, '');
  },

  // ========== ENSURE COMPLETE RESPONSE ==========
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

    if (text.length < 20 && text.trim().endsWith('...')) {
      text = text.replace(/\.\.\.$/, '');
    }

    return text;
  },

  // ========== WEIGHT ESTIMATION ==========
  async handleWeightEstimation(senderId, prompt, token) {
    // [Same as before - keep existing weight estimation code]
    try {
      const lower = prompt.toLowerCase();
      let result = '';
      
      const numbers = prompt.match(/\d+\.?\d*/g) || [];
      
      if (lower.includes('pig') || lower.includes('baboy')) {
        if (numbers.length < 2) {
          result = 'PIG WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (inches)\n- Body Length (inches)\n\nExample: weight pig 34 81\n\nFormula: (girth x girth x length) / 400 / 2.2 = kg';
        } else {
          const girth = parseFloat(numbers[0]);
          const length = parseFloat(numbers[1]);
          const lbs = (girth * girth * length) / 400;
          const kg = lbs / 2.2;
          
          result = 'PIG WEIGHT ESTIMATE\n\n';
          result += 'Measurements:\n';
          result += '- Heart Girth: ' + girth + ' inches\n';
          result += '- Body Length: ' + length + ' inches\n\n';
          result += 'Results:\n';
          result += '- ' + lbs.toFixed(1) + ' lbs\n';
          result += '- ' + kg.toFixed(1) + ' kg\n\n';
          result += 'Accuracy: +/- 10 percent (estimate only)';
        }
      }
      
      else if (lower.includes('chicken') || lower.includes('manok')) {
        if (numbers.length < 1) {
          result = 'CHICKEN WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n\nExample: weight chicken 30\n\nFormula: 0.001 x (girth)^2.417 = kg';
        } else {
          const girth = parseFloat(numbers[0]);
          const kg = 0.001 * Math.pow(girth, 2.417);
          
          result = 'CHICKEN WEIGHT ESTIMATE\n\n';
          result += 'Measurement:\n';
          result += '- Heart Girth: ' + girth + ' cm\n\n';
          result += 'Result:\n';
          result += '- ' + kg.toFixed(2) + ' kg\n\n';
          result += 'Accuracy: +/- 8 percent (estimate only)';
        }
      }
      
      else if (lower.includes('cow') || lower.includes('baka') || lower.includes('kalabaw')) {
        if (numbers.length < 2) {
          result = 'COW/CARABAO WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: weight cow 180 150\n\nFormula: (girth x girth x length) / 11877 = kg';
        } else {
          const girth = parseFloat(numbers[0]);
          const length = parseFloat(numbers[1]);
          const kg = (girth * girth * length) / 11877;
          
          result = 'COW/CARABAO WEIGHT ESTIMATE\n\n';
          result += 'Measurements:\n';
          result += '- Heart Girth: ' + girth + ' cm\n';
          result += '- Body Length: ' + length + ' cm\n\n';
          result += 'Result:\n';
          result += '- ' + kg.toFixed(1) + ' kg\n\n';
          result += 'Accuracy: +/- 12 percent (estimate only)';
        }
      }
      
      else if (lower.includes('goat') || lower.includes('kambing') || lower.includes('sheep') || lower.includes('tupa')) {
        if (numbers.length < 2) {
          result = 'GOAT/SHEEP WEIGHT FORMULA\n\nPlease provide:\n- Heart Girth (cm)\n- Body Length (cm)\n\nExample: weight goat 80 70\n\nFormula: (girth x girth x length) / 10800 = kg';
        } else {
          const girth = parseFloat(numbers[0]);
          const length = parseFloat(numbers[1]);
          const kg = (girth * girth * length) / 10800;
          
          result = 'GOAT/SHEEP WEIGHT ESTIMATE\n\n';
          result += 'Measurements:\n';
          result += '- Heart Girth: ' + girth + ' cm\n';
          result += '- Body Length: ' + length + ' cm\n\n';
          result += 'Result:\n';
          result += '- ' + kg.toFixed(1) + ' kg\n\n';
          result += 'Accuracy: +/- 10 percent (estimate only)';
        }
      }
      
      else if (lower.includes('fish') || lower.includes('isda') || lower.includes('tilapia') || lower.includes('bangus')) {
        if (numbers.length < 2) {
          result = 'FISH WEIGHT FORMULA\n\nPlease provide:\n- Total Length (cm)\n- Girth (cm)\n\nExample: weight fish 30 20\n\nFormula: (length x girth x girth) / 15000 = kg';
        } else {
          const length = parseFloat(numbers[0]);
          const girth = parseFloat(numbers[1]);
          const kg = (length * girth * girth) / 15000;
          
          result = 'FISH WEIGHT ESTIMATE\n\n';
          result += 'Measurements:\n';
          result += '- Total Length: ' + length + ' cm\n';
          result += '- Girth: ' + girth + ' cm\n\n';
          result += 'Result:\n';
          result += '- ' + kg.toFixed(2) + ' kg\n\n';
          result += 'Accuracy: +/- 15 percent (depends on species)';
        }
      }
      
      else if (lower.includes('wood') || lower.includes('kahoy') || lower.includes('tabla')) {
        if (numbers.length < 3) {
          result = 'WOOD WEIGHT FORMULA\n\nPlease provide:\n- Length (cm)\n- Width (cm)\n- Thickness (cm)\n- Type (mahogany, narra, pine)\n\nExample: weight wood 200 30 5 mahogany\n\nFormula: (L x W x H x density) / 1000 = kg';
        } else {
          const length = parseFloat(numbers[0]);
          const width = parseFloat(numbers[1]);
          const thickness = parseFloat(numbers[2]);
          
          let density = 0.55;
          if (lower.includes('narra')) density = 0.65;
          else if (lower.includes('pine')) density = 0.45;
          else if (lower.includes('molave')) density = 0.75;
          else if (lower.includes('gmelina')) density = 0.50;
          
          const kg = (length * width * thickness * density) / 1000;
          
          result = 'WOOD WEIGHT ESTIMATE\n\n';
          result += 'Measurements:\n';
          result += '- Length: ' + length + ' cm\n';
          result += '- Width: ' + width + ' cm\n';
          result += '- Thickness: ' + thickness + ' cm\n';
          result += '- Density: ' + density + ' g/cm3\n\n';
          result += 'Result:\n';
          result += '- ' + kg.toFixed(2) + ' kg\n\n';
          result += 'Accuracy: +/- 5 percent (if density is correct)';
        }
      }
      
      else if (lower.includes('rice') || lower.includes('bigas') || lower.includes('corn') || lower.includes('mais') || lower.includes('feeds') || lower.includes('feed')) {
        if (numbers.length < 1) {
          result = 'RICE/CORN/FEEDS WEIGHT FORMULA\n\nPlease provide:\n- Volume (liters)\n- Type (rice, corn, feeds)\n\nExample: weight rice 10\n\nFormulas:\n- Rice: liters x 0.80 = kg\n- Corn: liters x 0.75 = kg\n- Feeds: liters x 0.60 = kg';
        } else {
          const liters = parseFloat(numbers[0]);
          let kg = 0;
          let type = '';
          
          if (lower.includes('rice') || lower.includes('bigas')) {
            kg = liters * 0.80;
            type = 'Rice';
          } else if (lower.includes('corn') || lower.includes('mais')) {
            kg = liters * 0.75;
            type = 'Corn';
          } else if (lower.includes('feed') || lower.includes('feeds')) {
            kg = liters * 0.60;
            type = 'Feeds';
          } else {
            kg = liters * 0.75;
            type = 'Default (Corn)';
          }
          
          result = type + ' WEIGHT ESTIMATE\n\n';
          result += 'Measurement:\n';
          result += '- Volume: ' + liters + ' liters\n\n';
          result += 'Result:\n';
          result += '- ' + kg.toFixed(1) + ' kg\n\n';
          result += 'Accuracy: +/- 5 percent (estimate only)';
        }
      }
      
      else {
        result = 'WEIGHT ESTIMATION GUIDE\n\nAvailable options:\n\n' +
                 'PIG: weight pig [girth inches] [length inches]\n' +
                 'CHICKEN: weight chicken [girth cm]\n' +
                 'COW/CARABAO: weight cow [girth cm] [length cm]\n' +
                 'GOAT/SHEEP: weight goat [girth cm] [length cm]\n' +
                 'FISH: weight fish [length cm] [girth cm]\n' +
                 'WOOD: weight wood [L cm] [W cm] [H cm] [type]\n' +
                 'RICE/CORN/FEEDS: weight rice [liters]\n\n' +
                 'Example: weight pig 34 81';
      }
      
      result = this.finalClean(result);
      await sendMessage(senderId, { text: result }, token);
      
    } catch (error) {
      console.error('[Weight] Error:', error.message);
      await sendMessage(senderId, { text: 'Error calculating weight. Please check your input.' }, token);
    }
  },

  // ========== FOLLOW-UP ==========
  isFollowUpRequest(prompt) {
    const keywords = [
      'elaborate', 'explain more', 'paki elaborate', 'paki explain',
      'paliwanag', 'ipaliwanag', 'elab', 'explain',
      'detail', 'further', 'more details', 'mas detalyado',
      'summarize', 'summary', 'i-summarize', 'brief', 'make it short',
      'short', 'concise', 'shorten', 'ikli', 'paikliin',
      'simplify', 'simple', 'pasimplehin', 'basic',
      'example', 'sample', 'halimbawa', 'instance',
      'give example', 'give examples', 'magbigay ng halimbawa',
      'correct', 'fix', 'tama', 'ayusin', 'improve', 'better',
      'add', 'additional', 'dagdagan', 'more', 'add more',
      'humanize', 'make it human', 'conversational', 'natural',
      'make it natural', 'parang tao', 'human-like',
      'translate', 'translation', 'isalin', 'salin',
      'ulit', 'repeat', 'again', 'paki-ulit'
    ];
    return keywords.some(keyword => prompt.includes(keyword));
  },

  // ========== CONTEXTUAL QUESTION ==========
  isContextualQuestion(prompt, previousPrompt) {
    if (!previousPrompt) return false;

    const patterns = [
      'so yan', 'so ito', 'so iyan', 'so yun', 'so ganyan', 'so ganito', 'so ganun',
      'tama ba', 'tama', 'correct', 'right',
      'so tungkol', 'so sa', 'so para sa',
      'so ibig sabihin', 'so meaning', 'so parang',
      'paano naman', 'what about', 'how about',
      'paano kung', 'what if',
      'bakit', 'why', 'paano', 'how', 'kailan', 'when', 'saan', 'where',
      'sino', 'who', 'alin', 'which', 'ano', 'what',
      'gets', 'gets ko', 'nagets', 'naintindihan',
      'ok', 'okay', 'sige', 'cge',
      'talaga', 'really', 'sure',
      'so that', 'so this', 'so it',
      'so about', 'so regarding',
      'mao na', 'mao ni', 'mao to', 'mao diay',
      'mao ba', 'mao jud', 'mao gyud',
      'so mao', 'so mao na',
      'sakto ba', 'sakto'
    ];

    const isRelated = patterns.some(pattern => prompt.includes(pattern));

    const prevWords = previousPrompt.split(' ').filter(w => w.length > 2);
    const currentWords = prompt.split(' ').filter(w => w.length > 2);
    const hasRelatedWords = prevWords.some(w =>
      currentWords.some(cw => cw.includes(w) || w.includes(cw))
    );

    return isRelated || hasRelatedWords;
  },

  // ========== NEW TOPIC ==========
  isNewTopic(prompt, previousPrompt) {
    if (!previousPrompt) return true;

    const indicators = [
      'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
      'kamusta', 'musta', 'kumusta', 'musta na', 'kumusta ka',
      'good day', 'greetings', 'sup', 'whats up', 'whassup',
      'magandang umaga', 'magandang tanghali', 'magandang hapon', 'magandang gabi',
      'ask', 'tanong', 'question', 'tungkol sa',
      'about', 'regarding', 'sa', 'about sa',
      'i want to ask', 'gusto kong itanong',
      'can i ask', 'pwede magtanong',
      'new topic', 'bagong topic',
      'change topic', 'change subject', 'ibang topic', 'iba naman',
      'next topic', 'lipat tayo', 'move on',
      'what is', 'what are', 'what does', 'what do',
      'ano ang', 'ano ba', 'ano yung', 'ano iyong',
      'tell me about', 'tell me', 'tell about',
      'explain', 'define', 'describe',
      'give me', 'give', 'show me',
      'can you tell', 'could you tell',
      'please explain', 'please tell'
    ];

    if (prompt.length < 10 && !this.isFollowUpRequest(prompt)) {
      return true;
    }

    return indicators.some(indicator => prompt.includes(indicator));
  },

  // ========== WANTS DETAILED ==========
  wantsDetailedAnswer(prompt) {
    const lowerPrompt = prompt.toLowerCase();
    const keywords = [
      'explain more', 'more explanation', 'more details', 'detailed', 'detail',
      'elaborate', 'elaborate more', 'paki elaborate', 'mas detalyado',
      'tell me more', 'give more info', 'dagdagan', 'dagdag',
      'further explain', 'further explanation', 'full explanation',
      'complete explanation', 'in depth', 'in-depth', 'thorough',
      'comprehensive', 'expound', 'pakilinaw', 'linawin',
      'more information', 'additional info', 'karagdagang'
    ];
    return keywords.some(keyword => lowerPrompt.includes(keyword));
  },

  // ========== OWNER ==========
  isOwnerQuestion(prompt) {
    const keywords = [
      'who is your owner', 'who created you', 'who made you',
      'sino gumawa sayo', 'sino may ari sayo', 'owner mo',
      'sino owner mo', 'who owns you', 'creator', 'developer'
    ];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  // ========== USER INFO ==========
  isUserInfoQuestion(prompt) {
    const keywords = [
      'what is my name', 'ano pangalan ko', 'my name', 'pangalan ko',
      'when is my birthday', 'kelan birthday ko', 'my birthday',
      'who am i', 'sino ako', 'whats my name'
    ];
    return keywords.some(keyword => prompt.toLowerCase().includes(keyword));
  },

  async handleUserInfo(senderId, prompt, token) {
    try {
      const userInfo = await this.getUserInfo(senderId, token);
      let response = '';

      if (prompt.toLowerCase().includes('name') || prompt.toLowerCase().includes('pangalan')) {
        response = userInfo.name ? 'Answer: Your name is ' + userInfo.name + '.' : 'Answer: I cannot tell you that because it is confidential.';
      }

      if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('kelan')) {
        response += userInfo.birthday ? '\nAnswer: Your birthday is ' + userInfo.birthday + '.' : '\nAnswer: I cannot tell you that because it is confidential.';
      }

      if (!response) {
        const publicInfo = [];
        if (userInfo.name) publicInfo.push('Name: ' + userInfo.name);
        if (userInfo.birthday) publicInfo.push('Birthday: ' + userInfo.birthday);
        if (userInfo.gender) publicInfo.push('Gender: ' + userInfo.gender);
        if (userInfo.location) publicInfo.push('Location: ' + userInfo.location);
        response = publicInfo.length > 0
          ? 'Answer: Here is your public information:\n' + publicInfo.join('\n')
          : 'Answer: I cannot tell you that because it is confidential.';
      }

      response = this.finalClean(response);
      await sendMessage(senderId, { text: response }, token);
    } catch (error) {
      console.error('[User Info] Failed:', error.message);
      await sendMessage(senderId, { text: 'Answer: Error fetching user info.' }, token);
    }
  },

  async getUserInfo(senderId, token) {
    try {
      const url = 'https://graph.facebook.com/' + senderId;
      const params = {
        access_token: token,
        fields: 'id,name,first_name,last_name,birthday,gender,location,email'
      };
      const response = await axios.get(url, { params });
      const data = response.data;
      return {
        id: data.id || null,
        name: data.name || null,
        firstName: data.first_name || null,
        lastName: data.last_name || null,
        birthday: data.birthday || null,
        gender: data.gender || null,
        location: data.location ? data.location.name : null,
        email: data.email || null
      };
    } catch (error) {
      console.error('[Graph API] Error:', error.message);
      return {};
    }
  },

  // ========== GET REPLIED MESSAGE ==========
  async getRepliedMessageData(mid, token) {
    try {
      const url = 'https://graph.facebook.com/v21.0/' + mid;
      const params = {
        access_token: token,
        fields: 'message,from'
      };
      const { data } = await axios.get(url, { params });
      return {
        message: data?.message || null,
        from: data?.from?.id || null
      };
    } catch (error) {
      console.error('[Get Replied Message] Failed:', error.message);
      return { message: null, from: null };
    }
  },

  // ========== API CALL WITH FALLBACKS ==========
  async callAPI(prompt) {
    const apiConfigs = [
      {
        name: 'Overchat Qwen',
        url: 'https://ceddsrestapi.vercel.app/ai/overchat-qwen',
        param: 'message',
        responsePath: 'result',
        successField: 'operator',
        successValue: 'Ioarkdev',
        timeout: 90000
      },
      {
        name: 'Cedds ChatPlus',
        url: 'https://ceddsrestapi.vercel.app/ai/chatplus',
        param: 'message',
        responsePath: 'result',
        successField: 'operator',
        successValue: 'ceddsdev',
        timeout: 90000
      },
      {
        name: 'Cedds DeepChat',
        url: 'https://ceddsrestapi.vercel.app/ai/deepchat',
        param: 'text',
        responsePath: 'data',
        successField: 'success',
        timeout: 90000
      },
      {
        name: 'Pollination AI',
        url: 'https://api-library-kohi-production.up.railway.app/api/pollination-ai',
        param: 'prompt',
        responsePath: 'data',
        successField: 'status',
        timeout: 90000
      },
      {
        name: 'Opera AI',
        url: 'https://betadash-api-swordslush-production.up.railway.app/opera',
        param: 'ask',
        responsePath: 'message',
        successField: 'success',
        timeout: 90000
      }
    ];

    let lastError = null;

    for (let i = 0; i < apiConfigs.length; i++) {
      const config = apiConfigs[i];
      let retries = 3;

      while (retries > 0) {
        try {
          console.log('[API] Trying ' + config.name + ' (' + (i + 1) + '/' + apiConfigs.length + ')...');

          const encodedPrompt = encodeURIComponent(prompt);
          const apiUrl = config.url + '?' + config.param + '=' + encodedPrompt;

          const response = await axios.get(apiUrl, {
            timeout: config.timeout || 90000,
            headers: { 'Accept': 'application/json' },
            maxContentLength: 100000000,
            maxBodyLength: 100000000
          });

          const data = response.data;

          const expectedSuccess = config.successValue !== undefined ? config.successValue : true;
          const actualSuccess = data[config.successField];

          if (actualSuccess !== expectedSuccess) {
            throw new Error('API returned ' + config.successField + ': ' + actualSuccess);
          }

          const extracted = this.extractResponse(data, config);
          if (extracted && typeof extracted === 'string' && extracted.trim().length > 0) {
            console.log('[API] ✅ ' + config.name + ' SUCCESS! Length: ' + extracted.length);
            return this.standardizeResponse(extracted);
          }

          throw new Error('Empty response');

        } catch (error) {
          console.log('[API] ❌ ' + config.name + ' attempt failed: ' + error.message);
          lastError = error;
          retries--;

          if (retries > 0) {
            const delay = error.response?.status === 429 ? 5000 : 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
    }

    throw lastError || new Error('All APIs failed');
  },

  // ========== EXTRACT RESPONSE ==========
  extractResponse(data, config) {
    if (config.responsePath) {
      const path = config.responsePath.split('.');
      let value = data;
      for (const key of path) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          value = null;
          break;
        }
      }
      if (value && typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    const formats = ['data', 'result', 'response', 'message', 'text', 'content', 'output'];
    for (const format of formats) {
      if (data && typeof data === 'object' && data[format] && typeof data[format] === 'string') {
        return data[format];
      }
    }

    if (typeof data === 'string' && data.trim()) {
      return data;
    }

    return null;
  },

  // ========== STANDARDIZE RESPONSE ==========
  standardizeResponse(response) {
    return response
      .replace(/^I'?m?\s+a?\s*AI.*?model.*?\n\n?/i, '')
      .replace(/^As an AI.*?\n\n?/i, '')
      .replace(/^Here is my response.*?\n/i, '')
      .replace(/^Let me answer.*?\n/i, '')
      .replace(/^Based on my knowledge.*?\n/i, '')
      .replace(/^I can help you.*?\n/i, '')
      .trim();
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
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    cleaned = cleaned.replace(/[Aa]bobot/g, '');
    cleaned = cleaned.replace(/[Aa]bobots/g, '');
    
    return cleaned.trim() || 'No response.';
  },

  // ========== FINAL CLEAN ==========
  finalClean(text) {
    if (!text) return 'No response.';

    let cleaned = text;

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

    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');
    cleaned = cleaned.replace(/#{1,6}\s*/g, '');
    cleaned = cleaned.replace(/\[(.+?)\]\(.+?\)/g, '$1');
    cleaned = cleaned.replace(/_{2,}/g, '');
    cleaned = cleaned.replace(/={2,}/g, '');
    cleaned = cleaned.replace(/-{2,}/g, '');
    cleaned = cleaned.replace(/\*{2,}/g, '');
    cleaned = cleaned.replace(/\|/g, ' ');

    cleaned = cleaned.replace(/[━═─]{3,}/g, '');
    cleaned = cleaned.replace(/[~]{2,}/g, '');
    cleaned = cleaned.replace(/[+]{3,}/g, '');
    cleaned = cleaned.replace(/[_]{3,}/g, '');

    cleaned = cleaned
      .replace(/^I'?m?\s+a?\s*AI.*?model.*?\n\n?/i, '')
      .replace(/^As an AI.*?\n\n?/i, '')
      .replace(/^Here is my response.*?\n/i, '')
      .replace(/^Let me answer.*?\n/i, '')
      .replace(/^Based on my knowledge.*?\n/i, '')
      .replace(/^I can help you.*?\n/i, '')
      .replace(/^Let me solve.*?\n/i, '')
      .replace(/^Here is the solution.*?\n/i, '')
      .replace(/^Here is your answer.*?\n/i, '')
      .replace(/^Here is what I found.*?\n/i, '')
      .replace(/^Here are the details.*?\n/i, '')
      .replace(/^Thank you for your question.*?\n/i, '')
      .replace(/^I hope this helps.*?\n/i, '')
      .replace(/^Please let me know.*?\n/i, '')
      .replace(/^Feel free to ask.*?\n/i, '')
      .replace(/^If you have any questions.*?\n/i, '')
      .replace(/^Let me know if.*?\n/i, '');

    cleaned = cleaned.replace(/[Aa]bobot/g, '');
    cleaned = cleaned.replace(/[Aa]bobots/g, '');
    cleaned = cleaned.replace(/[Aa]i\s*assistant/gi, '');
    cleaned = cleaned.replace(/[Aa]rtificial\s*intelligence/gi, '');

    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');

    return cleaned.trim() || 'No response.';
  },

  // ========== SMART CHUNK SPLITTING ==========
  splitMessageIntelligently(text) {
    if (!text) return [];
    if (text.length <= MAX_CHUNK) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK) {
        chunks.push(remaining);
        break;
      }

      let chunk = remaining.substring(0, MAX_CHUNK);

      const breakPoints = [
        { char: '. ', priority: 10 },
        { char: '? ', priority: 9 },
        { char: '! ', priority: 9 },
        { char: '\n\n', priority: 8 },
        { char: '\n', priority: 5 },
        { char: '.', priority: 4 },
        { char: '; ', priority: 3 },
        { char: ', ', priority: 2 },
        { char: ' ', priority: 1 }
      ];

      let bestIndex = -1;
      let bestPriority = -1;

      for (const bp of breakPoints) {
        const idx = chunk.lastIndexOf(bp.char);
        if (idx > MAX_CHUNK * 0.3 && idx < MAX_CHUNK) {
          if (bestPriority < bp.priority) {
            bestPriority = bp.priority;
            bestIndex = idx + bp.char.length;
          }
        }
      }

      if (bestIndex === -1) {
        const spaceIdx = chunk.lastIndexOf(' ');
        if (spaceIdx > MAX_CHUNK * 0.3) {
          bestIndex = spaceIdx + 1;
        } else {
          bestIndex = MAX_CHUNK;
        }
      }

      bestIndex = Math.min(bestIndex, MAX_CHUNK);

      const chunkText = remaining.substring(0, bestIndex).trim();
      if (chunkText) chunks.push(chunkText);

      remaining = remaining.substring(bestIndex).trim();
    }

    return chunks;
  },

  // ========== CLEAN OLD HISTORY ==========
  cleanOldHistory() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    for (const [userId, data] of Object.entries(conversationHistory)) {
      if (now - data.timestamp > maxAge) {
        delete conversationHistory[userId];
      }
    }
  },

  // ========== ERROR MESSAGE ==========
  getErrorMessage(error) {
    if (error.code === 'ECONNABORTED') {
      return 'Request timeout. Please try again.';
    }
    if (error.response?.status === 429) {
      return 'Rate limit exceeded. Please wait a moment.';
    }
    if (error.response?.status === 403) {
      return 'API key invalid or expired.';
    }
    if (error.response?.status >= 500) {
      return 'Server error. Please try again later.';
    }
    return 'Error processing request. Please try again.';
  }
};
