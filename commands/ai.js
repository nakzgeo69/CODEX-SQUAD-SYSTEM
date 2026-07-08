const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://yin-api.vercel.app/ai/chatgptfree';
const MAX_CHUNK = 1900;
const MAX_HISTORY = 6;

const conversationHistory = new Map();

module.exports = {
  name: 'ai',
  description: 'Chat with Teacher Arlene',
  usage: 'ai [message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim();

    if (!prompt) {
      await sendMessage(senderId, { 
        text: 'Hello! I\'m Teacher Arlene. How can I help you today?' 
      }, token);
      return;
    }

    if (await handleCommands(senderId, prompt, token)) {
      return;
    }

    await processAIQuery(senderId, prompt, token);
  }
};

async function handleCommands(senderId, prompt, token) {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt === 'help') {
    await sendMessage(senderId, { 
      text: 'Commands:\n- help: Show menu\n- clear: Reset conversation\n- hi/hello: Start fresh\n\n💡 Just reply to my responses naturally!' 
    }, token);
    return true;
  }

  if (lowerPrompt === 'clear' || lowerPrompt === 'reset') {
    conversationHistory.delete(senderId);
    await sendMessage(senderId, { 
      text: 'Conversation cleared. Starting fresh!' 
    }, token);
    return true;
  }

  const greetings = ['hi', 'hello', 'hey', 'halo', 'musta', 'kamusta', 'good morning', 'good afternoon', 'good evening'];
  if (greetings.some(g => lowerPrompt === g)) {
    conversationHistory.delete(senderId);
    await sendMessage(senderId, { 
      text: 'Hello! I\'m Teacher Arlene. What would you like to discuss?' 
    }, token);
    return true;
  }

  const ownerKeywords = [
    'who is your owner', 'who owns you', 'who created you', 'who made you',
    'sino gumawa sayo', 'sino may ari sayo', 'owner mo', 'creator mo'
  ];
  
  if (ownerKeywords.some(keyword => lowerPrompt.includes(keyword))) {
    await sendMessage(senderId, { 
      text: 'My creator is GeoDevz69. Contact: https://www.facebook.com/geotechph.net' 
    }, token);
    return true;
  }

  const userInfoKeywords = [
    'my name', 'pangalan ko', 'what is my name', 'who am i', 'sino ako',
    'my birthday', 'birthday ko', 'when is my birthday', 'kelan birthday ko'
  ];
  
  if (userInfoKeywords.some(keyword => lowerPrompt.includes(keyword))) {
    await handleUserInfo(senderId, prompt, token);
    return true;
  }

  return false;
}

async function handleUserInfo(senderId, prompt, token) {
  try {
    const userInfo = await getUserInfo(senderId, token);
    let response = '';

    const lowerPrompt = prompt.toLowerCase();

    if (lowerPrompt.includes('name') || lowerPrompt.includes('pangalan')) {
      response = userInfo.name 
        ? `Your name is ${userInfo.name}.` 
        : 'Cannot access your name due to privacy.';
    }

    if (lowerPrompt.includes('birthday') || lowerPrompt.includes('birth') || lowerPrompt.includes('kelan')) {
      response += userInfo.birthday 
        ? `\nYour birthday is ${userInfo.birthday}.` 
        : '\nCannot access your birthday.';
    }

    if (!response) {
      const details = [];
      if (userInfo.name) details.push(`Name: ${userInfo.name}`);
      if (userInfo.birthday) details.push(`Birthday: ${userInfo.birthday}`);
      if (userInfo.gender) details.push(`Gender: ${userInfo.gender}`);
      if (userInfo.location) details.push(`Location: ${userInfo.location}`);

      response = details.length > 0 
        ? `Information about you:\n${details.join('\n')}` 
        : 'No information available.';
    }

    await sendMessage(senderId, { text: response }, token);
  } catch (error) {
    console.error(`[User Info] Error: ${error.message}`);
    await sendMessage(senderId, {
      text: 'Unable to retrieve information. Try again later.'
    }, token);
  }
}

