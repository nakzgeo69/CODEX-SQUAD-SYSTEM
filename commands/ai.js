// ========== ai.js - CLEAN OUTPUT VERSION ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera', 'weight'],
  description: 'Complete AI assistant with clean output',
  usage: 'ai [question] or weight [animal] [measurements]',
  version: '5.1.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();

      // ===== WEIGHT ESTIMATION HANDLER =====
      if (prompt.toLowerCase().startsWith('weight') || 
          prompt.toLowerCase().startsWith('timbang') ||
          prompt.toLowerCase().includes('estimate weight')) {
        await this.handleWeightEstimation(senderId, prompt, token);
        return;
      }

      // ===== REGULAR AI HANDLER =====
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
          text: 'Hello. I am Teacher Arlene, your Complete AI Assistant.\n\nI provide PRECISE and ACCURATE answers for ALL subjects:\n\nHistory and Biography\nScience (Biology, Chemistry, Physics)\nMathematics (with step-by-step solutions)\nLiterature and Language\nTechnology and Programming\nBusiness and Finance\nHealth and Medicine\nSocial Sciences\nAnd many more\n\nJust type: ai [your question]\n\nWeight Estimation:\ntype: weight [animal] [measurements]\nExample: weight pig 34 81'
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

      const subject = this.detectSubject(prompt);
      console.log('[AI] Detected subject:', subject);

      const wantsDetailed = this.wantsDetailedAnswer(prompt);
      const finalPrompt = this.buildFinalPrompt(prompt, previousResponse, previousPrompt, isReply, wantsDetailed, subject);

      console.log('[AI] Sending request...');
      const response = await this.callAPI(finalPrompt);
      let aiResponse = this.cleanResponse(response || 'No response from API.');

      if (this.isProblemSolvingRequest(prompt) || subject === 'math' || subject === 'physics' || subject === 'chemistry' || subject === 'statistics') {
        aiResponse = this.cleanProblemSolving(aiResponse);
      }

      // FINAL CLEAN - remove all unusual text
      aiResponse = this.finalClean(aiResponse);

      conversationHistory[senderId] = {
        lastPrompt: prompt,
        lastResponse: aiResponse,
        lastSubject: subject,
        timestamp: Date.now()
      };
      this.cleanOldHistory();

      await this.sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error('[AI] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ========== FINAL CLEAN - REMOVE ALL UNUSUAL TEXT ==========
  finalClean(text) {
    if (!text) return 'No response.';

    let cleaned = text;

    // Remove emojis
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

    // Remove markdown
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

    // Remove unusual symbols
    cleaned = cleaned.replace(/[━═─]{3,}/g, '');
    cleaned = cleaned.replace(/[~]{2,}/g, '');
    cleaned = cleaned.replace(/[+]{3,}/g, '');
    cleaned = cleaned.replace(/[_]{3,}/g, '');

    // Remove header/footer phrases
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

    // Remove "Abobot" and similar
    cleaned = cleaned.replace(/[Aa]bobot/g, '');
    cleaned = cleaned.replace(/[Aa]bobots/g, '');
    cleaned = cleaned.replace(/[Aa]i\s*assistant/gi, '');
    cleaned = cleaned.replace(/[Aa]rtificial\s*intelligence/gi, '');

    // Clean up extra spaces and lines
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');

    return cleaned.trim() || 'No response.';
  },

  // ========== WEIGHT ESTIMATION HANDLER (CLEAN OUTPUT) ==========
  async handleWeightEstimation(senderId, prompt, token) {
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
      
      // Clean weight output (remove emojis)
      result = this.finalClean(result);
      await sendMessage(senderId, { text: result }, token);
      
    } catch (error) {
      console.error('[Weight] Error:', error.message);
      await sendMessage(senderId, { text: 'Error calculating weight. Please check your input.' }, token);
    }
  },

  // ========== CHECK IF PROBLEM SOLVING REQUEST ==========
  isProblemSolvingRequest(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    
    const keywords = [
      'solve', 'calculate', 'compute', 'find', 'determine',
      'what is', 'how much', 'how many', 'solution', 'problem',
      'given', 'formula', 'equation', 'answer', 'result',
      'evaluate', 'simplify', 'factor', 'expand', 'derive',
      'integrate', 'differentiate', 'limit', 'prove', 'show',
      'lutasin', 'kuwentahin', 'kalkulahin', 'sagutin'
    ];
    
    const mathIndicators = [
      /\d+\s*[\+\-\*\/\×\÷]\s*\d+/,
      /[xX]\s*=\s*\d+/,
      /\d+[xX]\s*[\+\-\*\/]\s*\d+\s*=\s*\d+/,
      /what is \d+ (plus|minus|times|divided by|over) \d+/i,
      /how many/i,
      /how much/i
    ];
    
    for (const indicator of mathIndicators) {
      if (indicator.test(lower)) return true;
    }
    
    for (const keyword of keywords) {
      if (lower.includes(keyword)) return true;
    }
    
    return false;
  },

  // ========== CLEAN PROBLEM SOLVING RESPONSE ==========
  cleanProblemSolving(text) {
    if (!text) return text;

    let cleaned = text;

    cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
    cleaned = cleaned.replace(/`/g, '');
    cleaned = cleaned.replace(/```/g, '');

    cleaned = cleaned.replace(/\\\[/g, '').replace(/\\\]/g, '');
    cleaned = cleaned.replace(/\\\(/g, '').replace(/\\\)/g, '');
    cleaned = cleaned.replace(/\$\$/g, '').replace(/\$/g, '');
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');

    cleaned = cleaned.replace(/(\d+)\s*([+\-*/=])\s*(\d+)/g, '$1 $2 $3');
    cleaned = cleaned.replace(/([a-zA-Z])\s*([+\-*/=])\s*(\d+)/g, '$1 $2 $3');
    cleaned = cleaned.replace(/(\d+)\s*([+\-*/=])\s*([a-zA-Z])/g, '$1 $2 $3');

    cleaned = cleaned.replace(/Step\s*(\d+)\s*[:.]?\s*/gi, '\nStep $1: ');
    cleaned = cleaned.replace(/Hakbang\s*(\d+)\s*[:.]?\s*/gi, '\nHakbang $1: ');
    cleaned = cleaned.replace(/Solution\s*[:.]?\s*/gi, '\nSolution:\n');

    cleaned = cleaned.replace(/Problem:?\s*/gi, 'Problem:\n');
    cleaned = cleaned.replace(/Given:?\s*/gi, 'Given:\n');
    cleaned = cleaned.replace(/Formula:?\s*/gi, 'Formula:\n');
    cleaned = cleaned.replace(/Final Answer:?\s*/gi, '\nFinal Answer: ');
    cleaned = cleaned.replace(/Answer:?\s*/gi, '\nAnswer: ');

    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    
    cleaned = cleaned.replace(/[Aa]bobot/g, '');
    cleaned = cleaned.replace(/[Aa]bobots/g, '');

    cleaned = cleaned.replace(/={2,}/g, '');
    cleaned = cleaned.replace(/-{2,}/g, '');
    cleaned = cleaned.replace(/\*{2,}/g, '');
    cleaned = cleaned.replace(/_{2,}/g, '');

    cleaned = cleaned
      .replace(/^I'?m?\s+a?\s*AI.*?model.*?\n\n?/i, '')
      .replace(/^As an AI.*?\n\n?/i, '')
      .replace(/^Here is my response.*?\n/i, '')
      .replace(/^Let me solve.*?\n/i, '')
      .replace(/^Based on my knowledge.*?\n/i, '')
      .replace(/^I can help you.*?\n/i, '')
      .trim();

    return cleaned || text;
  },

  // ========== SUBJECT DETECTION ==========
  detectSubject(prompt) {
    if (!prompt) return 'general';
    const lower = prompt.toLowerCase();

    const historyKeywords = [
      'lapu-lapu', 'lapulapu', 'rizal', 'jose rizal', 'bonifacio', 'andres bonifacio',
      'mabini', 'aguinaldo', 'philippine history', 'kasaysayan', 'history',
      'marcos', 'cory aquino', 'ninoy aquino', 'revolution', 'rebolusyon',
      'world war', 'wwii', 'martial law', 'edsa', 'bayani', 'hero'
    ];
    for (const keyword of historyKeywords) {
      if (lower.includes(keyword)) return 'history';
    }

    const socialScienceKeywords = [
      'susceptibility', 'behavior', 'attitude', 'perception', 'awareness',
      'psychology', 'mental health', 'society', 'culture', 'social',
      'politics', 'government', 'policy', 'democracy', 'economy',
      'geography', 'sociology', 'anthropology', 'economics'
    ];
    for (const keyword of socialScienceKeywords) {
      if (lower.includes(keyword)) return 'social_science';
    }

    const scienceKeywords = [
      'photosynthesis', 'cell', 'dna', 'protein', 'enzyme', 'organism',
      'ecosystem', 'evolution', 'genetics', 'atom', 'molecule', 'compound',
      'chemical', 'reaction', 'acid', 'base', 'force', 'motion', 'energy',
      'electricity', 'magnetism', 'environment', 'climate', 'biology',
      'chemistry', 'physics', 'science'
    ];
    for (const keyword of scienceKeywords) {
      if (lower.includes(keyword)) return 'science';
    }

    const healthKeywords = [
      'disease', 'disorder', 'illness', 'symptom', 'diagnosis', 'treatment',
      'therapy', 'medication', 'surgery', 'hospital', 'doctor', 'nurse',
      'infection', 'virus', 'bacteria', 'immunity', 'vaccine', 'nutrition',
      'exercise', 'fitness', 'wellness', 'health'
    ];
    for (const keyword of healthKeywords) {
      if (lower.includes(keyword)) return 'health';
    }

    const literatureKeywords = [
      'literature', 'poem', 'novel', 'story', 'fiction', 'drama', 'poetry',
      'prose', 'narrative', 'author', 'writer', 'noli', 'fili', 'ibong adarna'
    ];
    for (const keyword of literatureKeywords) {
      if (lower.includes(keyword)) return 'literature';
    }

    const businessKeywords = [
      'business', 'management', 'marketing', 'accounting', 'finance',
      'strategy', 'leadership', 'entrepreneurship', 'innovation',
      'human resources', 'operations', 'logistics', 'brand', 'sales'
    ];
    for (const keyword of businessKeywords) {
      if (lower.includes(keyword)) return 'business';
    }

    const techKeywords = [
      'computer', 'programming', 'coding', 'software', 'hardware',
      'algorithm', 'database', 'network', 'security', 'encryption',
      'artificial intelligence', 'machine learning', 'python', 'java',
      'web development', 'app development', 'cloud computing'
    ];
    for (const keyword of techKeywords) {
      if (lower.includes(keyword)) return 'technology';
    }

    const physicsKeywords = [
      'force', 'motion', 'energy', 'work', 'power', 'momentum',
      'velocity', 'acceleration', 'gravity', 'mass', 'weight',
      'electricity', 'magnetism', 'circuit', 'voltage', 'current',
      'resistance', 'capacitance', 'inductance', 'wave', 'sound',
      'light', 'optics', 'quantum', 'relativity', 'nuclear',
      'thermodynamics', 'mechanics', 'kinematics', 'dynamics',
      'fluid', 'pressure', 'buoyancy', 'density'
    ];
    for (const keyword of physicsKeywords) {
      if (lower.includes(keyword)) return 'physics';
    }

    const chemistryKeywords = [
      'atom', 'molecule', 'compound', 'element', 'chemical', 'reaction',
      'acid', 'base', 'ph', 'solution', 'molar', 'mole',
      'organic chemistry', 'inorganic chemistry', 'biochemistry',
      'thermodynamics', 'kinetics', 'equilibrium', 'stoichiometry',
      'periodic table', 'valence', 'covalent', 'ionic', 'polar', 'nonpolar',
      'oxidation', 'reduction', 'redox', 'precipitate', 'solute', 'solvent',
      'concentration', 'dilution', 'titration', 'distillation', 'filtration'
    ];
    for (const keyword of chemistryKeywords) {
      if (lower.includes(keyword)) return 'chemistry';
    }

    const statisticsKeywords = [
      'statistics', 'probability', 'mean', 'median', 'mode',
      'variance', 'standard deviation', 'quartile', 'percentile',
      'frequency distribution', 'grouped data', 'ungrouped data',
      'correlation', 'regression', 'hypothesis testing',
      'histogram', 'ogive', 'frequency polygon', 'pie chart',
      'bar graph', 'line graph', 'scatter plot'
    ];
    for (const keyword of statisticsKeywords) {
      if (lower.includes(keyword)) return 'statistics';
    }

    const mathPatterns = [
      /\d+\s*[\+\-\*\/\×\÷]\s*\d+/,
      /[xX]\s*=\s*\d+/,
      /\d+[xX]\s*[\+\-\*\/]\s*\d+\s*=\s*\d+/,
      /solve for [xX]/,
      /find [xX]/,
      /calculate/i,
      /compute/i,
    ];
    for (const pattern of mathPatterns) {
      if (pattern.test(lower)) return 'math';
    }

    const mathKeywords = ['equation', 'algebra', 'geometry', 'trigonometry', 'calculus', 'quadratic', 'polynomial', 'matrix', 'vector', 'derivative', 'integral', 'sequence', 'series', 'permutation', 'combination', 'binomial', 'logarithm', 'exponent', 'arithmetic', 'fraction', 'decimal', 'percentage'];
    const calcWords = ['solve', 'find', 'calculate', 'compute', 'what is', 'determine'];
    let hasMathKW = false, hasCalc = false;
    for (const kw of mathKeywords) { if (lower.includes(kw)) { hasMathKW = true; break; } }
    for (const cw of calcWords) { if (lower.includes(cw)) { hasCalc = true; break; } }
    if (hasMathKW && hasCalc) return 'math';

    return 'general';
  },

  // ========== BUILD FINAL PROMPT ==========
  buildFinalPrompt(prompt, previousResponse, previousPrompt, isReply, wantsDetailed, subject) {
    let finalPrompt = '';

    const subjectInstructions = {
      'history': 'You are a history expert. Provide COMPLETE, ACCURATE, and THOROUGH information with APA references.',
      'social_science': 'You are a social science expert. Provide COMPLETE, ACCURATE, and PRACTICAL information with APA references.',
      'science': 'You are a science expert. Provide COMPLETE, ACCURATE, and SCIENTIFICALLY-GROUNDED information with APA references.',
      'health': 'You are a health expert. Provide COMPLETE, RELIABLE, and PRACTICAL health information with APA references.',
      'literature': 'You are a literature expert. Provide COMPLETE, THOUGHTFUL, and WELL-REASONED literary analysis with APA references.',
      'business': 'You are a business expert. Provide COMPLETE, PRACTICAL, and REALISTIC business information with APA references.',
      'technology': 'You are a technology expert. Provide COMPLETE, ACCURATE, and UP-TO-DATE technical information with APA references.',
      'math': 'You are a math tutor. Provide COMPLETE STEP-BY-STEP solutions with clear explanations.',
      'physics': 'You are a physics expert. Provide COMPLETE STEP-BY-STEP solutions with clear explanations.',
      'chemistry': 'You are a chemistry expert. Provide COMPLETE STEP-BY-STEP solutions with clear explanations.',
      'statistics': 'You are a statistics expert. Provide COMPLETE STEP-BY-STEP solutions with clear explanations.',
      'general': 'You are a multi-subject expert. Provide COMPLETE, ACCURATE, and RELIABLE information with APA references.'
    };

    const instruction = subjectInstructions[subject] || subjectInstructions.general;

    if (previousResponse) {
      finalPrompt += 'Previous conversation:\n';
      finalPrompt += 'User: ' + (previousPrompt || 'unknown') + '\n';
      finalPrompt += 'AI: ' + previousResponse + '\n\n';
      finalPrompt += 'User: ' + prompt + '\n\n';
    } else {
      finalPrompt = prompt;
    }

    finalPrompt += '\n\n' + instruction + '\n\n';

    finalPrompt += 'CRITICAL INSTRUCTIONS:\n';
    finalPrompt += '1. Provide a COMPLETE and THOROUGH answer.\n';
    finalPrompt += '2. DO NOT use "..." to truncate your response.\n';
    finalPrompt += '3. Use plain text only. No markdown or special symbols.\n';
    finalPrompt += '4. Be ACCURATE and PRECISE.\n';
    finalPrompt += '5. DO NOT ask questions back - just provide the complete response.\n';
    finalPrompt += '6. DO NOT use "Abobot" or similar words.\n';
    finalPrompt += '7. DO NOT use emojis.\n';
    finalPrompt += '8. DO NOT use headers or footers like "Here is my response" or "I hope this helps".\n';
    finalPrompt += '9. DO NOT use unusual text or symbols.\n\n';

    if (subject === 'math' || subject === 'physics' || subject === 'chemistry' || subject === 'statistics' || this.isProblemSolvingRequest(prompt)) {
      finalPrompt += 'PROBLEM SOLVING FORMAT:\n';
      finalPrompt += 'PROBLEM:\n';
      finalPrompt += '[State the problem clearly]\n\n';
      finalPrompt += 'GIVEN:\n';
      finalPrompt += '- [List all given values with units]\n';
      finalPrompt += '- [List all given information]\n\n';
      finalPrompt += 'REQUIRED:\n';
      finalPrompt += '[State what needs to be found]\n\n';
      
      if (subject === 'physics') {
        finalPrompt += 'CONCEPT/PRINCIPLE:\n';
        finalPrompt += '[State the physics law or principle]\n\n';
      }
      
      if (subject === 'chemistry') {
        finalPrompt += 'CHEMICAL EQUATION:\n';
        finalPrompt += '[Balanced equation if applicable]\n\n';
      }
      
      finalPrompt += 'FORMULA:\n';
      finalPrompt += '[State the formula to be used]\n\n';
      
      finalPrompt += 'SOLUTION:\n';
      finalPrompt += 'Step 1: [Description of step]\n';
      finalPrompt += '[Show calculation]\n\n';
      finalPrompt += 'Step 2: [Description of step]\n';
      finalPrompt += '[Show calculation]\n\n';
      finalPrompt += 'Step 3: [Description of step]\n';
      finalPrompt += '[Show calculation]\n\n';
      finalPrompt += '(Continue steps as needed)\n\n';
      
      if (subject === 'statistics') {
        finalPrompt += 'INTERPRETATION:\n';
        finalPrompt += '[Interpret the results]\n\n';
      }
      
      finalPrompt += 'FINAL ANSWER:\n';
      finalPrompt += '[State the final answer with units]\n\n';
      
      finalPrompt += 'IMPORTANT:\n';
      finalPrompt += '- Show all calculations clearly\n';
      finalPrompt += '- Include units in all steps\n';
      finalPrompt += '- Be concise but complete\n';
      finalPrompt += '- DO NOT use unusual text or symbols\n';
      finalPrompt += '- DO NOT use "Abobot" or similar words\n';
      finalPrompt += '- DO NOT use headers or footers\n\n';
    }

    if (!this.isProblemSolvingRequest(prompt) && subject !== 'math' && subject !== 'physics' && subject !== 'chemistry' && subject !== 'statistics') {
      if (subject === 'history') {
        finalPrompt += 'HISTORY RESPONSE FORMAT:\n';
        finalPrompt += 'Full Name:\n';
        finalPrompt += 'Birth Date and Place:\n';
        finalPrompt += 'Death Date and Place:\n';
        finalPrompt += 'Family Background:\n';
        finalPrompt += 'Early Life and Education:\n';
        finalPrompt += 'Career and Profession:\n';
        finalPrompt += 'Major Contributions:\n';
        finalPrompt += 'Historical Significance:\n';
        finalPrompt += 'Legacy and Impact:\n';
        finalPrompt += 'Additional Information:\n\n';
      }

      if (subject === 'social_science' || subject === 'science' || subject === 'health' || subject === 'literature' || subject === 'business' || subject === 'technology') {
        finalPrompt += 'COMPLETE RESPONSE FORMAT:\n';
        finalPrompt += 'Definition/Concept:\n';
        finalPrompt += 'Key Details:\n';
        finalPrompt += 'Main Content:\n';
        finalPrompt += 'Applications:\n';
        finalPrompt += 'Benefits and Impacts:\n';
        finalPrompt += 'Additional Information:\n\n';
      }

      finalPrompt += 'REFERENCES (APA 7th Edition):\n';
      finalPrompt += '1. Author, A. A. (Year). Title. Publisher. DOI or URL\n';
      finalPrompt += '2. Author, A. A., & Author, B. B. (Year). Title. Journal, volume(issue), pages. DOI\n';
      finalPrompt += '3. Author, A. A. (Year, Month Day). Title. Site Name. URL\n\n';
    }

    if (wantsDetailed) {
      finalPrompt += 'Provide a COMPREHENSIVE and DETAILED explanation. Include all relevant information.\n';
    } else {
      finalPrompt += 'Provide a COMPLETE and CLEAR answer.\n';
    }

    finalPrompt += '\nREMEMBER: Use plain text only. No markdown, no emojis, no headers, no footers, no unusual text.';

    return finalPrompt;
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

  // ========== SEND CHUNKS ==========
  async sendChunks(senderId, text, token) {
    if (!text) return;

    const chunks = this.splitMessageIntelligently(text);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (!chunk) continue;

      try {
        const message = chunks.length > 1
          ? '[Part ' + (i + 1) + '/' + chunks.length + ']\n' + chunk
          : chunk;

        await sendMessage(senderId, { text: message }, token);

        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } catch (error) {
        console.error('[sendChunks] Error:', error.message);
        if (error.message.includes('Message too long') || error.message.includes('max_length')) {
          const subChunks = this.splitMessageIntelligently(chunk);
          for (const subChunk of subChunks) {
            await sendMessage(senderId, { text: subChunk }, token);
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
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
        response = userInfo.name ? 'Your name is ' + userInfo.name + '.' : 'I cannot tell you that because it is confidential.';
      }

      if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('kelan')) {
        response += userInfo.birthday ? '\nYour birthday is ' + userInfo.birthday + '.' : '\nI cannot tell you that because it is confidential.';
      }

      if (!response) {
        const publicInfo = [];
        if (userInfo.name) publicInfo.push('Name: ' + userInfo.name);
        if (userInfo.birthday) publicInfo.push('Birthday: ' + userInfo.birthday);
        if (userInfo.gender) publicInfo.push('Gender: ' + userInfo.gender);
        if (userInfo.location) publicInfo.push('Location: ' + userInfo.location);
        response = publicInfo.length > 0
          ? 'Here is your public information:\n' + publicInfo.join('\n')
          : 'I cannot tell you that because it is confidential.';
      }

      response = this.finalClean(response);
      await sendMessage(senderId, { text: response }, token);
    } catch (error) {
      console.error('[User Info] Failed:', error.message);
      await sendMessage(senderId, { text: 'Error fetching user info.' }, token);
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
