const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;
const conversationHistory = {};
const SERPAPI_KEY = '96a606904519013f159fa59fca23892e38a305ea97159d1b2a77ea71364f9709';

module.exports = {
  name: ['ai', 'opera', 'ask', 'gemini', 'vision', 'gscholar', 'scholar', 'googlescholar', 'research', 'generate', 'image', 'img', 'show', 'humanize', 'translate', 'summarize', 'elaborate', 'paraphrase'],
  description: 'Multi-modal AI with text, image analysis, Google Scholar, image generation, music search, lyrics, humanize, translate, summarize, elaborate, and paraphrase',
  usage: 'ai [message] or send/reply to image or generate [query] or play [song] or lyrics [song] or humanize [text] or translate [text] or summarize [text] or elaborate [text] or paraphrase [text]',
  version: '9.3.0',
  author: 'codex',
  category: 'AI',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let previousResponse = null;
      let isReply = false;
      let previousPrompt = null;
      let imageUrl = null;

      const correctedPrompt = this.correctTypos(prompt);
      if (correctedPrompt !== prompt) {
        prompt = correctedPrompt;
      }

      const detectedLanguage = this.detectLanguage(prompt);
      const isCasualConversation = this.isCasualConversation(prompt);
      
      // ===== DETECT SUBJECT/CATEGORY =====
      const subjectInfo = this.detectSubject(prompt);
      const isMath = subjectInfo.isMath;
      const isSpecificNonMath = subjectInfo.isNonMath || false;
      const isSubjectSpecific = subjectInfo.subject !== 'general';
      const detectedSubject = subjectInfo.subject;
      const confidenceScore = subjectInfo.confidence;

      // ===== SPECIAL COMMANDS =====
      if (this.isLyricsRequest(prompt)) {
        await this.handleLyricsSearch(senderId, prompt, token);
        return;
      }

      if (this.isGenerateCommand(prompt)) {
        await this.handleImageGeneration(senderId, prompt, token);
        return;
      }

      if (this.isImageRequest(prompt)) {
        await this.handleImageGeneration(senderId, prompt, token);
        return;
      }

      if (this.isMusicRequest(prompt)) {
        await this.handleMusicSearch(senderId, prompt, token);
        return;
      }

      if (this.isScholarCommand(prompt)) {
        await this.handleScholarSearch(senderId, prompt, token);
        return;
      }

      if (this.isResearchQuery(prompt)) {
        await this.handleScholarSearch(senderId, prompt, token);
        return;
      }

      // ===== NEW FUNCTIONS =====
      if (this.isHumanizeCommand(prompt)) {
        await this.handleHumanize(senderId, prompt, token);
        return;
      }

      if (this.isTranslateCommand(prompt)) {
        await this.handleTranslate(senderId, prompt, token);
        return;
      }

      if (this.isSummarizeCommand(prompt)) {
        await this.handleSummarize(senderId, prompt, token);
        return;
      }

      if (this.isElaborateCommand(prompt)) {
        await this.handleElaborate(senderId, prompt, token);
        return;
      }

      if (this.isParaphraseCommand(prompt)) {
        await this.handleParaphrase(senderId, prompt, token);
        return;
      }

      // ===== RETURN TO TOPIC =====
      if (this.isReturnToTopicRequest(prompt)) {
        const history = conversationHistory[senderId];
        if (history && history.topicHistory) {
          const bestMatch = this.findBestTopicMatch(prompt, history);
          if (bestMatch) {
            const topicData = history.topicHistory[bestMatch];
            const response = topicData.response || topicData;
            if (response) {
              previousResponse = response;
              previousPrompt = topicData.prompt || bestMatch;
              isReply = true;
            }
          }
        }
        if (!isReply && history && history.lastResponse) {
          previousResponse = history.lastResponse;
          previousPrompt = history.lastPrompt || 'Previous topic';
          isReply = true;
        }
      }

      // ===== REPLY TO A MESSAGE =====
      if (event?.message?.reply_to?.mid) {
        isReply = true;
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        previousResponse = replyData.message;
        imageUrl = replyData.imageUrl;
        if (!prompt) prompt = 'Please respond to what I said.';
      }

      // ===== IMAGE ATTACHMENT =====
      if (!imageUrl && event?.message?.attachments) {
        for (const attachment of event.message.attachments) {
          if (attachment.type === 'image' || attachment.type === 'photo') {
            imageUrl = attachment.payload?.url || attachment.url || null;
            if (imageUrl) {
              const urlObj = new URL(imageUrl);
              urlObj.searchParams.set('access_token', token);
              imageUrl = urlObj.toString();
            }
            break;
          }
        }
        if (imageUrl && !prompt) prompt = 'Analyze this image.';
      }

      // ===== CONVERSATION CONTEXT =====
      if (!isReply && prompt && !imageUrl) {
        const history = conversationHistory[senderId];
        if (history && history.lastResponse) {
          const lowerPrompt = prompt.toLowerCase();
          const isModification = this.isModificationRequest(lowerPrompt);
          const isFollowUp = this.isFollowUpRequest(lowerPrompt) ||
                            this.isContextualQuestion(lowerPrompt, history.lastPrompt) ||
                            isModification;
          const isNewTopic = this.isNewTopic(lowerPrompt, history.lastPrompt, prompt);

          if (isModification && !isNewTopic) {
            previousResponse = history.lastResponse;
            previousPrompt = history.lastPrompt || 'image analysis';
            isReply = true;
          } else if (isFollowUp && !isNewTopic) {
            previousResponse = history.lastResponse;
            previousPrompt = history.lastPrompt || 'image analysis';
            isReply = true;
          } else if (!isNewTopic && history.hasImageContext) {
            previousResponse = history.lastResponse;
            previousPrompt = history.lastPrompt || 'image analysis';
            isReply = true;
          }
        }
      }

      // ===== WELCOME MESSAGE =====
      if (!prompt && !isReply && !imageUrl) {
        await sendMessage(senderId, {
          text: 'Hello! I am Teacher Arlene a Multi-Modal AI.\n\nMga Kakayahang kaya ko:\n\n✓ Can answer text conversations\n✓ Can analyze image and all activity sheets\n✓ Can give research articles, studies, and thesis\n✓ Can generate images\n✓ Can search music\n✓ Can search lyrics\n✓ Can humanize text\n✓ Can translate languages\n✓ Can summarize text\n✓ Can elaborate concepts\n✓ Can paraphrase content\n✓ Can give and solve the problem with full solutions\n✓ Can make resume\n✓ Can make all type of letters\n✓ Can translate all languages\n✓ Can enhance image resolution\n✓ Can remove image background\n✓ Can test API endpoint\n✓ Can make images to Url\n\nIf you want to know how to use my commands and functions type help\n\nKaya ko ring makipag-usap ng Tagalog, Bisaya, English, at iba pang wika.'
        }, token);
        return;
      }

      // ===== OWNER QUESTION =====
      if (this.isOwnerQuestion(prompt)) {
        const lang = this.getLanguageName(detectedLanguage);
        const response = lang === 'Tagalog' ? 'Ako ay ginawa ni GeoDevz69. Bisitahin dito para sa karagdagang impormasyon:\nhttps://www.facebook.com/geotechph.net' :
                          lang === 'Bisaya' ? 'Ako gihimo ni GeoDevz69. Bisitaha diri para sa dugang impormasyon:\nhttps://www.facebook.com/geotechph.net' :
                          'I was created by GeoDevz69. Visit here for more information:\nhttps://www.facebook.com/geotechph.net';
        await sendMessage(senderId, { text: response }, token);
        return;
      }

      // ===== USER INFO =====
      if (this.isUserInfoQuestion(prompt)) {
        await this.handleUserInfo(senderId, prompt, token);
        return;
      }

      const wantsDetailed = this.wantsDetailedAnswer(prompt);
      let aiResponse = '';

      // ===== IMAGE ANALYSIS =====
      if (imageUrl) {
        aiResponse = await this.callGeminiAPI(prompt, imageUrl, detectedLanguage);

        const history = conversationHistory[senderId] || { topicHistory: {} };
        const topicKey = this.extractTopicKey(prompt || 'image');
        const keywords = this.extractKeywordsFromResponse(aiResponse);

        history.lastPrompt = prompt || 'Image analysis';
        history.lastResponse = aiResponse;
        history.lastImageUrl = imageUrl;
        history.hasImageContext = true;
        history.language = detectedLanguage;
        history.timestamp = Date.now();

        if (topicKey) {
          history.topicHistory[topicKey] = {
            response: aiResponse,
            prompt: prompt || 'image analysis',
            keywords: keywords,
            timestamp: Date.now()
          };
        }
        for (const kw of keywords) {
          if (kw.length > 3 && !history.topicHistory[kw]) {
            history.topicHistory[kw] = {
              response: aiResponse,
              prompt: prompt || 'image analysis',
              keywords: keywords,
              timestamp: Date.now()
            };
          }
        }
        conversationHistory[senderId] = history;
      }
      // ===== MATH PROBLEMS (with retry) =====
      else if (isMath || this.isExampleRequest(prompt)) {
        const finalPrompt = this.buildMathSolutionPrompt(prompt, detectedLanguage);
        const response = await this.callAPIWithRetry(finalPrompt, 2);
        aiResponse = this.cleanResponse(response || 'No response from API.');
        
        // If response is incomplete, try one more time with explicit instruction
        if (aiResponse.includes('...') && aiResponse.length < 500) {
          const retryPrompt = `Provide a COMPLETE solution with ALL steps for: "${prompt}". 
          DO NOT use "...". Include the FINAL ANSWER clearly labeled.
          Format:
          Problem: ...
          Data: ...
          Formula: ...
          Step 1: ...
          Step 2: ...
          Step 3: ...
          ...
          Final Answer: ...`;
          const retryResponse = await this.callAPI(retryPrompt);
          if (retryResponse && !retryResponse.includes('...') && retryResponse.length > 100) {
            aiResponse = this.cleanResponse(retryResponse);
          }
        }

        const history = conversationHistory[senderId] || { topicHistory: {} };
        history.lastPrompt = prompt;
        history.lastResponse = aiResponse;
        history.language = detectedLanguage;
        history.timestamp = Date.now();

        const topicKey = this.extractTopicKey(prompt);
        if (topicKey) {
          history.topicHistory[topicKey] = {
            response: aiResponse,
            prompt: prompt,
            keywords: this.extractKeywordsFromResponse(aiResponse),
            timestamp: Date.now()
          };
        }
        conversationHistory[senderId] = history;
      }
      // ===== SUBJECT-SPECIFIC RESPONSE =====
      else if (isSubjectSpecific && confidenceScore > 0.3) {
        const finalPrompt = this.buildSubjectPrompt(prompt, detectedSubject, detectedLanguage, wantsDetailed);
        const response = await this.callAPI(finalPrompt);
        aiResponse = this.cleanResponse(response || 'No response from API.');

        const history = conversationHistory[senderId] || { topicHistory: {} };
        history.lastPrompt = prompt;
        history.lastResponse = aiResponse;
        history.lastSubject = detectedSubject;
        history.language = detectedLanguage;
        history.timestamp = Date.now();

        const topicKey = this.extractTopicKey(prompt);
        if (topicKey) {
          history.topicHistory[topicKey] = {
            response: aiResponse,
            prompt: prompt,
            subject: detectedSubject,
            keywords: this.extractKeywordsFromResponse(aiResponse),
            timestamp: Date.now()
          };
        }
        conversationHistory[senderId] = history;
      }
      // ===== REPLY / FOLLOW-UP =====
      else if (isReply && previousResponse) {
        const history = conversationHistory[senderId];
        const responseLanguage = detectedLanguage || history?.language || 'english';
        const subject = history?.lastSubject || 'general';

        if (history?.hasImageContext && this.isModificationRequest(prompt.toLowerCase())) {
          const finalPrompt = this.buildImageModificationPrompt(prompt, previousResponse, wantsDetailed, responseLanguage);
          const response = await this.callAPI(finalPrompt);
          aiResponse = this.cleanResponse(response || 'No response from API.');
        } else if (history?.hasImageContext && !imageUrl) {
          const finalPrompt = this.buildImageFollowUpPrompt(prompt, previousResponse, previousPrompt, wantsDetailed, responseLanguage);
          const response = await this.callAPI(finalPrompt);
          aiResponse = this.cleanResponse(response || 'No response from API.');
        } else {
          const finalPrompt = this.buildReplyPrompt(prompt, previousResponse, previousPrompt, subject, wantsDetailed, responseLanguage);
          const response = await this.callAPI(finalPrompt);
          aiResponse = this.cleanResponse(response || 'No response from API.');
        }

        if (!wantsDetailed && !this.isModificationRequest(prompt.toLowerCase())) {
          aiResponse = this.shortenResponse(aiResponse);
        }

        const newHistory = conversationHistory[senderId] || { topicHistory: {} };
        newHistory.lastPrompt = prompt;
        newHistory.lastResponse = aiResponse;
        newHistory.lastImageUrl = history?.lastImageUrl || null;
        newHistory.hasImageContext = history?.hasImageContext || false;
        newHistory.lastSubject = subject;
        newHistory.language = responseLanguage;
        newHistory.timestamp = Date.now();

        const topicKey = this.extractTopicKey(prompt);
        if (topicKey) {
          newHistory.topicHistory[topicKey] = {
            response: aiResponse,
            prompt: prompt,
            subject: subject,
            keywords: this.extractKeywordsFromResponse(aiResponse),
            timestamp: Date.now()
          };
        }
        conversationHistory[senderId] = newHistory;
      }
      // ===== NEW CONVERSATION =====
      else {
        if (isCasualConversation) {
          const finalPrompt = this.buildCasualPrompt(prompt, detectedLanguage);
          const response = await this.callAPI(finalPrompt);
          aiResponse = this.cleanResponse(response || 'No response from API.');
        } else {
          const finalPrompt = this.buildGeneralPrompt(prompt, detectedLanguage, wantsDetailed);
          const response = await this.callAPI(finalPrompt);
          aiResponse = this.cleanResponse(response || 'No response from API.');
        }

        if (!wantsDetailed && !isCasualConversation) {
          aiResponse = this.shortenResponse(aiResponse);
        }

        const newHistory = conversationHistory[senderId] || { topicHistory: {} };
        newHistory.lastPrompt = prompt;
        newHistory.lastResponse = aiResponse;
        newHistory.lastImageUrl = null;
        newHistory.hasImageContext = false;
        newHistory.lastSubject = 'general';
        newHistory.language = detectedLanguage;
        newHistory.timestamp = Date.now();

        const topicKey = this.extractTopicKey(prompt);
        if (topicKey) {
          newHistory.topicHistory[topicKey] = {
            response: aiResponse,
            prompt: prompt,
            subject: 'general',
            keywords: this.extractKeywordsFromResponse(aiResponse),
            timestamp: Date.now()
          };
        }
        conversationHistory[senderId] = newHistory;
      }

      this.cleanOldHistory();

      // ===== SEND RESPONSE =====
      if (isMath || this.isExampleRequest(prompt)) {
        await this.sendMathResponse(senderId, aiResponse, token);
      } else {
        await this.sendChunks(senderId, aiResponse, token);
      }

    } catch (error) {
      console.error('[ai] Error:', error.message);
      const errorLang = this.detectLanguage(prompt);
      await sendMessage(senderId, { text: this.getErrorMessage(error, errorLang) }, token);
    }
  },

  // ========== SUBJECT DETECTION SYSTEM ==========
  detectSubject(prompt) {
    if (!prompt) return { subject: 'general', confidence: 0, isMath: false, isNonMath: false };
    
    const lower = prompt.toLowerCase();
    let subject = 'general';
    let confidence = 0;
    let isMath = false;
    let isNonMath = false;
    
    // ===== NON-MATH INDICATORS (priority check) =====
    const nonMathIndicators = [
      'susceptibility', 'behavior', 'attitude', 'perception', 'awareness',
      'knowledge', 'practice', 'belief', 'opinion', 'view', 'perspective',
      'culture', 'tradition', 'custom', 'norm', 'value', 'ethics',
      'disease', 'disorder', 'illness', 'condition', 'symptom', 'diagnosis',
      'treatment', 'therapy', 'prevention', 'risk', 'factor', 'epidemiology',
      'infection', 'virus', 'bacteria', 'chronic', 'acute', 'mortality',
      'morbidity', 'prevalence', 'incidence', 'outbreak', 'pandemic',
      'environment', 'climate', 'pollution', 'sustainability', 'conservation',
      'biodiversity', 'ecosystem', 'habitat', 'species', 'forest', 'ocean',
      'air quality', 'water quality', 'renewable', 'energy', 'waste',
      'poverty', 'education', 'employment', 'inequality', 'discrimination',
      'gender', 'race', 'class', 'crime', 'justice', 'policy', 'governance',
      'democracy', 'human rights', 'peace', 'conflict', 'development',
      'economy', 'market', 'trade', 'finance', 'investment', 'inflation',
      'unemployment', 'tax', 'budget', 'interest rate', 'currency',
      'stock', 'bond', 'commodity', 'supply', 'demand',
      'curriculum', 'pedagogy', 'teaching', 'learning', 'student', 'teacher',
      'school', 'university', 'education', 'literacy', 'numeracy',
      'research about', 'study about', 'article about', 'paper about',
      'thesis', 'dissertation', 'journal', 'publication', 'finding',
      'pag-uugali', 'aspeto', 'kultura', 'lipunan', 'pamayanan',
      'kalusugan', 'sakit', 'gagamot', 'paggamot', 'gamot',
      'sosyal', 'sikolohiya', 'psychology', 'sociology',
      'biology', 'chemistry', 'physics'
    ];
    
    for (const indicator of nonMathIndicators) {
      if (lower.includes(indicator)) {
        isNonMath = true;
        break;
      }
    }
    
    // ===== STRONG MATH INDICATORS =====
    const mathPatterns = [
      /\d+\s*[\+\-\*\/\×\÷]\s*\d+/,  // 5 + 3
      /[xX]\s*=\s*\d+/,  // x = 5
      /\d+[xX]\s*[\+\-\*\/]\s*\d+\s*=\s*\d+/,  // 3x + 5 = 14
      /solve for [xX]/,  // solve for x
      /find [xX]/,  // find x
      /calculate/i,  // calculate
      /compute/i,  // compute
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
        isMath = true;
        break;
      }
    }
    
    // If it has non-math indicators, it's not math
    if (isNonMath) {
      isMath = false;
    }
    
    // ===== SUBJECT KEYWORDS =====
    const subjects = {
      math: {
        keywords: ['algebra', 'geometry', 'trigonometry', 'calculus', 'arithmetic', 'fraction', 'decimal', 'percentage', 'quadratic', 'polynomial', 'matrix', 'vector', 'derivative', 'integral', 'sequence', 'series', 'permutation', 'combination', 'binomial', 'logarithm', 'exponent', 'mean', 'median', 'mode', 'variance', 'standard deviation', 'frequency distribution', 'grouped data', 'ungrouped data', 'hypothesis testing', 'regression', 'correlation'],
        weight: 3
      },
      science: {
        keywords: ['cell', 'dna', 'rna', 'protein', 'enzyme', 'organism', 'species', 'ecosystem', 'habitat', 'biodiversity', 'evolution', 'genetics', 'photosynthesis', 'respiration', 'reproduction', 'metabolism', 'biochemistry', 'microbiology', 'botany', 'zoology', 'anatomy', 'physiology', 'pathology', 'atom', 'molecule', 'compound', 'element', 'chemical', 'reaction', 'acid', 'base', 'ph', 'solution', 'molar', 'mole', 'force', 'motion', 'energy', 'work', 'power', 'momentum', 'velocity', 'acceleration', 'gravity', 'mass', 'weight', 'electricity', 'magnetism', 'circuit', 'voltage', 'current', 'resistance'],
        weight: 2
      },
      socialScience: {
        keywords: ['society', 'culture', 'social', 'community', 'institution', 'social structure', 'social change', 'social movement', 'socialization', 'deviance', 'norm', 'value', 'belief', 'class', 'status', 'role', 'group', 'organization', 'demography', 'urbanization', 'globalization', 'psychology', 'behavior', 'mental', 'cognition', 'emotion', 'personality', 'perception', 'memory', 'learning', 'development', 'motivation', 'attitude', 'mental health', 'stress', 'anxiety', 'depression'],
        weight: 2
      },
      humanities: {
        keywords: ['literature', 'poem', 'novel', 'story', 'fiction', 'drama', 'play', 'poetry', 'prose', 'narrative', 'character', 'theme', 'symbolism', 'metaphor', 'allegory', 'author', 'writer', 'philosophy', 'ethics', 'logic', 'metaphysics', 'epistemology', 'moral', 'virtue', 'justice', 'knowledge', 'truth', 'existence', 'consciousness', 'history', 'ancient', 'medieval', 'modern', 'civilization', 'empire', 'kingdom', 'revolution', 'war', 'peace'],
        weight: 2
      },
      business: {
        keywords: ['business', 'management', 'marketing', 'accounting', 'finance', 'strategy', 'leadership', 'entrepreneurship', 'innovation', 'human resources', 'operations', 'supply chain', 'logistics', 'customer', 'sales', 'brand', 'advertising', 'public relations', 'corporate', 'organization', 'leadership', 'team', 'project', 'budget', 'profit', 'revenue', 'cost', 'investment'],
        weight: 2
      },
      technology: {
        keywords: ['computer', 'programming', 'coding', 'software', 'hardware', 'algorithm', 'data structure', 'database', 'network', 'security', 'encryption', 'cybersecurity', 'hacking', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network', 'python', 'java', 'c++', 'javascript', 'web development', 'app development', 'mobile app', 'api', 'cloud computing', 'devops'],
        weight: 2
      },
      health: {
        keywords: ['disease', 'disorder', 'illness', 'condition', 'symptom', 'diagnosis', 'treatment', 'therapy', 'medication', 'drug', 'surgery', 'hospital', 'clinic', 'doctor', 'nurse', 'patient', 'infection', 'virus', 'bacteria', 'immunity', 'chronic', 'acute', 'prevention', 'screening', 'vaccine', 'anatomy', 'physiology', 'pathology', 'pharmacology', 'epidemiology', 'public health', 'nutrition'],
        weight: 2
      },
      education: {
        keywords: ['education', 'teaching', 'learning', 'school', 'university', 'student', 'teacher', 'professor', 'curriculum', 'pedagogy', 'lesson', 'assessment', 'evaluation', 'grade', 'exam', 'test', 'quiz', 'activity sheet', 'worksheet', 'homework', 'module', 'online learning', 'distance education', 'educational technology'],
        weight: 2
      }
    };
    
    let bestSubject = 'general';
    let bestScore = 0;
    
    for (const [subjectName, data] of Object.entries(subjects)) {
      let score = 0;
      for (const keyword of data.keywords) {
        if (lower.includes(keyword.toLowerCase())) {
          score += data.weight;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestSubject = subjectName;
      }
    }
    
    confidence = Math.min(1, bestScore / 15);
    
    return {
      subject: bestSubject,
      confidence: confidence,
      isMath: isMath,
      isNonMath: isNonMath
    };
  },

  // ========== BUILD MATH SOLUTION PROMPT (WITH COMPLETION GUARANTEE) ==========
  buildMathSolutionPrompt(prompt, language) {
    const langName = this.getLanguageName(language);
    const topic = this.detectMathTopic(prompt);
    const wantsExamples = this.isExampleRequest(prompt);
    const isTagalog = language === 'tagalog' || language === 'filipino';
    const isBisaya = language === 'bisaya' || language === 'cebuano';
    let final = '';
    
    const completionInstruction = isTagalog ? 
      'MAHALAGA: KUMPLETUHIN ANG BUONG SAGOT. HUWAG PUputulin ang sagot gamit ang "..." o anumang ellipsis. KUMPLETUHIN ANG LAHAT NG HAKBANG HANGGANG SA PINAL NA SAGOT.' :
      isBisaya ?
      'MAHINUNGDANON: KUMPLETUHA ANG TIBUOK TUBAG. AYAW PAGPUTOL SA TUBAG GAMIT ANG "..." O BISAN UNSANG ELLIPSIS. KUMPLETUHA ANG TANANG LAKANG HANGGANG SA PINAL NGA TUBAG.' :
      'IMPORTANT: COMPLETE THE ENTIRE ANSWER. DO NOT truncate the answer using "..." or any ellipsis. COMPLETE ALL STEPS UNTIL THE FINAL ANSWER.';
    
    if (isTagalog) {
      final += `IKAW AY ISANG MATH TUTOR NA EKSPERTO SA ${topic.toUpperCase()}.\n\n`;
      final += `TANONG NG USER: "${prompt}"\n\n`;
      final += `${completionInstruction}\n\n`;
      if (wantsExamples) {
        final += `MAGBIGAY NG MGA HALIMBAWA NA TUNGKOL LAMANG SA ${topic.toUpperCase()}.\n`;
        final += `MAGBIGAY NG 2-3 HALIMBAWA na may kumpletong solusyon.\n\n`;
      } else {
        final += `MAGBIGAY NG KUMPLETONG SOLUSYON na may hakbang-hakbang na paliwanag.\n\n`;
      }
      final += `FORMAT NG SAGOT:\n`;
      final += `Problema: [Ang problema]\n\nDatos: [Ang mga given values]\n\n`;
      if (topic !== 'arithmetic') final += `Pormula: [Ang pormula na ginamit]\n\n`;
      final += `Hakbang-hakbang na Solusyon:\n`;
      final += `Hakbang 1: [Unang hakbang]\nPaliwanag: [Bakit ginawa ito]\nKalkulasyon: [Ang kalkulasyon]\n\n`;
      final += `Hakbang 2: [Pangalawang hakbang]\nPaliwanag: [Bakit ginawa ito]\nKalkulasyon: [Ang kalkulasyon]\n\n`;
      final += `Hakbang 3: [Pangatlong hakbang]\nPaliwanag: [Bakit ginawa ito]\nKalkulasyon: [Ang kalkulasyon]\n\n`;
      final += `(Ipagpatuloy ang mga hakbang hanggang sa makumpleto ang solusyon)\n\n`;
      final += `Pinal na Sagot: [Ang sagot]\n\n`;
      final += `Tumugon sa ${langName.toUpperCase()}.\n`;
      final += `\nKRITIKAL: KUMPLETUHIN ANG BUONG SAGOT. HUWAG GUMAMIT NG "..." SAAN MAN.`;
    } else if (isBisaya) {
      final += `IKAW USA KA MATH TUTOR NGA EKSPERTO SA ${topic.toUpperCase()}.\n\n`;
      final += `PANGUTANA SA USER: "${prompt}"\n\n`;
      final += `${completionInstruction}\n\n`;
      if (wantsExamples) {
        final += `PAGHATAG UG MGA PANANGLITAN MAHITUNGOD LAMANG SA ${topic.toUpperCase()}.\n`;
        final += `PAGHATAG UG 2-3 KA PANANGLITAN nga adunay kompletong solusyon.\n\n`;
      } else {
        final += `PAGHATAG UG KOMPLETONG SOLUSYON nga adunay lakang-lakang nga pagpasabot.\n\n`;
      }
      final += `FORMAT SA TUBAG:\n`;
      final += `Problema: [Ang problema]\n\nDatos: [Ang mga given values]\n\n`;
      if (topic !== 'arithmetic') final += `Pormula: [Ang pormula nga gigamit]\n\n`;
      final += `Lakang-lakang nga Solusyon:\n`;
      final += `Lakang 1: [Unang lakang]\nPagpasabot: [Ngano gibuhat kini]\nKalkulasyon: [Ang kalkulasyon]\n\n`;
      final += `Lakang 2: [Ikaduhang lakang]\nPagpasabot: [Ngano gibuhat kini]\nKalkulasyon: [Ang kalkulasyon]\n\n`;
      final += `Lakang 3: [Ikatulong lakang]\nPagpasabot: [Ngano gibuhat kini]\nKalkulasyon: [Ang kalkulasyon]\n\n`;
      final += `(Padayon ang mga lakang hangtod makompleto ang solusyon)\n\n`;
      final += `Pinal nga Tubag: [Ang tubag]\n\n`;
      final += `Tubag sa ${langName.toUpperCase()}.\n`;
      final += `\nKRITIKAL: KUMPLETUHA ANG TIBUOK TUBAG. AYAW GAMITA ANG "..." SA BISAN UNSA.`;
    } else {
      final += `YOU ARE A MATH TUTOR SPECIALIZING IN ${topic.toUpperCase()}.\n\n`;
      final += `USER QUESTION: "${prompt}"\n\n`;
      final += `${completionInstruction}\n\n`;
      if (wantsExamples) {
        final += `PROVIDE EXAMPLES ONLY ABOUT ${topic.toUpperCase()}.\n`;
        final += `PROVIDE 2-3 EXAMPLES with complete solutions.\n\n`;
      } else {
        final += `PROVIDE COMPLETE SOLUTION with step-by-step explanation.\n\n`;
      }
      final += `RESPONSE FORMAT:\n`;
      final += `Problem: [The problem]\n\nData: [The given values]\n\n`;
      if (topic !== 'arithmetic') final += `Formula: [The formula used]\n\n`;
      final += `Step-by-step Solution:\n`;
      final += `Step 1: [First step]\nExplanation: [Why this is done]\nCalculation: [The calculation]\n\n`;
      final += `Step 2: [Second step]\nExplanation: [Why this is done]\nCalculation: [The calculation]\n\n`;
      final += `Step 3: [Third step]\nExplanation: [Why this is done]\nCalculation: [The calculation]\n\n`;
      final += `(Continue steps until solution is complete)\n\n`;
      final += `Final Answer: [The answer]\n\n`;
      final += `Respond in ${langName.toUpperCase()}.\n`;
      final += `\nCRITICAL: COMPLETE THE ENTIRE ANSWER. DO NOT USE "..." ANYWHERE.`;
    }
    return final;
  },

  // ========== CALL API WITH RETRY ==========
  async callAPIWithRetry(prompt, maxRetries = 2) {
    let lastError = null;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const response = await this.callAPI(prompt);
        
        if (response && !response.includes('...') && response.length > 50) {
          return response;
        }
        
        if (response && response.includes('...') && attempt < maxRetries - 1) {
          console.log(`[API] Response truncated, retrying... (attempt ${attempt + 1})`);
          const enhancedPrompt = `${prompt}\n\nIMPORTANT: Your previous response was incomplete. Please provide the COMPLETE solution. DO NOT truncate with "...". Provide ALL steps.`;
          attempt++;
          const retryResponse = await this.callAPI(enhancedPrompt);
          if (retryResponse && !retryResponse.includes('...') && retryResponse.length > 50) {
            return retryResponse;
          }
        }
        
        return response;
      } catch (error) {
        lastError = error;
        attempt++;
        if (attempt < maxRetries) {
          console.log(`[API] Attempt ${attempt + 1} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    throw lastError || new Error('All API attempts failed');
  },

  // ========== SEND MATH RESPONSE WITH COMPLETION ==========
  async sendMathResponse(senderId, text, token) {
    if (!text) return;
    
    const cleaned = this.cleanResponse(text);
    
    // If response has truncation marker, try to complete it
    if (cleaned.includes('...') && cleaned.length < 500) {
      try {
        const completionPrompt = `Please continue and complete this answer (do not use "..."), 
        continue from where it left off: "${cleaned.slice(-200)}"`;
        const completion = await this.callAPI(completionPrompt);
        if (completion && !completion.includes('...') && completion.length > 50) {
          const completeAnswer = cleaned.replace(/\.\.\.$/, '') + '\n' + completion;
          await this.sendChunks(senderId, completeAnswer, token);
          return;
        }
      } catch (error) {
        console.error('[Math] Completion failed:', error.message);
      }
    }
    
    await this.sendChunks(senderId, cleaned, token);
  },

  // ========== BUILD SUBJECT PROMPT ==========
  buildSubjectPrompt(prompt, subject, language, wantsDetailed) {
    const langName = this.getLanguageName(language);
    const subjectDisplay = subject.charAt(0).toUpperCase() + subject.slice(1);
    const isTagalog = language === 'tagalog' || language === 'filipino';
    const isBisaya = language === 'bisaya' || language === 'cebuano';
    
    let promptText = '';
    
    if (isTagalog) {
      promptText = `IKAW AY ISANG ${subjectDisplay.toUpperCase()} EXPERT.\n\n`;
      promptText += `TANONG NG USER: "${prompt}"\n\n`;
      promptText += `INSTRUKSYON:\n`;
      promptText += `- Tumugon bilang isang ${subjectDisplay} expert\n`;
      promptText += `- Gumamit ng ${langName.toUpperCase()} na wika\n`;
      promptText += `- Magbigay ng TAMA at PRESISONG sagot\n`;
      promptText += `- Ibatay ang sagot sa SIYENTIPIKO at AKADEMIKONG kaalaman\n`;
      if (wantsDetailed) {
        promptText += `- Magbigay ng DETALYADO at KOMPLETONG paliwanag\n`;
      } else {
        promptText += `- Magbigay ng MAIKLI at DIREKTANG sagot\n`;
      }
      promptText += `- HUWAG gumamit ng markdown o special symbols\n`;
      promptText += `- Gumamit LAMANG ng plain text\n\n`;
      promptText += `Tumugon sa ${langName.toUpperCase()}.\n`;
    } else if (isBisaya) {
      promptText = `IKAW USA KA ${subjectDisplay.toUpperCase()} EXPERT.\n\n`;
      promptText += `PANGUTANA SA USER: "${prompt}"\n\n`;
      promptText += `INSTRUKSYON:\n`;
      promptText += `- Tubag isip usa ka ${subjectDisplay} expert\n`;
      promptText += `- Gamita ang ${langName.toUpperCase()} nga lengguwahe\n`;
      promptText += `- Paghatag og TUKMA ug PRECISE nga tubag\n`;
      promptText += `- Ibase ang tubag sa SCIENTIFIC ug ACADEMIC nga kahibalo\n`;
      if (wantsDetailed) {
        promptText += `- Paghatag og DETALYADO ug KOMPLETO nga pagpasabot\n`;
      } else {
        promptText += `- Paghatag og MUBO ug DIREKTA nga tubag\n`;
      }
      promptText += `- AYAW gamita ang markdown o special symbols\n`;
      promptText += `- Gamita LAMANG ang plain text\n\n`;
      promptText += `Tubag sa ${langName.toUpperCase()}.\n`;
    } else {
      promptText = `YOU ARE A ${subjectDisplay.toUpperCase()} EXPERT.\n\n`;
      promptText += `USER QUESTION: "${prompt}"\n\n`;
      promptText += `INSTRUCTIONS:\n`;
      promptText += `- Respond as a ${subjectDisplay} expert\n`;
      promptText += `- Use ${langName.toUpperCase()} language\n`;
      promptText += `- Provide ACCURATE and PRECISE answers\n`;
      promptText += `- Base answers on SCIENTIFIC and ACADEMIC knowledge\n`;
      if (wantsDetailed) {
        promptText += `- Provide DETAILED and COMPLETE explanations\n`;
      } else {
        promptText += `- Provide SHORT and DIRECT answers\n`;
      }
      promptText += `- DO NOT use markdown or special symbols\n`;
      promptText += `- Use ONLY plain text\n\n`;
      promptText += `Respond in ${langName.toUpperCase()}.\n`;
    }
    
    return promptText;
  },

  // ========== BUILD REPLY PROMPT ==========
  buildReplyPrompt(prompt, previousResponse, previousPrompt, subject, wantsDetailed, language) {
    const langName = this.getLanguageName(language);
    const subjectDisplay = subject.charAt(0).toUpperCase() + subject.slice(1);
    const isTagalog = language === 'tagalog' || language === 'filipino';
    const isBisaya = language === 'bisaya' || language === 'cebuano';
    
    let promptText = '';
    
    if (isTagalog) {
      promptText = `IKAW AY ISANG ${subjectDisplay.toUpperCase()} EXPERT.\n\n`;
      promptText += `NAUNAANG USAPAN:\nUser: "${previousPrompt || 'unknown'}"\nAI: "${previousResponse}"\n\n`;
      promptText += `BAGONG TANONG: "${prompt}"\n\n`;
      promptText += `- Panatilihin ang ${subjectDisplay} na konteksto\n`;
      promptText += `- Tumugon sa ${langName.toUpperCase()}\n`;
      promptText += `- Ipagpatuloy ang talakayan\n`;
      if (wantsDetailed) promptText += `- Magbigay ng DETALYADONG sagot\n`;
      else promptText += `- Magbigay ng MAIKLING sagot\n`;
    } else if (isBisaya) {
      promptText = `IKAW USA KA ${subjectDisplay.toUpperCase()} EXPERT.\n\n`;
      promptText += `UNA NGA PANAG-ISTORYA:\nUser: "${previousPrompt || 'unknown'}"\nAI: "${previousResponse}"\n\n`;
      promptText += `BAG-ONG PANGUTANA: "${prompt}"\n\n`;
      promptText += `- Padayon ang ${subjectDisplay} nga konteksto\n`;
      promptText += `- Tubag sa ${langName.toUpperCase()}\n`;
      promptText += `- Ipadayon ang diskusyon\n`;
      if (wantsDetailed) promptText += `- Paghatag og DETALYADO nga tubag\n`;
      else promptText += `- Paghatag og MUBO nga tubag\n`;
    } else {
      promptText = `YOU ARE A ${subjectDisplay.toUpperCase()} EXPERT.\n\n`;
      promptText += `PREVIOUS CONVERSATION:\nUser: "${previousPrompt || 'unknown'}"\nAI: "${previousResponse}"\n\n`;
      promptText += `NEW QUESTION: "${prompt}"\n\n`;
      promptText += `- Maintain the ${subjectDisplay} context\n`;
      promptText += `- Respond in ${langName.toUpperCase()}\n`;
      promptText += `- Continue the discussion\n`;
      if (wantsDetailed) promptText += `- Provide DETAILED answers\n`;
      else promptText += `- Provide SHORT answers\n`;
    }
    
    return promptText;
  },

  // ========== BUILD GENERAL PROMPT ==========
  buildGeneralPrompt(prompt, language, wantsDetailed) {
    const langName = this.getLanguageName(language);
    const isTagalog = language === 'tagalog' || language === 'filipino';
    const isBisaya = language === 'bisaya' || language === 'cebuano';
    
    let promptText = '';
    
    if (isTagalog) {
      promptText = `IKAW AY ISANG MULTI-MODAL AI ASSISTANT.\n\n`;
      promptText += `TANONG NG USER: "${prompt}"\n\n`;
      promptText += `INSTRUKSYON:\n`;
      promptText += `- Tumugon sa ${langName.toUpperCase()} na wika\n`;
      promptText += `- Magbigay ng TAMA at PRESISONG sagot\n`;
      promptText += `- Ibatay ang sagot sa SIYENTIPIKO at AKADEMIKONG kaalaman\n`;
      if (wantsDetailed) {
        promptText += `- Magbigay ng DETALYADO at KOMPLETONG paliwanag\n`;
      } else {
        promptText += `- Magbigay ng MAIKLI at DIREKTANG sagot\n`;
      }
      promptText += `- HUWAG gumamit ng markdown o special symbols\n`;
      promptText += `- Gumamit LAMANG ng plain text\n\n`;
      promptText += `Tumugon sa ${langName.toUpperCase()}.\n`;
    } else if (isBisaya) {
      promptText = `IKAW USA KA MULTI-MODAL AI ASSISTANT.\n\n`;
      promptText += `PANGUTANA SA USER: "${prompt}"\n\n`;
      promptText += `INSTRUKSYON:\n`;
      promptText += `- Tubag sa ${langName.toUpperCase()} nga lengguwahe\n`;
      promptText += `- Paghatag og TUKMA ug PRECISE nga tubag\n`;
      promptText += `- Ibase ang tubag sa SCIENTIFIC ug ACADEMIC nga kahibalo\n`;
      if (wantsDetailed) {
        promptText += `- Paghatag og DETALYADO ug KOMPLETO nga pagpasabot\n`;
      } else {
        promptText += `- Paghatag og MUBO ug DIREKTA nga tubag\n`;
      }
      promptText += `- AYAW gamita ang markdown o special symbols\n`;
      promptText += `- Gamita LAMANG ang plain text\n\n`;
      promptText += `Tubag sa ${langName.toUpperCase()}.\n`;
    } else {
      promptText = `YOU ARE A MULTI-MODAL AI ASSISTANT.\n\n`;
      promptText += `USER QUESTION: "${prompt}"\n\n`;
      promptText += `INSTRUCTIONS:\n`;
      promptText += `- Respond in ${langName.toUpperCase()} language\n`;
      promptText += `- Provide ACCURATE and PRECISE answers\n`;
      promptText += `- Base answers on SCIENTIFIC and ACADEMIC knowledge\n`;
      if (wantsDetailed) {
        promptText += `- Provide DETAILED and COMPLETE explanations\n`;
      } else {
        promptText += `- Provide SHORT and DIRECT answers\n`;
      }
      promptText += `- DO NOT use markdown or special symbols\n`;
      promptText += `- Use ONLY plain text\n\n`;
      promptText += `Respond in ${langName.toUpperCase()}.\n`;
    }
    
    return promptText;
  },

  // ========== MATH DETECTION ==========
  isMathProblem(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    
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
        return true;
      }
    }
    
    const mathKeywords = [
      'equation', 'algebra', 'geometry', 'trigonometry', 'calculus',
      'quadratic', 'polynomial', 'matrix', 'vector', 'derivative',
      'integral', 'sequence', 'series', 'permutation', 'combination',
      'binomial', 'logarithm', 'exponent', 'arithmetic', 'fraction',
      'decimal', 'percentage', 'statistics', 'probability', 'mean',
      'median', 'mode', 'variance', 'standard deviation',
      'grouped data', 'frequency distribution'
    ];
    
    const calculationWords = ['solve', 'find', 'calculate', 'compute', 'what is', 'determine'];
    
    let hasMathKeyword = false;
    let hasCalculationWord = false;
    
    for (const keyword of mathKeywords) {
      if (lower.includes(keyword)) {
        hasMathKeyword = true;
        break;
      }
    }
    
    for (const word of calculationWords) {
      if (lower.includes(word)) {
        hasCalculationWord = true;
        break;
      }
    }
    
    return hasMathKeyword && hasCalculationWord;
  },

  // ========== EXAMPLE REQUEST DETECTION ==========
  isExampleRequest(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    
    const exampleKeywords = [
      'example', 'examples', 'sample', 'samples',
      'give example', 'show example', 'provide example',
      'halimbawa', 'magbigay ng halimbawa', 'pananglitan'
    ];
    
    let isExample = false;
    for (const keyword of exampleKeywords) {
      if (lower.includes(keyword)) {
        isExample = true;
        break;
      }
    }
    
    if (!isExample) return false;
    
    // Check if it's a math example
    if (this.isMathProblem(prompt)) {
      return true;
    }
    
    // Check for math-specific example indicators
    const mathExampleIndicators = [
      'sequence', 'equation', 'quadratic', 'arithmetic', 'geometric',
      'grouped data', 'frequency', 'statistics', 'probability',
      'algebra', 'geometry', 'trigonometry', 'calculus'
    ];
    
    for (const indicator of mathExampleIndicators) {
      if (lower.includes(indicator)) {
        return true;
      }
    }
    
    return false;
  },

  // ========== DETECT MATH TOPIC ==========
  detectMathTopic(prompt) {
    if (!prompt) return 'general';
    const lower = prompt.toLowerCase();
    const topics = {
      arithmetic: ['addition', 'subtraction', 'multiplication', 'division', 'add', 'subtract', 'multiply', 'divide', 'sum', 'difference', 'product', 'quotient', 'fraction', 'decimal', 'percentage', 'percent', 'arithmetic', 'pagdadagdag', 'pagbabawas', 'pagpaparami', 'paghahati'],
      algebra: ['algebra', 'equation', 'quadratic', 'polynomial', 'simplify', 'factor', 'expand', 'variable', 'expression', 'inequality', 'solve for', 'find x', 'alhebra', 'ekwasyon'],
      geometry: ['geometry', 'area', 'perimeter', 'volume', 'circumference', 'triangle', 'rectangle', 'circle', 'square', 'angle', 'pythagorean'],
      trigonometry: ['trigonometry', 'sine', 'cosine', 'tangent', 'sin', 'cos', 'tan'],
      calculus: ['calculus', 'derivative', 'integral', 'differentiation', 'integration', 'limit', 'function'],
      statistics: ['statistics', 'probability', 'mean', 'median', 'mode', 'standard deviation', 'variance', 'quartile', 'frequency distribution', 'grouped data', 'ungrouped data', 'data set'],
      sequences: ['sequence', 'series', 'arithmetic sequence', 'geometric sequence', 'summation', 'nth term'],
      matrices: ['matrix', 'matrices', 'determinant', 'vector']
    };
    for (const [topic, keywords] of Object.entries(topics)) {
      if (keywords.some(keyword => lower.includes(keyword))) {
        return topic;
      }
    }
    return 'general';
  },

  // ========== NEW FUNCTIONS ==========
  isHumanizeCommand(prompt) {
    return prompt.toLowerCase().startsWith('humanize ');
  },

  isTranslateCommand(prompt) {
    return prompt.toLowerCase().startsWith('translate ');
  },

  isSummarizeCommand(prompt) {
    return prompt.toLowerCase().startsWith('summarize ');
  },

  isElaborateCommand(prompt) {
    return prompt.toLowerCase().startsWith('elaborate ');
  },

  isParaphraseCommand(prompt) {
    return prompt.toLowerCase().startsWith('paraphrase ');
  },

  async handleHumanize(senderId, prompt, token) {
    const text = prompt.replace(/^humanize\s+/i, '').trim();
    if (!text) {
      await sendMessage(senderId, { text: 'Usage: humanize [text]' }, token);
      return;
    }
    const apiPrompt = `Humanize the following text to make it sound more natural and human-like: "${text}"`;
    const response = await this.callAPI(apiPrompt);
    await this.sendChunks(senderId, this.cleanResponse(response || 'No response'), token);
  },

  async handleTranslate(senderId, prompt, token) {
    const text = prompt.replace(/^translate\s+/i, '').trim();
    if (!text) {
      await sendMessage(senderId, { text: 'Usage: translate [text] to [language]' }, token);
      return;
    }
    const apiPrompt = `Translate the following text: "${text}"`;
    const response = await this.callAPI(apiPrompt);
    await this.sendChunks(senderId, this.cleanResponse(response || 'No response'), token);
  },

  async handleSummarize(senderId, prompt, token) {
    const text = prompt.replace(/^summarize\s+/i, '').trim();
    if (!text) {
      await sendMessage(senderId, { text: 'Usage: summarize [text]' }, token);
      return;
    }
    const apiPrompt = `Summarize the following text concisely: "${text}"`;
    const response = await this.callAPI(apiPrompt);
    await this.sendChunks(senderId, this.cleanResponse(response || 'No response'), token);
  },

  async handleElaborate(senderId, prompt, token) {
    const text = prompt.replace(/^elaborate\s+/i, '').trim();
    if (!text) {
      await sendMessage(senderId, { text: 'Usage: elaborate [text]' }, token);
      return;
    }
    const apiPrompt = `Elaborate and explain in detail the following: "${text}"`;
    const response = await this.callAPI(apiPrompt);
    await this.sendChunks(senderId, this.cleanResponse(response || 'No response'), token);
  },

  async handleParaphrase(senderId, prompt, token) {
    const text = prompt.replace(/^paraphrase\s+/i, '').trim();
    if (!text) {
      await sendMessage(senderId, { text: 'Usage: paraphrase [text]' }, token);
      return;
    }
    const apiPrompt = `Paraphrase the following text while maintaining its meaning: "${text}"`;
    const response = await this.callAPI(apiPrompt);
    await this.sendChunks(senderId, this.cleanResponse(response || 'No response'), token);
  },

  // ========== TYPO CORRECTION ==========
  correctTypos(prompt) {
    if (!prompt) return prompt;
    const typoMap = {
      'pingi': 'paki', 'pengi': 'paki', 'peng': 'paki',
      'ping': 'paki', 'pking': 'paki', 'pk': 'paki',
      'pak': 'paki', 'pki': 'paki',
      'pls': 'please', 'plz': 'please', 'pleas': 'please',
      'mre': 'more', 'mor': 'more',
      'elab': 'elaborate', 'expln': 'explanation',
      'expl': 'explain', 'explainn': 'explain',
      'plihug': 'palihug', 'plihg': 'palihug',
      'detailled': 'detailed', 'detialed': 'detailed',
      'explaination': 'explanation', 'elaborationn': 'elaboration',
      'summarry': 'summary', 'summry': 'summary',
      'exmple': 'example', 'sampel': 'sample'
    };
    let corrected = prompt;
    const lower = prompt.toLowerCase();
    for (const [typo, correct] of Object.entries(typoMap)) {
      if (lower.includes(typo)) {
        corrected = corrected.replace(new RegExp(typo, 'gi'), correct);
      }
    }
    return corrected;
  },

  // ========== TOPIC MANAGEMENT ==========
  findBestTopicMatch(prompt, history) {
    if (!history || !history.topicHistory) return null;
    const userLower = prompt.toLowerCase();
    const userWords = userLower.split(/\s+/).filter(w => w.length > 2);
    let bestKey = null;
    let bestScore = 0;
    for (const [key, data] of Object.entries(history.topicHistory)) {
      let score = 0;
      const response = data.response || data;
      const responseLower = response.toLowerCase();
      const keywords = data.keywords || [];
      for (const kw of keywords) {
        if (userLower.includes(kw)) score += 8;
      }
      for (const word of userWords) {
        if (word.length > 2 && responseLower.includes(word)) score += 2;
      }
      if (userLower.includes(key.toLowerCase())) score += 10;
      if (data.prompt && userLower.includes(data.prompt.toLowerCase())) score += 8;
      if (data.timestamp && (Date.now() - data.timestamp) < 600000) score += 5;
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    return (bestScore > 0) ? bestKey : null;
  },

  extractKeywordsFromResponse(response) {
    if (!response) return [];
    const lower = response.toLowerCase();
    const keywords = [];
    const topicWords = [
      'activity sheet', 'worksheet', 'quiz', 'homework', 'assignment',
      'math', 'science', 'english', 'tle', 'filipino',
      'problem', 'equation', 'solution', 'answer', 'explanation',
      'composting', 'fermentation', 'fertilizer', 'crops', 'harvest',
      'agriculture', 'biology', 'chemistry', 'physics',
      'environment', 'pollution', 'recycle', 'biodegradable',
      'pathogen', 'spoilage', 'shelf life', 'market value',
      'meme', 'joke', 'humor', 'funny', 'comedy',
      'photo', 'picture', 'image', 'screenshot'
    ];
    for (const word of topicWords) {
      if (lower.includes(word)) keywords.push(word);
    }
    const stopWords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ho', 'oho', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'don', 'now'];
    const words = lower.split(/\s+/);
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].length > 2 && !stopWords.includes(words[i]) &&
          words[i+1].length > 2 && !stopWords.includes(words[i+1])) {
        const phrase = words[i] + ' ' + words[i+1];
        if (phrase.length > 4 && !keywords.includes(phrase)) {
          keywords.push(phrase);
        }
      }
    }
    return [...new Set(keywords)].slice(0, 20);
  },

  isReturnToTopicRequest(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    const patterns = [
      'balik tayo sa', 'balikan natin', 'going back to',
      'back to the topic', 'return to topic', 'balik sa topic',
      'balik tayo sa topic', 'balikan ang topic', 'balik sa pinag-usapan',
      'continue about', 'continue with', 'tuloy natin ang', 'ituloy ang',
      'balik tayo', 'balikan natin yung', 'balikan natin ang',
      'balik sa', 'balikan ang', 'tungkol sa last', 'tungkol sa nauna',
      'about the previous', 'about the last'
    ];
    if (patterns.some(p => lower.includes(p))) return true;
    const refs = [
      'last response', 'last reply', 'last answer', 'last message',
      'previous response', 'previous reply', 'previous answer',
      'nauna mong sagot', 'nauna mong reply', 'huling sagot', 'huling reply',
      'sagot mo kanina', 'reply mo kanina', 'sinabi mo kanina'
    ];
    return refs.some(r => lower.includes(r));
  },

  extractTopicKey(prompt) {
    if (!prompt) return null;
    const words = prompt.toLowerCase().split(/\s+/);
    const stopWords = ['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should', 'may', 'might', 'must', 'can', 'could', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'just', 'don', 'now', 'ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ho', 'oho'];
    const keywords = words.filter(w => w.length > 3 && !stopWords.includes(w));
    const key = keywords.slice(0, 5).join(' ');
    return key.length > 3 ? key.substring(0, 50) : prompt.substring(0, 50);
  },

  // ========== LANGUAGE DETECTION ==========
  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();
    const languages = {
      tagalog: {
        keywords: ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'hindi', 'oo', 'salamat', 'paki', 'tanong', 'sagot', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'halimbawa', 'lutasin', 'hanapin', 'sagutin'],
        minMatches: 2
      },
      bisaya: {
        keywords: ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'tabang', 'pananglitan', 'sulbad', 'pangitaa', 'kwentaha'],
        minMatches: 2
      },
      cebuano: {
        keywords: ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'tabang', 'pananglitan', 'sulbad', 'pangitaa', 'kwentaha'],
        minMatches: 2
      }
    };
    let bestMatch = 'english';
    let bestScore = 0;
    const words = lower.split(/\s+/);
    for (const [lang, config] of Object.entries(languages)) {
      let matchCount = 0;
      for (const word of words) {
        if (config.keywords.includes(word)) matchCount++;
      }
      if (matchCount >= config.minMatches && matchCount > bestScore) {
        bestMatch = lang;
        bestScore = matchCount;
      }
    }
    return bestMatch;
  },

  getLanguageName(languageCode) {
    const names = {
      'english': 'English', 'tagalog': 'Tagalog', 'filipino': 'Filipino',
      'bisaya': 'Bisaya', 'cebuano': 'Cebuano', 'ilocano': 'Ilocano',
      'waray': 'Waray', 'hiligaynon': 'Hiligaynon', 'kapampangan': 'Kapampangan',
      'spanish': 'Spanish'
    };
    return names[languageCode] || 'English';
  },

  // ========== CASUAL CONVERSATION ==========
  isCasualConversation(prompt) {
    if (!prompt) return false;
    const lower = prompt.toLowerCase();
    const casualPatterns = [
      'kamusta', 'kumusta', 'musta', 'kamusta ka',
      'ano ginagawa mo', 'ano balita', 'kamusta na',
      'ayos lang', 'ok lang', 'buti naman',
      'salamat', 'sige', 'cge', 'ge', 'ok', 'okay',
      'hehe', 'haha', 'lol', 'hmm', 'ah', 'oh',
      'nice', 'galing', 'astig', 'ayos',
      'ikaw', 'ikaw ba', 'eh ikaw',
      'unsa ka', 'unsa man', 'naunsa ka',
      'unsa balita', 'ok ra', 'maayo ra',
      'how are you', 'hows it going', 'whats up',
      'how you doing', 'sup', 'yo', 'thanks',
      'hows your day', 'whats new'
    ];
    return casualPatterns.some(p => lower.includes(p));
  },

  buildCasualPrompt(prompt, language) {
    const langName = this.getLanguageName(language);
    let final = '';
    if (language === 'tagalog' || language === 'bisaya' || language === 'cebuano') {
      final += `Ikaw ay nakikipag-usap sa isang user sa ${langName.toUpperCase()}.\n`;
      final += `Sinabi ng user: "${prompt}"\n\n`;
      final += `Tumugon nang NATURAL sa ${langName.toUpperCase()} tulad ng isang tunay na tao.\n`;
      final += `Panatilihing MAIKLI at NATURAL ang mga tugon (1-2 pangungusap).\n`;
      final += `Tumugon sa ${langName.toUpperCase()} NGAYON.`;
    } else {
      final += `You are having a CASUAL CONVERSATION with a user in ${langName.toUpperCase()}.\n`;
      final += `The user said: "${prompt}"\n\n`;
      final += `Respond NATURALLY in ${langName.toUpperCase()} like a real person.\n`;
      final += `Keep responses SHORT and NATURAL (1-2 sentences).\n`;
      final += `Respond in ${langName.toUpperCase()}.`;
    }
    return final;
  },

  // ========== IMAGE ANALYSIS ==========
  async callGeminiAPI(prompt, imageUrl, detectedLanguage = 'english') {
    try {
      const geminiPrompt = this.buildGeminiPrompt(prompt, detectedLanguage);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(geminiPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(apiUrl, { timeout: 90000, headers: { 'Accept': 'application/json' } });
      if (!response || !response.data) throw new Error('No response from Gemini API');
      return this.processGeminiResponse(response.data.response || '');
    } catch (error) {
      console.error('[Gemini] Error:', error.message);
      const fallbackPrompt = `The user sent an image. The user asked: ${prompt || 'Please describe what you see'}. Provide a helpful response.`;
      const response = await this.callAPI(fallbackPrompt);
      return this.cleanResponse(response || 'Cannot analyze the image. Please try again.');
    }
  },

  buildGeminiPrompt(userPrompt, language = 'english') {
    const langName = this.getLanguageName(language);
    let prompt;
    
    if (language === 'tagalog' || language === 'bisaya' || language === 'cebuano') {
      prompt = `Ikaw ay isang AI assistant na nagsusuri ng isang imahe.\n\n`;
      prompt += `UNAHIN MONG TUKUYIN KUNG ANONG KLASE NG IMAGE ITO, pagkatapos ay tumugon nang ANGKOP.\n\n`;
      prompt += `CLASSIFICATION AT RESPONSE:\n\n`;
      prompt += `1. ACTIVITY SHEET / WORKSHEET / QUIZ / EXAM:\n`;
      prompt += `   - HUWAG isama ang pangalan ng estudyante\n`;
      prompt += `   - HUWAG isama ang grade at section\n`;
      prompt += `   - HUWAG maglagay ng intro\n`;
      prompt += `   - DIREKTA sa mga sagot\n`;
      prompt += `   - BASAHIN MABUTI ANG INSTRUCTIONS NG BAWAT PART\n`;
      prompt += `   - SUNDIN ANG EXACT FORMAT na hinihingi ng instructions\n\n`;
      prompt += `   KUNG SEQUENCING (Arrange in order):\n`;
      prompt += `   - Ibigay ang tamang ORDER ng steps\n`;
      prompt += `   - Isulat ang number (1, 2, 3, etc.) sa tamang sequence\n`;
      prompt += `   - Ipakita ang steps sa TAMANG ORDER\n\n`;
      prompt += `   KUNG CHECK OR X (Proper/Improper):\n`;
      prompt += `   - Gumamit ng ✓ para sa PROPER\n`;
      prompt += `   - Gumamit ng X para sa IMPROPER\n`;
      prompt += `   - HUWAG iwanang blank ang mga sagot\n`;
      prompt += `   - Bawat item dapat may ✓ o X\n\n`;
      prompt += `   KUNG MULTIPLE CHOICE:\n`;
      prompt += `   - Ibigay ang LETTER ng tamang sagot\n`;
      prompt += `   - Isulat ang buong sagot\n\n`;
      prompt += `   KUNG ENUMERATION:\n`;
      prompt += `   - Ibigay ang KUMPLETONG listahan\n`;
      prompt += `   - Sundin ang hinihinging bilang ng items\n\n`;
      prompt += `   KUNG ESSAY (1-2 sentences):\n`;
      prompt += `   - Ibigay ang sagot sa 1-2 pangungusap LAMANG\n`;
      prompt += `   - HUWAG lumampas sa hinihinging bilang ng pangungusap\n\n`;
      prompt += `   KUNG MATH:\n`;
      prompt += `   - Ipakita ang step-by-step solution\n`;
      prompt += `   - Ibigay ang pinal na sagot\n\n`;
      prompt += `   MAHALAGA:\n`;
      prompt += `   - Panatilihin ang ORIGINAL na format ng activity sheet\n`;
      prompt += `   - Ibigay ang SAGOT LAMANG, walang explanation kung hindi kailangan\n`;
      prompt += `   - Kung may blank na kailangan sagutan, LAGYAN ng sagot\n`;
      prompt += `   - HUWAG iwanang blank ang anumang item\n\n`;
      prompt += `2. MATH PROBLEM / EQUATION / GRAPH:\n`;
      prompt += `   - Ipakita ang KUMPLETONG step-by-step solution\n`;
      prompt += `   - Ibigay ang pinal na sagot\n\n`;
      prompt += `3. INFOGRAPHIC / EDUCATIONAL IMAGE:\n`;
      prompt += `   - Ibuod sa 2-3 pangungusap LAMANG\n`;
      prompt += `   - Sabihin ang pangunahing mensahe\n\n`;
      prompt += `4. PAINTING / DRAWING / ARTWORK:\n`;
      prompt += `   - Ilarawan sa 1-2 pangungusap\n`;
      prompt += `   - Kung may deep meaning: Ipaliwanag sa 1-2 pangungusap\n\n`;
      prompt += `5. MEME / JOKE / HUMOROUS IMAGE:\n`;
      prompt += `   - Ipaliwanag ang biro sa 1 pangungusap\n\n`;
      prompt += `6. PHOTO / CASUAL IMAGE:\n`;
      prompt += `   - Ilarawan sa 1-2 pangungusap lamang\n\n`;
      prompt += `MAHALAGANG PANUNTUNAN:\n`;
      prompt += `- DIREKTA sa mga sagot, WALANG intro\n`;
      prompt += `- SUNDIN ANG INSTRUCTIONS NG ACTIVITY SHEET\n`;
      prompt += `- HUWAG iwanang blank ang mga sagot\n`;
      prompt += `- Gumamit ng ✓ o X kung hinihingi\n`;
      prompt += `- Ibigay ang tamang ORDER kung sequencing\n`;
      prompt += `- WALANG translation\n`;
      prompt += `- Tumugon sa ${langName.toUpperCase()} LAMANG\n\n`;
      prompt += `TANONG NG USER: ${userPrompt || 'Suriin ang imaheng ito'}`;
    } else {
      prompt = `You are an AI assistant analyzing an image.\n\n`;
      prompt += `FIRST IDENTIFY WHAT TYPE OF IMAGE THIS IS, then respond APPROPRIATELY.\n\n`;
      prompt += `CLASSIFICATION AND RESPONSE:\n\n`;
      prompt += `1. ACTIVITY SHEET / WORKSHEET / QUIZ / EXAM:\n`;
      prompt += `   - DO NOT include student name\n`;
      prompt += `   - DO NOT include grade and section\n`;
      prompt += `   - DO NOT add intro\n`;
      prompt += `   - DIRECTLY provide answers\n`;
      prompt += `   - READ THE INSTRUCTIONS OF EACH PART CAREFULLY\n`;
      prompt += `   - FOLLOW THE EXACT FORMAT required by instructions\n\n`;
      prompt += `   IF SEQUENCING (Arrange in order):\n`;
      prompt += `   - Provide the correct ORDER of steps\n`;
      prompt += `   - Write the number (1, 2, 3, etc.) in correct sequence\n`;
      prompt += `   - Show steps in CORRECT ORDER\n\n`;
      prompt += `   IF CHECK OR X (Proper/Improper):\n`;
      prompt += `   - Use ✓ for PROPER\n`;
      prompt += `   - Use X for IMPROPER\n`;
      prompt += `   - DO NOT leave answers blank\n`;
      prompt += `   - Each item should have ✓ or X\n\n`;
      prompt += `   IF MULTIPLE CHOICE:\n`;
      prompt += `   - Provide the LETTER of correct answer\n`;
      prompt += `   - Write the complete answer\n\n`;
      prompt += `   IF ENUMERATION:\n`;
      prompt += `   - Provide COMPLETE list\n`;
      prompt += `   - Follow the required number of items\n\n`;
      prompt += `   IF ESSAY (1-2 sentences):\n`;
      prompt += `   - Provide answer in 1-2 sentences ONLY\n`;
      prompt += `   - DO NOT exceed the required number of sentences\n\n`;
      prompt += `   IF MATH:\n`;
      prompt += `   - Show step-by-step solution\n`;
      prompt += `   - Provide final answer\n\n`;
      prompt += `   IMPORTANT:\n`;
      prompt += `   - Maintain the ORIGINAL format of activity sheet\n`;
      prompt += `   - Provide ANSWER ONLY, no explanation if not needed\n`;
      prompt += `   - If there are blanks to fill, FILL them with answers\n`;
      prompt += `   - DO NOT leave any item blank\n\n`;
      prompt += `2. MATH PROBLEM / EQUATION / GRAPH:\n`;
      prompt += `   - Show COMPLETE step-by-step solution\n`;
      prompt += `   - Provide final answer\n\n`;
      prompt += `3. INFOGRAPHIC / EDUCATIONAL IMAGE:\n`;
      prompt += `   - Summarize in 2-3 sentences ONLY\n`;
      prompt += `   - State the main message\n\n`;
      prompt += `4. PAINTING / DRAWING / ARTWORK:\n`;
      prompt += `   - Describe in 1-2 sentences\n`;
      prompt += `   - If deep meaning: Explain in 1-2 sentences\n\n`;
      prompt += `5. MEME / JOKE / HUMOROUS IMAGE:\n`;
      prompt += `   - Explain the joke in 1 sentence\n\n`;
      prompt += `6. PHOTO / CASUAL IMAGE:\n`;
      prompt += `   - Describe in 1-2 sentences only\n\n`;
      prompt += `IMPORTANT RULES:\n`;
      prompt += `- DIRECTLY provide answers, NO intro\n`;
      prompt += `- FOLLOW THE INSTRUCTIONS of the activity sheet\n`;
      prompt += `- DO NOT leave answers blank\n`;
      prompt += `- Use ✓ or X if required\n`;
      prompt += `- Provide correct ORDER if sequencing\n`;
      prompt += `- NO translations\n`;
      prompt += `- Respond in ${langName.toUpperCase()} ONLY\n\n`;
      prompt += `USER QUESTION: ${userPrompt || 'Analyze this image'}`;
    }
    return prompt;
  },

  processGeminiResponse(response) {
    let processed = response || '';
    processed = processed
      .replace(/^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i, '')
      .replace(/^Here is my analysis.*?\n/i, '')
      .replace(/^Let me analyze.*?\n/i, '')
      .replace(/^Based on my analysis.*?\n/i, '')
      .replace(/^I can see that.*?\n/i, '')
      .replace(/^Ako ay si Gemini.*?\n/i, '')
      .replace(/^Narito ang aking analysis.*?\n/i, '')
      .replace(/^The image is.*?\n/i, '')
      .replace(/^Ang larawan ay.*?\n/i, '')
      .replace(/^The image shows.*?\n/i, '')
      .replace(/^Ang larawan ay nagpapakita.*?\n/i, '')
      .replace(/^The image appears.*?\n/i, '')
      .replace(/^This image depicts.*?\n/i, '')
      .replace(/^Ang imaheng ito ay.*?\n/i, '')
      .replace(/^This image is.*?\n/i, '')
      .replace(/^Here's a detailed description.*?\n/i, '')
      .replace(/^Narito ang detalyadong.*?\n/i, '')
      .replace(/^This is an activity sheet.*?\n/i, '')
      .replace(/^Ito ay isang activity sheet.*?\n/i, '')
      .replace(/^I will read and answer.*?\n/i, '')
      .replace(/^Babasahin ko at sasagutin.*?\n/i, '')
      .replace(/^Name:.*?\n/i, '')
      .replace(/^Pangalan:.*?\n/i, '')
      .replace(/^Grade & Section:.*?\n/i, '')
      .replace(/^Baitang at Seksyon:.*?\n/i, '')
      .replace(/^Grade and Section:.*?\n/i, '')
      .replace(/^---+\n/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    processed = processed.replace(/\s*\([^)]*[A-Za-z]{20,}[^)]*\)/g, '');
    
    processed = processed
      .replace(/^\s*[\*\-•]\s*Landscape:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Lake:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Foreground:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Activities.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*People:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Overall Mood:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Canoeing:.*?\n/gim, '')
      .replace(/^\s*[\*\-•]\s*Barbecue.*?\n/gim, '');
    
    const hasMathOrQuiz = processed.includes('Step 1:') || 
                          processed.includes('Hakbang 1:') ||
                          processed.includes('1.') ||
                          processed.includes('Paliwanag:') ||
                          processed.includes('Explanation:') ||
                          processed.includes('PART I') ||
                          processed.includes('PART II') ||
                          processed.includes('PART III');
    
    if (!hasMathOrQuiz) {
      const sentences = processed.split(/(?<=[.!?])\s+/);
      if (sentences.length > 3) {
        processed = sentences.slice(0, 3).join(' ');
      }
    }
    
    return this.cleanResponse(processed);
  },

  buildImageFollowUpPrompt(prompt, previousResponse, previousPrompt, wantsDetailed, language) {
    const langName = this.getLanguageName(language);
    let final = `PREVIOUS IMAGE ANALYSIS:\n${previousResponse}\n\n`;
    final += `USER ASKED: "${prompt}"\n\n`;
    final += `Provide a helpful response in ${langName.toUpperCase()}.\n`;
    return final;
  },

  buildImageModificationPrompt(prompt, previousResponse, wantsDetailed, language) {
    const langName = this.getLanguageName(language);
    let final = `PREVIOUS IMAGE ANALYSIS:\n${previousResponse}\n\n`;
    final += `USER REQUEST: "${prompt}"\n\n`;
    final += `Modify the analysis as requested.\n`;
    final += `Respond in ${langName.toUpperCase()}.`;
    return final;
  },

  // ========== MODIFICATION & FOLLOW-UP ==========
  isModificationRequest(prompt) {
    const patterns = [
      'make it short', 'shorten', 'simplify', 'clarify',
      'explain more', 'elaborate', 'more details',
      'summarize', 'summary', 'brief', 'concise',
      'paki explain', 'paki linaw', 'paliwanag', 'ipaliwanag'
    ];
    return patterns.some(p => prompt.includes(p));
  },

  isFollowUpRequest(prompt) {
    const keywords = [
      'elaborate', 'explain', 'detail', 'more', 'summarize',
      'simplify', 'clarify', 'example', 'sample',
      'paki', 'please', 'what about', 'how about'
    ];
    return keywords.some(k => prompt.includes(k));
  },

  isNewTopic(prompt, previousPrompt, originalPrompt) {
    if (!previousPrompt) return true;
    if (this.isFollowUpRequest(prompt)) return false;
    const prevWords = previousPrompt.split(' ').filter(w => w.length > 3);
    const currentWords = prompt.split(' ').filter(w => w.length > 3);
    const hasRelatedWords = prevWords.some(w => 
      currentWords.some(cw => cw.includes(w) || w.includes(cw))
    );
    if (!hasRelatedWords && originalPrompt.length > 5) return true;
    return false;
  },

  isContextualQuestion(prompt, previousPrompt) {
    if (!previousPrompt) return false;
    const patterns = ['so', 'what about', 'how about', 'why', 'how', 'what if'];
    return patterns.some(p => prompt.includes(p));
  },

  // ========== SPECIAL COMMANDS DETECTION ==========
  isLyricsRequest(prompt) {
    const keywords = ['lyrics', 'lyric', 'letra', 'song lyrics'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
  },

  isGenerateCommand(prompt) {
    const commands = ['generate', 'image', 'img', 'show'];
    return commands.some(cmd => prompt.toLowerCase().startsWith(cmd + ' '));
  },

  isImageRequest(prompt) {
    const lower = prompt.toLowerCase();
    const patterns = [
      'show me image', 'show me picture', 'picture of', 'image of',
      'larawan ng', 'litrato ng', 'imahe ng'
    ];
    return patterns.some(pattern => lower.includes(pattern));
  },

  isMusicRequest(prompt) {
    const keywords = ['play', 'song', 'music', 'track', 'audio'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
  },

  isScholarCommand(prompt) {
    const commands = ['gscholar', 'scholar', 'research'];
    return commands.some(cmd => prompt.toLowerCase().startsWith(cmd + ' '));
  },

  isResearchQuery(prompt) {
    const lower = prompt.toLowerCase();
    const patterns = [
      'find research', 'find study', 'research about', 'study about',
      'academic paper', 'scholarly article'
    ];
    return patterns.some(pattern => lower.includes(pattern));
  },

  // ========== HANDLERS ==========
  async handleLyricsSearch(senderId, prompt, token) {
    let searchTerm = prompt;
    const removeKeywords = ['lyrics', 'lyric', 'letra', 'song lyrics', 'lyrics of', 'lyrics ng', 'letra ng', 'lyrics for', 'lyrics to', 'full lyrics', 'complete lyrics', 'kanta', 'awit', 'awitin'];
    for (const keyword of removeKeywords) {
      if (searchTerm.toLowerCase().includes(keyword)) {
        searchTerm = searchTerm.toLowerCase().replace(keyword, '').trim();
        break;
      }
    }
    let title = searchTerm;
    let artist = '';
    const parts = searchTerm.split(/\s+by\s+|\s+-\s+|\s+of\s+|\s+ng\s+|\s+ni\s+/i);
    if (parts.length > 1) {
      title = parts[0].trim();
      artist = parts[1].trim();
    }
    if (!title) {
      await sendMessage(senderId, { text: 'Usage: lyrics [song title] by [artist]' }, token);
      return;
    }
    try {
      let query = title;
      if (artist) query += ` ${artist}`;
      const encodedQuery = encodeURIComponent(query);
      const apiUrl = `https://api-library-kohi-production.up.railway.app/api/lyrics?query=${encodedQuery}`;
      const response = await axios.get(apiUrl, { timeout: 15000 });
      const data = response.data;
      if (!data.status || !data.data) {
        await sendMessage(senderId, { text: `Walang nakitang lyrics para sa "${title}".` }, token);
        return;
      }
      const lyricsData = data.data;
      const songTitle = lyricsData.title || title;
      const songArtist = lyricsData.artist || artist || 'Unknown Artist';
      const lyrics = lyricsData.lyrics || 'Lyrics not available.';
      let formattedLyrics = this.formatLyrics(lyrics);
      let message = `${songTitle}\nArtist: ${songArtist}\n\n${formattedLyrics}`;
      await this.sendChunks(senderId, message, token);
    } catch (error) {
      console.error('[Lyrics] Error:', error.message);
      await sendMessage(senderId, { text: `Error sa pagkuha ng lyrics. Subukan muli.` }, token);
    }
  },

  formatLyrics(lyrics) {
    let formatted = lyrics;
    if (!formatted.includes('[Verse') && !formatted.includes('[Chorus') && !formatted.includes('[Bridge')) {
      const lines = formatted.split('\n');
      let newLines = [];
      let isFirst = true;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') { newLines.push(''); continue; }
        if (isFirst && line.length > 0) {
          newLines.push(`[Verse 1]`);
          newLines.push(line);
          isFirst = false;
        } else {
          newLines.push(line);
        }
      }
      formatted = newLines.join('\n');
    }
    return formatted;
  },

  async handleImageGeneration(senderId, prompt, token) {
    let searchTerm = prompt;
    let imageCount = 10;
    const commands = ['generate', 'image', 'img', 'show'];
    for (const cmd of commands) {
      if (searchTerm.toLowerCase().startsWith(cmd)) {
        searchTerm = searchTerm.slice(cmd.length).trim();
        break;
      }
    }
    const args = searchTerm.split(' ');
    const lastArg = args[args.length - 1];
    if (!isNaN(lastArg) && lastArg > 0 && lastArg <= 30) {
      imageCount = parseInt(lastArg);
      searchTerm = args.slice(0, -1).join(' ');
    }
    if (!searchTerm) {
      await sendMessage(senderId, { text: 'Usage: generate [search term] [number]' }, token);
      return;
    }
    try {
      const response = await axios.get('https://hiroshi-api.onrender.com/image/pinterest', {
        params: { search: searchTerm, limit: imageCount }
      });
      const images = (response.data?.data || []).filter(url => this.isValidUrl(url));
      if (images.length === 0) {
        await sendMessage(senderId, { text: `Walang nakitang mga larawan para sa "${searchTerm}".` }, token);
        return;
      }
      for (const imageUrl of images.slice(0, imageCount)) {
        await sendMessage(senderId, { attachment: { type: 'image', payload: { url: imageUrl } } }, token);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error('[Generate] Error:', error.message);
      await sendMessage(senderId, { text: `Error sa pagkuha ng mga larawan.` }, token);
    }
  },

  isValidUrl(string) {
    try { new URL(string); return true; } catch (_) { return false; }
  },

  async handleMusicSearch(senderId, prompt, token) {
    let searchTerm = prompt;
    const removeKeywords = ['play', 'song', 'music', 'track', 'audio'];
    for (const keyword of removeKeywords) {
      if (searchTerm.toLowerCase().includes(keyword)) {
        searchTerm = searchTerm.toLowerCase().replace(keyword, '').trim();
        break;
      }
    }
    if (!searchTerm) {
      await sendMessage(senderId, { text: 'Usage: play [song title]' }, token);
      return;
    }
    try {
      const encodedSearch = encodeURIComponent(searchTerm);
      const apiUrl = `https://betadash-api-swordslush-production.up.railway.app/sc?search=${encodedSearch}`;
      const response = await axios.get(apiUrl, { timeout: 30000 });
      const data = response.data;
      if (!data || !data.results || data.results.length === 0) {
        await sendMessage(senderId, { text: `Walang nakitang resulta para sa "${searchTerm}".` }, token);
        return;
      }
      let message = `SoundCloud Results para sa "${searchTerm}"\n\n`;
      for (let i = 0; i < Math.min(5, data.results.length); i++) {
        const track = data.results[i].data;
        message += `${i + 1}. ${track.title || 'Unknown'}\n`;
        message += `Artist: ${track.user?.username || 'Unknown'}\n`;
        message += `Duration: ${this.formatDuration(track.duration || 0)}\n`;
        message += `Link: ${track.permalink_url || 'N/A'}\n\n`;
      }
      await this.sendChunks(senderId, message, token);
    } catch (error) {
      console.error('[Music] Error:', error.message);
      await sendMessage(senderId, { text: `Error sa paghahanap. Subukan muli.` }, token);
    }
  },

  formatDuration(ms) {
    if (!ms) return 'Unknown';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  },

  async handleScholarSearch(senderId, prompt, token) {
    let query = prompt;
    const commands = ['gscholar', 'scholar', 'research'];
    for (const cmd of commands) {
      if (query.toLowerCase().startsWith(cmd)) {
        query = query.slice(cmd.length).trim();
        break;
      }
    }
    if (!query) {
      await sendMessage(senderId, { text: 'Usage: gscholar [search query]' }, token);
      return;
    }
    try {
      const response = await axios.get('https://serpapi.com/search', {
        params: { engine: 'google_scholar', q: query, api_key: SERPAPI_KEY, num: 5 },
        timeout: 30000
      });
      const results = response.data?.organic_results || [];
      if (results.length === 0) {
        await sendMessage(senderId, { text: `Walang nakitang resulta para sa "${query}".` }, token);
        return;
      }
      let message = `Google Scholar Results para sa "${query}"\n\n`;
      for (let i = 0; i < results.length; i++) {
        const paper = results[i];
        message += `${i + 1}. ${paper.title || 'No title'}\n`;
        message += `Authors: ${this.formatAuthorsDisplay(paper.publication_info?.summary || '')}\n`;
        message += `Link: ${paper.link || 'N/A'}\n\n`;
      }
      await this.sendChunks(senderId, message, token);
    } catch (error) {
      console.error('[Scholar] Error:', error.message);
      await sendMessage(senderId, { text: 'Error sa paghahanap sa Google Scholar.' }, token);
    }
  },

  formatAuthorsDisplay(authors) {
    if (!authors) return 'Unknown';
    const list = authors.split(',').map(a => a.trim()).filter(a => a);
    if (list.length === 0) return 'Unknown';
    if (list.length <= 3) return list.join(', ');
    return `${list.slice(0, 3).join(', ')}, et al.`;
  },

  // ========== USER INFO ==========
  isOwnerQuestion(prompt) {
    const keywords = ['who is your owner', 'who created you', 'who made you', 'sino gumawa sayo'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
  },

  isUserInfoQuestion(prompt) {
    const keywords = ['what is my name', 'ano pangalan ko', 'my name'];
    return keywords.some(k => prompt.toLowerCase().includes(k));
  },

  async handleUserInfo(senderId, prompt, token) {
    try {
      const userInfo = await this.getUserInfo(senderId, token);
      const lang = this.detectLanguage(prompt);
      let response = '';
      if (prompt.toLowerCase().includes('name')) {
        response = userInfo.name ? 
          (lang === 'tagalog' ? `Ang pangalan mo ay ${userInfo.name}.` : `Your name is ${userInfo.name}.`) : 
          'I cannot say that because it is confidential.';
      }
      if (!response) response = 'I cannot say that because it is confidential.';
      await sendMessage(senderId, { text: response }, token);
    } catch (error) {
      await sendMessage(senderId, { text: 'Error sa pagkuha ng impormasyon.' }, token);
    }
  },

  async getUserInfo(senderId, token) {
    try {
      const url = `https://graph.facebook.com/${senderId}`;
      const params = { access_token: token, fields: 'id,name,first_name,last_name,birthday,gender,location,email' };
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
      return {};
    }
  },

  // ========== GET REPLIED MESSAGE ==========
  async getRepliedMessageData(mid, token) {
    try {
      const url = `https://graph.facebook.com/v21.0/${mid}`;
      const params = { access_token: token, fields: 'message,from,attachments' };
      const { data } = await axios.get(url, { params });
      let imageUrl = null;
      if (data?.attachments?.data) {
        for (const attachment of data.attachments.data) {
          if (attachment.type === 'image' || attachment.type === 'photo') {
            imageUrl = attachment?.image_data?.url || attachment?.url || null;
            break;
          }
        }
      }
      return { message: data?.message || null, from: data?.from?.id || null, imageUrl };
    } catch (error) {
      return { message: null, from: null, imageUrl: null };
    }
  },

  // ========== API CALLS ==========
  async callAPI(prompt) {
    const primary = {
      url: 'https://api-library-kohi-production.up.railway.app/api/pollination-ai',
      param: 'prompt',
      responsePath: 'data',
      successField: 'status'
    };
    const fallback = {
      url: 'https://betadash-api-swordslush-production.up.railway.app/opera',
      param: 'ask',
      responsePath: 'message',
      successField: 'success'
    };
    try {
      return await this.executeApiCall(primary, prompt);
    } catch (primaryError) {
      console.error('[API] Primary failed:', primaryError.message);
      try {
        return await this.executeApiCall(fallback, prompt);
      } catch (fallbackError) {
        console.error('[API] Fallback failed:', fallbackError.message);
        throw new Error('Both APIs failed');
      }
    }
  },

  async executeApiCall(config, prompt) {
    const encoded = encodeURIComponent(prompt);
    const url = `${config.url}?${config.param}=${encoded}`;
    const response = await axios.get(url, {
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });
    const data = response.data;
    if (data[config.successField] !== true) {
      throw new Error(`API returned ${config.successField}: false`);
    }
    const path = config.responsePath.split('.');
    let value = data;
    for (const key of path) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return null;
      }
    }
    return typeof value === 'string' ? value : null;
  },

  // ========== HELPERS ==========
  wantsDetailedAnswer(prompt) {
    const lower = prompt.toLowerCase();
    const keywords = ['explain more', 'more details', 'detailed', 'elaborate', 'paliwanag', 'ipaliwanag'];
    return keywords.some(k => lower.includes(k));
  },

  shortenResponse(text) {
    if (!text) return text;
    const hasMathIndicators = ['Problem:', 'Problema:', 'Step 1:', 'Hakbang 1:', 'Final Answer:', 'Pinal na Sagot:'];
    if (hasMathIndicators.some(indicator => text.includes(indicator))) {
      return text;
    }
    const sentences = text.split(/(?<=[.!?])\s+/);
    let concise = sentences.slice(0, 3).join(' ');
    if (concise.length > 400) concise = concise.substring(0, 400) + '...';
    return concise || text;
  },

  cleanMathNotation(text) {
    if (!text) return text;
    let cleaned = text;
    cleaned = cleaned.replace(/\\\[/g, '').replace(/\\\]/g, '');
    cleaned = cleaned.replace(/\\\(/g, '').replace(/\\\)/g, '');
    cleaned = cleaned.replace(/\$\$/g, '').replace(/\$/g, '');
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');
    cleaned = cleaned.replace(/\\bar\{([^}]+)\}/g, '$1-bar');
    cleaned = cleaned.replace(/\\sum/g, 'sum');
    cleaned = cleaned.replace(/\\times/g, ' x ');
    cleaned = cleaned.replace(/\\cdot/g, ' * ');
    cleaned = cleaned.replace(/\\div/g, ' / ');
    cleaned = cleaned.replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)');
    cleaned = cleaned.replace(/\\left/g, '').replace(/\\right/g, '');
    cleaned = cleaned.replace(/\\text\{([^}]+)\}/g, '$1');
    cleaned = cleaned.replace(/\\pi/g, 'pi');
    cleaned = cleaned.replace(/\\theta/g, 'theta');
    cleaned = cleaned.replace(/\\infty/g, 'infinity');
    cleaned = cleaned.replace(/\\leq/g, '<=');
    cleaned = cleaned.replace(/\\geq/g, '>=');
    cleaned = cleaned.replace(/\\neq/g, '!=');
    cleaned = cleaned.replace(/\\rightarrow/g, '->');
    cleaned = cleaned.replace(/\\ldots/g, '...');
    cleaned = cleaned.replace(/\\begin\{[^}]+\}/g, '');
    cleaned = cleaned.replace(/\\end\{[^}]+\}/g, '');
    cleaned = cleaned.replace(/\\[a-zA-Z]+/g, '');
    cleaned = cleaned.replace(/([a-zA-Z])_\{?(\d+)\}?/g, '$1$2');
    cleaned = cleaned.replace(/\^\{([^}]+)\}/g, '^($1)');
    cleaned = cleaned.replace(/\\/g, '');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    return cleaned.trim();
  },

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
    cleaned = cleaned.replace(/[📌📊📐📝✅📚✏️🎯💡📖🔢🧮]/g, '');
    cleaned = this.cleanMathNotation(cleaned);
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/[ \t]+/g, ' ');
    return cleaned.trim() || 'No response.';
  },

  cleanOldHistory() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000;
    for (const [userId, data] of Object.entries(conversationHistory)) {
      if (now - data.timestamp > maxAge) {
        delete conversationHistory[userId];
      }
    }
  },

  getErrorMessage(error, detectedLanguage = 'english') {
    if (error.code === 'ECONNABORTED') {
      return detectedLanguage === 'tagalog' ? 'Nag-timeout ang request. Subukan muli.' : 'Request timed out. Please try again.';
    }
    return detectedLanguage === 'tagalog' ? 'Error sa pagproseso. Subukan muli.' : 'Error processing request. Please try again.';
  },

  splitMessage(text) {
    const chunks = [];
    for (let i = 0; i < text.length; i += MAX_CHUNK) {
      chunks.push(text.slice(i, i + MAX_CHUNK));
    }
    return chunks;
  },

  async sendChunks(senderId, text, token) {
    const chunks = this.splitMessage(text);
    for (const chunk of chunks) {
      await sendMessage(senderId, { text: chunk }, token);
    }
  }
};