async function processAIQuery(senderId, prompt, token) {
  try {
    if (!conversationHistory.has(senderId)) {
      conversationHistory.set(senderId, []);
    }
    
    const history = conversationHistory.get(senderId);
    
    // --- GET LAST TOPIC FROM HISTORY ---
    let lastTopic = '';
    let lastAIResponse = '';
    let lastUserMessage = '';
    
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant' && !lastAIResponse) {
        lastAIResponse = history[i].content;
        lastTopic = extractTopic(lastAIResponse, history[i]?.language || 'en');
        break;
      }
    }

    // Get last user message for context
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user' && !lastUserMessage) {
        lastUserMessage = history[i].content;
        break;
      }
    }

    // --- DETECT IF FOLLOW-UP (ALL LANGUAGES) ---
    let isFollowUp = false;
    const detectedLanguage = detectLanguage(prompt);
    
    // Follow-up patterns for ALL languages
    const followUpPatterns = getFollowUpPatterns(detectedLanguage);
    
    // Check if prompt is a follow-up
    const lowerPrompt = prompt.toLowerCase().trim();
    
    // Check 1: Short prompt (regardless of language)
    if (prompt.length < 40) {
      isFollowUp = true;
    }
    
    // Check 2: Contains follow-up keywords in any language
    if (followUpPatterns.some(pattern => lowerPrompt.includes(pattern))) {
      isFollowUp = true;
    }
    
    // Check 3: If it's a question about the last topic
    if (lastTopic && lowerPrompt.includes(lastTopic.toLowerCase())) {
      isFollowUp = true;
    }
    
    // Check 4: If it references the previous message
    const referenceWords = ['that', 'this', 'it', 'yan', 'ito', 'yun', 'nito', 'niyan', 'niyon', 'dito', 'doon', 'there', 'here'];
    if (referenceWords.some(word => lowerPrompt.includes(word)) && history.length > 0) {
      isFollowUp = true;
    }

    // --- BUILD CONTEXTUAL PROMPT ---
    let contextualPrompt = '';

    contextualPrompt += `You are Teacher Arlene, a friendly and conversational AI assistant.

`;

    // --- FOCUS ON LAST TOPIC IF FOLLOW-UP ---
    if (isFollowUp && lastTopic) {
      contextualPrompt += `IMPORTANT: The user is asking for more information about this topic: "${lastTopic}"

The user's previous questions were about: "${lastTopic}"
Keep your response focused on "${lastTopic}" and provide additional information.

`;
    }

    // --- ADD CONVERSATION HISTORY ---
    const recentHistory = history.slice(-6);
    if (recentHistory.length > 0) {
      contextualPrompt += 'Previous conversation:\n';
      recentHistory.forEach(msg => {
        if (msg.role === 'user') {
          contextualPrompt += `User: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          contextualPrompt += `Teacher Arlene: ${msg.content}\n`;
        }
      });
      contextualPrompt += '\n';
    }

    // --- ADD CURRENT QUESTION ---
    contextualPrompt += `Current question: ${prompt}

Instructions:
1. ${isFollowUp ? `Focus on "${lastTopic}" and provide more information` : 'Answer the question directly'}
2. Keep the conversation flowing naturally
3. If the user asks a short follow-up, connect it to the previous topic
4. Provide clear, helpful information
5. Ask a follow-up question to continue the conversation
6. Respond in the same language as the user's question

Response:`;

    // Add user message to history
    history.push({
      role: 'user',
      content: prompt,
      language: detectedLanguage
    });

    // Call API
    const { data } = await axios.get(API_URL, {
      params: {
        prompt: contextualPrompt,
        model: 'chatgpt4'
      },
      timeout: 20000
    });

    if (!data?.answer) {
      throw new Error('No response from API');
    }

    let aiResponse = data.answer.trim();
    aiResponse = formatResponse(aiResponse);

    // Add AI response to history
    history.push({
      role: 'assistant',
      content: aiResponse,
      language: detectedLanguage
    });

    // Keep only last 6 messages
    if (history.length > MAX_HISTORY * 2) {
      history.splice(0, history.length - (MAX_HISTORY * 2));
    }

    conversationHistory.set(senderId, history);

    await sendChunks(senderId, aiResponse, token);

  } catch (error) {
    console.error(`[AI] Error: ${error.message}`);
    
    let errorMsg = 'An error occurred. Please try again later.';
    
    if (error.code === 'ECONNABORTED') {
      errorMsg = 'Connection timeout. Please try again.';
    } else if (error.response?.status === 429) {
      errorMsg = 'Too many requests. Please wait a moment.';
    }
    
    await sendMessage(senderId, { text: errorMsg }, token);
  }
}

// --- LANGUAGE DETECTION ---
function detectLanguage(text) {
  const patterns = {
    tagalog: /[aeiou]/i,
    cebuano: /[aeiou]/i,
    ilocano: /[aeiou]/i,
    spanish: /[áéíóúñ¿¡]/i,
    french: /[éèêëàâçôûîï]/i,
    japanese: /[\u3040-\u30FF\u4E00-\u9FFF]/,
    korean: /[\uAC00-\uD7AF\u1100-\u11FF]/,
    chinese: /[\u4E00-\u9FFF]/,
    arabic: /[\u0600-\u06FF]/,
    russian: /[\u0400-\u04FF]/
  };

  // Check for specific language patterns
  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return lang;
    }
  }

  // Default to English
  return 'en';
}

// --- FOLLOW-UP PATTERNS FOR ALL LANGUAGES ---
function getFollowUpPatterns(language) {
  const patterns = {
    // English
    en: ['another', 'more', 'additional', 'next', 'other', 'else', 'example', 'explanation', 'details', 'further', 'about it', 'regarding', 'tell me', 'what about', 'how about', 'can you', 'could you', 'explain', 'elaborate', 'expand'],
    
    // Tagalog
    tagalog: ['isa pa', 'iba pa', 'dagdag', 'karagdagan', 'susunod', 'iba', 'halimbawa', 'paliwanag', 'detalye', 'tungkol dito', 'tungkol sa', 'ano pa', 'paano', 'bakit', 'saan', 'kailan', 'sino', 'alin', 'magsabi', 'magbigay', 'isa pang', 'ibang'],
    
    // Cebuano
    cebuano: ['laing', 'dugang', 'sunod', 'pananglitan', 'pagsabot', 'detalye', 'mahitungod niini', 'unsa pa', 'giunsa', 'ngano', 'asa', 'kanus-a', 'kinsa', 'hatag', 'laing pananglitan'],
    
    // Ilocano
    ilocano: ['sabali', 'adu', 'sumaruno', 'halimbawa', 'palawag', 'detalye', 'maipapan iti', 'anyana', 'kasanu', 'apay', 'sadino', 'kaano', 'asino', 'ibaga', 'ited'],
    
    // Spanish
    spanish: ['otro', 'más', 'adicional', 'siguiente', 'ejemplo', 'explicación', 'detalles', 'acerca de', 'sobre', 'dime', 'cuéntame', 'qué tal', 'cómo', 'por qué', 'dónde', 'cuándo', 'quién', 'cuál'],
    
    // French
    french: ['autre', 'plus', 'supplémentaire', 'suivant', 'exemple', 'explication', 'détails', 'à propos', 'dis-moi', 'raconte-moi', 'comment', 'pourquoi', 'où', 'quand', 'qui', 'lequel'],
    
    // Japanese
    japanese: ['別の', 'もっと', '追加', '次の', '例', '説明', '詳細', 'これについて', '教えて', '何て', 'どうやって', 'なぜ', 'どこ', 'いつ', '誰', 'どれ'],
    
    // Korean
    korean: ['또 다른', '더', '추가', '다음', '예', '설명', '세부 정보', '이에 대해', '말해줘', '어떻게', '왜', '어디', '언제', '누가', '어느'],
    
    // Chinese
    chinese: ['另一个', '更多', '额外', '下一个', '例子', '解释', '细节', '关于这个', '告诉我', '怎么', '为什么', '哪里', '什么时候', '谁', '哪个'],
    
    // Arabic
    arabic: ['آخر', 'المزيد', 'إضافي', 'التالي', 'مثال', 'شرح', 'تفاصيل', 'حول هذا', 'أخبرني', 'كيف', 'لماذا', 'أين', 'متى', 'من', 'أي'],
    
    // Russian
    russian: ['другой', 'больше', 'дополнительный', 'следующий', 'пример', 'объяснение', 'детали', 'об этом', 'скажи мне', 'как', 'почему', 'где', 'когда', 'кто', 'который']
  };

  return patterns[language] || patterns.en;
}

// --- EXTRACT TOPIC FROM AI RESPONSE ---
function extractTopic(response, language) {
  // Remove common phrases based on language
  let topic = response;
  
  const commonPhrases = {
    en: ['Oh', 'Wow', 'Hello', 'Hi', 'Hey', 'Great', 'Okay', 'Sure', 'Alright', 'Yes', 'No', 'Maybe', 'Actually', 'Well', 'So', 'Basically', 'Simply', 'Absolutely', 'Definitely', 'Certainly', 'Of course'],
    tagalog: ['Oh', 'Wow', 'Hello', 'Hi', 'Hey', 'Sige', 'Oo', 'Hindi', 'Siguro', 'Talaga', 'Naman', 'Kaya', 'Kasi', 'Dahil', 'Eto', 'Ito', 'Yan', 'Ayan', 'Ganito', 'Ganyan'],
    cebuano: ['Oh', 'Wow', 'Hello', 'Hi', 'Hey', 'Sige', 'Oo', 'Dili', 'Siguro', 'Jud', 'Kay', 'Mao', 'Kani', 'Kana', 'Ingon', 'Ani'],
    ilocano: ['Oh', 'Wow', 'Hello', 'Hi', 'Hey', 'Sige', 'Wen', 'Saan', 'Siguro', 'Gayam', 'Ta', 'Daytoy', 'Dayta', 'Kastoy']
  };

  const phrases = commonPhrases[language] || commonPhrases.en;
  
  phrases.forEach(phrase => {
    topic = topic.replace(new RegExp(`^${phrase}`, 'i'), '');
  });

  // Get first meaningful sentence
  topic = topic.trim()
    .split('.')[0]
    .split(',')[0]
    .split('?')[0]
    .trim();

  // Clean up
  topic = topic.replace(/[^a-zA-Z0-9\s\-']/g, '');
  
  // If topic is too long, shorten
  if (topic.length > 50) {
    topic = topic.substring(0, 50).trim();
  }

  return topic || 'the topic we were discussing';
}

function formatResponse(text) {
  let formatted = text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/---+/g, '')
    .replace(/__/g, '')
    .replace(/_/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return formatted;
}

async function getUserInfo(senderId, token) {
  try {
    const url = `https://graph.facebook.com/${senderId}`;
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
      location: data.location?.name || null,
      email: data.email || null
    };
  } catch (error) {
    console.error(`[Graph API] Error: ${error.message}`);
    return {};
  }
}

function splitMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }
  return chunks;
}

async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  for (let i = 0; i < chunks.length; i++) {
    await sendMessage(senderId, { text: chunks[i] }, token);
  }
}
