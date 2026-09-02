// ========== ai.js - COMPLETE ALL TOPICS ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};

module.exports = {
  name: ['ai', 'ask', 'chat', 'answer', 'opera'],
  description: 'AI assistant for all subjects with reliable and accurate answers',
  usage: 'ai [question]',
  version: '3.3.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let previousResponse = null;
      let isReply = false;
      let previousPrompt = null;

      if (event?.message?.reply_to?.mid) {
        isReply = true;
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        previousResponse = replyData.message;
        if (!prompt) {
          prompt = 'Please respond to what I said.';
        }
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
          text: 'Hello. I am Teacher Arlene, your AI Assistant.\n\nI can help you with:\n- Science\n- Math\n- History\n- Literature\n- Technology\n- Business\n- Health\n- Social Sciences\n- Arts\n- Philosophy\n- And many more!\n\nJust type: ai [your question]'
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

      // ===== DETECT SUBJECT =====
      const subject = this.detectSubject(prompt);
      console.log('[AI] Detected subject:', subject);

      const wantsDetailed = this.wantsDetailedAnswer(prompt);
      const finalPrompt = this.buildFinalPrompt(prompt, previousResponse, previousPrompt, isReply, wantsDetailed, subject);

      console.log('[AI] Sending request: ' + prompt.substring(0, 50) + '...');
      const response = await this.callAPI(finalPrompt);
      let aiResponse = this.cleanResponse(response || 'No response from API.');

      // ===== CLEAN MATH SOLUTIONS (only if subject is math) =====
      if (subject === 'math') {
        aiResponse = this.cleanMathSolution(aiResponse);
      }

      // ===== SAVE HISTORY =====
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

  // ========== COMPLETE SUBJECT DETECTION ==========
  detectSubject(prompt) {
    if (!prompt) return 'general';
    const lower = prompt.toLowerCase();

    // ===== SOCIAL SCIENCES =====
    const socialScienceKeywords = [
      'susceptibility', 'behavior', 'attitude', 'perception', 'awareness',
      'knowledge', 'practice', 'belief', 'opinion', 'view', 'perspective',
      'psychology', 'mental health', 'stress', 'anxiety', 'depression',
      'personality', 'cognition', 'emotion', 'motivation', 'learning',
      'society', 'culture', 'social', 'community', 'institution',
      'social structure', 'social change', 'social movement',
      'socialization', 'deviance', 'norm', 'value', 'belief',
      'class', 'status', 'role', 'group', 'organization',
      'demography', 'urbanization', 'globalization',
      'politics', 'government', 'policy', 'democracy', 'power',
      'state', 'nation', 'sovereignty', 'authority', 'governance',
      'law', 'constitution', 'legislation', 'justice', 'rights',
      'freedom', 'equality', 'participation', 'election',
      'economy', 'market', 'trade', 'finance', 'investment',
      'inflation', 'unemployment', 'growth', 'development',
      'supply', 'demand', 'price', 'competition', 'monopoly',
      'geography', 'map', 'region', 'climate', 'terrain',
      'population', 'migration', 'urban', 'rural', 'land',
      'history', 'ancient', 'medieval', 'modern', 'civilization',
      'empire', 'kingdom', 'revolution', 'war', 'peace',
      'colonial', 'postcolonial', 'renaissance', 'enlightenment',
      'pag-uugali', 'aspeto', 'kultura', 'lipunan', 'pamayanan',
      'kalusugan', 'sakit', 'gagamot', 'paggamot', 'gamot',
      'sosyal', 'sikolohiya', 'sociology',
      // Political Science
      'democracy', 'dictatorship', 'monarchy', 'oligarchy', 'theocracy',
      'communism', 'socialism', 'capitalism', 'fascism', 'anarchism',
      'constitution', 'bill of rights', 'human rights', 'civil rights',
      'legislative', 'executive', 'judicial', 'separation of powers',
      'checks and balances', 'federalism', 'unitary', 'sovereignty',
      'diplomacy', 'foreign policy', 'international relations',
      'geopolitics', 'treaty', 'alliance', 'sanction', 'embargo',
      // Economics
      'microeconomics', 'macroeconomics', 'elasticity', 'scarcity',
      'opportunity cost', 'comparative advantage', 'absolute advantage',
      'balance of trade', 'gdp', 'gnp', 'fiscal policy', 'monetary policy',
      'central bank', 'interest rate', 'exchange rate', 'tariff',
      'quota', 'subsidy', 'tax', 'deficit', 'debt', 'recession', 'depression',
      'market failure', 'externality', 'public good', 'free rider'
    ];

    for (const keyword of socialScienceKeywords) {
      if (lower.includes(keyword)) {
        return 'social_science';
      }
    }

    // ===== SCIENCE (Biology, Chemistry, Physics, Environmental) =====
    const scienceKeywords = [
      // Biology
      'cell', 'dna', 'rna', 'protein', 'enzyme', 'organism', 'species',
      'ecosystem', 'habitat', 'biodiversity', 'evolution', 'genetics',
      'photosynthesis', 'respiration', 'reproduction', 'metabolism',
      'biochemistry', 'microbiology', 'botany', 'zoology', 'anatomy',
      'physiology', 'pathology', 'immunology', 'neuroscience',
      'mitosis', 'meiosis', 'chromosome', 'gene', 'allele', 'mutation',
      'natural selection', 'speciation', 'extinction', 'adaptation',
      'symbiosis', 'mutualism', 'parasitism', 'commensalism', 'predation',
      'food chain', 'food web', 'trophic level', 'biomass', 'energy flow',
      // Chemistry
      'atom', 'molecule', 'compound', 'element', 'chemical', 'reaction',
      'acid', 'base', 'ph', 'solution', 'molar', 'mole',
      'organic chemistry', 'inorganic chemistry', 'biochemistry',
      'thermodynamics', 'kinetics', 'equilibrium', 'stoichiometry',
      'periodic table', 'valence', 'covalent', 'ionic', 'polar', 'nonpolar',
      'oxidation', 'reduction', 'redox', 'precipitate', 'solute', 'solvent',
      'concentration', 'dilution', 'titration', 'distillation', 'filtration',
      // Physics
      'force', 'motion', 'energy', 'work', 'power', 'momentum',
      'velocity', 'acceleration', 'gravity', 'mass', 'weight',
      'electricity', 'magnetism', 'circuit', 'voltage', 'current',
      'resistance', 'capacitance', 'inductance', 'wave', 'sound',
      'light', 'optics', 'quantum', 'relativity', 'nuclear',
      'thermodynamics', 'mechanics', 'kinematics', 'dynamics',
      'fluid', 'pressure', 'buoyancy', 'density', 'viscosity',
      'newton', 'joule', 'watt', 'ampere', 'volt', 'ohm', 'hertz',
      // Environmental Science
      'environment', 'climate', 'pollution', 'sustainability',
      'conservation', 'biodiversity', 'ecosystem', 'renewable',
      'energy', 'waste', 'recycling', 'carbon', 'emission',
      'deforestation', 'global warming', 'climate change', 'greenhouse effect',
      'ozone layer', 'acid rain', 'eutrophication', 'desertification',
      'brownfield', 'superfund', 'environmental impact assessment'
    ];

    for (const keyword of scienceKeywords) {
      if (lower.includes(keyword)) {
        return 'science';
      }
    }

    // ===== HEALTH AND MEDICINE =====
    const healthKeywords = [
      'disease', 'disorder', 'illness', 'condition', 'symptom',
      'diagnosis', 'treatment', 'therapy', 'medication', 'drug',
      'surgery', 'hospital', 'clinic', 'doctor', 'nurse',
      'patient', 'infection', 'virus', 'bacteria', 'immunity',
      'chronic', 'acute', 'prevention', 'screening', 'vaccine',
      'nutrition', 'exercise', 'fitness', 'wellness', 'health',
      'epidemiology', 'pathogen', 'antibiotic', 'antiviral', 'analgesic',
      'inflammation', 'allergy', 'autoimmune', 'genetic disorder',
      'cardiovascular', 'respiratory', 'digestive', 'neurological',
      'mental health', 'psychiatry', 'psychotherapy', 'counseling',
      'first aid', 'emergency', 'paramedic', 'ambulance', 'trauma',
      'maternity', 'pediatrics', 'geriatrics', 'gerontology', 'hospice'
    ];

    for (const keyword of healthKeywords) {
      if (lower.includes(keyword)) {
        return 'health';
      }
    }

    // ===== HUMANITIES (Literature, Philosophy, Arts) =====
    const humanitiesKeywords = [
      // Literature
      'literature', 'poem', 'novel', 'story', 'fiction', 'drama',
      'poetry', 'prose', 'narrative', 'character', 'theme',
      'symbolism', 'metaphor', 'allegory', 'irony', 'sarcasm',
      'author', 'writer', 'novelist', 'poet', 'dramatist',
      'literary criticism', 'structuralism', 'postmodernism',
      // Philosophy
      'philosophy', 'ethics', 'logic', 'metaphysics', 'epistemology',
      'moral', 'virtue', 'justice', 'knowledge', 'truth',
      'existence', 'consciousness', 'free will', 'determinism',
      'ancient philosophy', 'modern philosophy', 'political philosophy',
      'socrates', 'plato', 'aristotle', 'kant', 'nietzsche', 'sartre',
      'existentialism', 'phenomenology', 'pragmatism', 'analytic',
      // Arts
      'painting', 'drawing', 'sculpture', 'photography', 'art',
      'artist', 'gallery', 'museum', 'exhibition', 'artwork',
      'abstract', 'realism', 'impressionism', 'cubism', 'surrealism',
      'music', 'composer', 'orchestra', 'symphony', 'concert',
      'dance', 'choreography', 'ballet', 'modern dance',
      'theater', 'acting', 'stage', 'performance', 'directing',
      'film', 'cinema', 'director', 'cinematography', 'editing'
    ];

    for (const keyword of humanitiesKeywords) {
      if (lower.includes(keyword)) {
        return 'humanities';
      }
    }

    // ===== BUSINESS =====
    const businessKeywords = [
      'business', 'management', 'marketing', 'accounting', 'finance',
      'strategy', 'leadership', 'entrepreneurship', 'innovation',
      'human resources', 'operations', 'supply chain', 'logistics',
      'customer', 'sales', 'brand', 'advertising', 'public relations',
      'corporate', 'organization', 'leadership', 'team', 'project',
      'budget', 'profit', 'revenue', 'cost', 'investment',
      'stock market', 'trading', 'asset', 'liability', 'equity',
      'balance sheet', 'income statement', 'cash flow', 'audit',
      'mba', 'business plan', 'startup', 'venture capital', 'angel investor',
      'mergers and acquisitions', 'joint venture', 'franchise', 'licensing',
      'supply and demand', 'competitive advantage', 'market share',
      'brand equity', 'customer loyalty', 'net promoter score',
      'six sigma', 'lean manufacturing', 'agile management', 'scrum'
    ];

    for (const keyword of businessKeywords) {
      if (lower.includes(keyword)) {
        return 'business';
      }
    }

    // ===== TECHNOLOGY =====
    const techKeywords = [
      'computer', 'programming', 'coding', 'software', 'hardware',
      'algorithm', 'data structure', 'database', 'network',
      'security', 'encryption', 'cybersecurity', 'hacking',
      'artificial intelligence', 'machine learning', 'deep learning',
      'neural network', 'python', 'java', 'javascript',
      'web development', 'app development', 'api', 'cloud computing',
      'devops', 'agile', 'scrum', 'sprint',
      'frontend', 'backend', 'full stack', 'responsive', 'design',
      'html', 'css', 'react', 'angular', 'vue', 'node.js',
      'sql', 'nosql', 'mongodb', 'postgresql', 'mysql',
      'blockchain', 'cryptocurrency', 'bitcoin', 'ethereum',
      'virtual reality', 'augmented reality', 'metaverse',
      'internet of things', 'smart home', 'automation',
      'robotics', 'drones', 'autonomous vehicles'
    ];

    for (const keyword of techKeywords) {
      if (lower.includes(keyword)) {
        return 'technology';
      }
    }

    // ===== EDUCATION =====
    const educationKeywords = [
      'education', 'teaching', 'learning', 'school', 'university',
      'student', 'teacher', 'professor', 'curriculum', 'pedagogy',
      'lesson', 'assessment', 'evaluation', 'grade', 'exam',
      'test', 'quiz', 'activity sheet', 'worksheet', 'homework',
      'module', 'online learning', 'distance education',
      'educational technology', 'instructional design', 'andragogy',
      'differentiated instruction', 'inclusive education', 'special education',
      'early childhood education', 'primary education', 'secondary education',
      'tertiary education', 'vocational education', 'adult education',
      'constructivism', 'behaviorism', 'cognitivism', 'humanism',
      'blended learning', 'flipped classroom', 'gamification',
      'formative assessment', 'summative assessment', 'authentic assessment',
      'lesson plan', 'course outline', 'syllabus', 'rubric'
    ];

    for (const keyword of educationKeywords) {
      if (lower.includes(keyword)) {
        return 'education';
      }
    }

    // ===== AGRICULTURE =====
    const agricultureKeywords = [
      'agriculture', 'farming', 'crop', 'harvest', 'livestock',
      'soil', 'fertilizer', 'pesticide', 'irrigation', 'plant',
      'animal husbandry', 'aquaculture', 'forestry', 'fishery',
      'sustainable agriculture', 'organic farming', 'food security',
      'agribusiness', 'agroforestry', 'permaculture', 'hydroponics',
      'aeroponics', 'vermicomposting', 'composting', 'crop rotation',
      'intercropping', 'monoculture', 'polyculture', 'seed bank',
      'genetically modified organisms', 'biotechnology', 'precision agriculture',
      'poultry', 'swine', 'cattle', 'goat', 'sheep', 'carabao'
    ];

    for (const keyword of agricultureKeywords) {
      if (lower.includes(keyword)) {
        return 'agriculture';
      }
    }

    // ===== LAW =====
    const lawKeywords = [
      'law', 'legal', 'justice', 'court', 'judge', 'lawyer',
      'attorney', 'defendant', 'plaintiff', 'evidence', 'testimony',
      'constitution', 'statute', 'regulation', 'contract', 'tort',
      'crime', 'criminal', 'civil', 'liability', 'damages',
      'appeal', 'verdict', 'sentence', 'parole', 'probation',
      'jurisprudence', 'legal precedent', 'common law', 'civil law',
      'international law', 'human rights law', 'environmental law',
      'intellectual property', 'patent', 'trademark', 'copyright',
      'family law', 'criminal law', 'corporate law', 'tax law',
      'litigation', 'arbitration', 'mediation', 'conciliation'
    ];

    for (const keyword of lawKeywords) {
      if (lower.includes(keyword)) {
        return 'law';
      }
    }

    // ===== MATH (LAST PRIORITY) =====
    const mathPatterns = [
      /\d+\s*[\+\-\*\/\×\÷]\s*\d+/,
      /[xX]\s*=\s*\d+/,
      /\d+[xX]\s*[\+\-\*\/]\s*\d+\s*=\s*\d+/,
      /solve for [xX]/,
      /find [xX]/,
      /calculate/i,
      /compute/i,
      /what is \d+ (plus|minus|times|divided by|over) \d+/i,
      /\d+% of/,
      /average of/i,
      /sum of/i,
      /product of/i,
      /difference between/i,
      /ratio of/i,
    ];

    for (const pattern of mathPatterns) {
      if (pattern.test(lower)) {
        return 'math';
      }
    }

    const mathKeywords = ['equation', 'algebra', 'geometry', 'trigonometry', 'calculus', 'quadratic', 'polynomial', 'matrix', 'vector', 'derivative', 'integral', 'sequence', 'series', 'permutation', 'combination', 'binomial', 'logarithm', 'exponent', 'arithmetic', 'fraction', 'decimal', 'percentage', 'statistics', 'probability', 'mean', 'median', 'mode', 'variance', 'standard deviation', 'grouped data', 'frequency distribution'];
    const calcWords = ['solve', 'find', 'calculate', 'compute', 'what is', 'determine'];
    
    let hasMathKW = false, hasCalc = false;
    for (const kw of mathKeywords) { 
      if (lower.includes(kw)) { 
        hasMathKW = true; 
        break; 
      } 
    }
    for (const cw of calcWords) { 
      if (lower.includes(cw)) { 
        hasCalc = true; 
        break; 
      } 
    }
    
    if (hasMathKW && hasCalc) {
      return 'math';
    }

    return 'general';
  },

  // ========== BUILD FINAL PROMPT WITH SUBJECT CONTEXT ==========
  buildFinalPrompt(prompt, previousResponse, previousPrompt, isReply, wantsDetailed, subject) {
    let finalPrompt = '';

    const subjectInstructions = {
      'social_science': 'You are a social science expert. Provide realistic, practical, and evidence-based answers with real-world examples.',
      'science': 'You are a science expert. Provide accurate, precise, and scientifically-grounded answers with clear explanations.',
      'health': 'You are a health and medicine expert. Provide reliable, practical, and evidence-based health information.',
      'humanities': 'You are a humanities expert. Provide thoughtful, well-reasoned, and culturally-informed answers.',
      'business': 'You are a business expert. Provide practical, realistic, and actionable business advice.',
      'technology': 'You are a technology expert. Provide accurate, up-to-date, and practical technical information.',
      'education': 'You are an education expert. Provide clear, practical, and research-based educational guidance.',
      'agriculture': 'You are an agriculture expert. Provide practical, sustainable, and science-based farming advice.',
      'law': 'You are a legal expert. Provide accurate, clear, and practical legal information.',
      'math': 'You are a math tutor. Provide step-by-step solutions with clear explanations.',
      'general': 'You are a multi-subject expert. Provide accurate, reliable, and practical information.'
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

    // ===== SUBJECT-SPECIFIC FORMATTING =====
    if (subject === 'math') {
      finalPrompt += 'FORMAT FOR MATH SOLUTIONS:\n';
      finalPrompt += '1. Start with "Problem:" on its own line\n';
      finalPrompt += '2. Use numbered steps: "Step 1:", "Step 2:", etc.\n';
      finalPrompt += '3. Show equations clearly on separate lines\n';
      finalPrompt += '4. End with "Final Answer:" on its own line\n';
      finalPrompt += '5. DO NOT use "..." to truncate\n\n';
    } else {
      finalPrompt += 'FORMAT FOR NON-MATH ANSWERS:\n';
      finalPrompt += '1. Start with a clear definition or introduction\n';
      finalPrompt += '2. Provide explanations in organized sections\n';
      finalPrompt += '3. Include practical, real-world examples\n';
      finalPrompt += '4. End with a clear summary or conclusion\n';
      finalPrompt += '5. DO NOT use "..." to truncate\n\n';
    }

    finalPrompt += 'IMPORTANT GUIDELINES:\n';
    finalPrompt += '- Provide COMPLETE, RELIABLE, and ACCURATE answers\n';
    finalPrompt += '- Use PRACTICAL examples that apply to real life\n';
    finalPrompt += '- For definitions, explain in clear, simple terms\n';
    finalPrompt += '- Ensure all information is FACTUAL and CORRECT\n';
    finalPrompt += '- DO NOT use "..." to truncate your response\n';
    finalPrompt += '- DO NOT provide math solutions unless the question is about math\n\n';

    if (wantsDetailed) {
      finalPrompt += 'Provide a COMPREHENSIVE and DETAILED explanation with examples and context.';
    } else {
      finalPrompt += 'Provide a CLEAR, COMPLETE, and CONCISE answer.';
    }

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

  // ========== CLEAN MATH SOLUTION ==========
  cleanMathSolution(text) {
    if (!text) return text;

    let cleaned = text;

    cleaned = cleaned.replace(/(Problem:.*?)\s+Problem:/gi, '$1\n\n');
    cleaned = cleaned.replace(/(Data:.*?)\s+Data:/gi, '$1\n\n');
    cleaned = cleaned.replace(/(Formula:.*?)\s+Formula:/gi, '$1\n\n');
    cleaned = cleaned.replace(/Step\s*(\d+)\s*[:.]?\s*/gi, '\nStep $1: ');
    cleaned = cleaned.replace(/Hakbang\s*(\d+)\s*[:.]?\s*/gi, '\nHakbang $1: ');
    cleaned = cleaned.replace(/(\d+)\s*([+\-*/=])\s*(\d+)/g, '$1 $2 $3');
    cleaned = cleaned.replace(/([a-zA-Z])\s*([+\-*/=])\s*(\d+)/g, '$1 $2 $3');
    cleaned = cleaned.replace(/(\d+)\s*([+\-*/=])\s*([a-zA-Z])/g, '$1 $2 $3');
    cleaned = cleaned.replace(/(\d+)\/(\d+)/g, '$1/$2');
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/abobot/gi, '');
    cleaned = cleaned.replace(/abobots/gi, '');
    cleaned = cleaned.replace(/Abobot/gi, '');
    cleaned = cleaned.replace(/Abobots/gi, '');
    cleaned = cleaned.replace(/Final Answer:?\s*/gi, '\n\nFinal Answer: ');
    cleaned = cleaned.replace(/Pinal na Sagot:?\s*/gi, '\n\nPinal na Sagot: ');
    cleaned = cleaned.replace(/Answer:?\s*/gi, '\n\nAnswer: ');
    cleaned = cleaned.replace(/Sagot:?\s*/gi, '\n\nSagot: ');
    cleaned = cleaned.replace(/^\s+|\s+$/g, '');
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
    cleaned = cleaned.replace(/[Aa]bobots?/g, '');
    cleaned = cleaned.replace(/[Aa]bobot/g, '');
    cleaned = cleaned.replace(/\s{2,}/g, ' ');

    return cleaned.trim();
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
        { char: '\n•', priority: 7 },
        { char: '\n-', priority: 6 },
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
