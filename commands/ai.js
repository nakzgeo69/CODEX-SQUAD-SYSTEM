const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// Configuration
const API_URL = 'https://yin-api.vercel.app/ai/chatgptfree';
const MAX_CHUNK = 1900;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

module.exports = {
  name: 'ai',
  description: 'Chat with Teacher Arlene',
  usage: 'ai [message]',
  author: '0xcodex',

  // Store conversation history per user
  conversationHistory: new Map(),

  async execute(senderId, args, token) {
    try {
      const prompt = args.join(' ').trim();

      // Handle empty or help commands
      if (!prompt || prompt.toLowerCase() === 'help') {
        await sendGreeting(senderId, token);
        return;
      }

      // Check for greeting keywords with conversational responses
      if (isGreeting(prompt)) {
        await sendConversationalGreeting(senderId, prompt, token);
        return;
      }

      // Check for owner questions
      if (isOwnerQuestion(prompt)) {
        await sendOwnerResponse(senderId, token);
        return;
      }

      // Check for user info questions
      if (isUserInfoQuestion(prompt)) {
        await handleUserInfo(senderId, prompt, token);
        return;
      }

      // Check for follow-up questions
      if (isFollowUpQuestion(prompt)) {
        await handleFollowUp(senderId, prompt, token);
        return;
      }

      // General AI query with retry mechanism
      await handleAIQueryWithRetry(senderId, prompt, token);

    } catch (error) {
      console.error(`[AI] Error: ${error.message}`);
      await sendMessage(senderId, { 
        text: 'I apologize, but something went wrong. Could you please try again?' 
      }, token);
    }
  }
};

// --- Conversation Handlers ---

async function sendGreeting(senderId, token) {
  const message = `Hi there! I'm Teacher Arlene, your AI assistant. I was created by GeoDevz69 to help you with questions, learning, and conversations.

Feel free to ask me anything - I'm here to assist you. If you need help, just type "help" and I'll guide you.`;
  
  await sendMessage(senderId, { text: message }, token);
}

async function sendConversationalGreeting(senderId, prompt, token) {
  const responses = [
    `Hello! How are you doing today? I'm Teacher Arlene, and I'm excited to chat with you. What can I help you with?`,
    
    `Hey there! It's great to see you. I'm Teacher Arlene, your AI assistant. How can I make your day better?`,
    
    `Hi! I'm glad you're here. I'm Teacher Arlene, and I love having conversations. What's on your mind today?`,
    
    `Good to hear from you! I'm Teacher Arlene, and I'm ready to help with anything you need. What would you like to talk about?`,
    
    `Hello! I hope you're having a wonderful day. I'm Teacher Arlene, and I'm here to assist you. How can I help?`
  ];
  
  // Select random response for variety
  const response = responses[Math.floor(Math.random() * responses.length)];
  await sendMessage(senderId, { text: response }, token);
}

async function sendOwnerResponse(senderId, token) {
  const message = `That's a great question! I was created by GeoDevz69, who is an amazing developer. You can connect with him through his Facebook page:

https://www.facebook.com/geotechph.net

He's the brilliant mind behind my intelligence and capabilities. Is there anything else you'd like to know about my creator?`;
  
  await sendMessage(senderId, { text: message }, token);
}

async function handleUserInfo(senderId, prompt, token) {
  try {
    const userInfo = await getUserInfo(senderId, token);
    let response = '';

    if (prompt.toLowerCase().includes('name') || prompt.toLowerCase().includes('pangalan')) {
      response = userInfo.name 
        ? `I can see that your name is ${userInfo.name}. That's a wonderful name!` 
        : 'I apologize, but I cannot access your name due to privacy settings.';
    }

    if (prompt.toLowerCase().includes('birthday') || prompt.toLowerCase().includes('birth') || prompt.toLowerCase().includes('kelan')) {
      const birthdayMsg = userInfo.birthday 
        ? `Your birthday is ${userInfo.birthday}. That's great to know!` 
        : 'I apologize, but I cannot access your birthday due to privacy settings.';
      response += response ? `\n${birthdayMsg}` : birthdayMsg;
    }

    if (!response) {
      const publicInfo = [];
      if (userInfo.name) publicInfo.push(`Name: ${userInfo.name}`);
      if (userInfo.birthday) publicInfo.push(`Birthday: ${userInfo.birthday}`);
      if (userInfo.gender) publicInfo.push(`Gender: ${userInfo.gender}`);
      if (userInfo.location) publicInfo.push(`Location: ${userInfo.location}`);

      response = publicInfo.length > 0
        ? `Based on your public profile, here's what I can see:\n${publicInfo.join('\n')}\n\nIs there anything else you'd like to know?`
        : 'I apologize, but I cannot access your public information due to privacy settings. Please check your Facebook privacy settings if you want to share this information.';
    }

    await sendMessage(senderId, { text: response }, token);

  } catch (error) {
    console.error(`[User Info] Failed: ${error.message}`);
    await sendMessage(senderId, { 
      text: 'I encountered an error while trying to access your information. Could you please try again in a moment?' 
    }, token);
  }
}

async function handleFollowUp(senderId, prompt, token) {
  const history = module.exports.conversationHistory.get(senderId);
  
  if (!history || history.length === 0) {
    await sendMessage(senderId, { 
      text: 'I don\'t recall our previous conversation. Could you remind me what we were talking about, or ask a new question?' 
    }, token);
    return;
  }

  const lastExchange = history[history.length - 1];
  const followUpResponse = `I see you're asking about "${prompt}". Let me elaborate on that based on our previous discussion about "${lastExchange.user}".

I understand you want more information about this topic. Here's another perspective...`;

  // Send follow-up response with context
  await sendMessage(senderId, { text: followUpResponse }, token);
  
  // Then process the actual query with context
  await handleAIQueryWithRetry(senderId, `${lastExchange.user} - Follow up: ${prompt}`, token);
}

async function handleAIQueryWithRetry(senderId, prompt, token) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Show thinking indicator (only on first attempt)
      if (attempt === 1) {
        await sendMessage(senderId, { 
          text: 'Let me think about that for a moment...' 
        }, token);
      }

      // Get conversation context
      const context = getConversationContext(senderId);
      
      // Prepare prompt with context for more conversational responses
      const enhancedPrompt = context 
        ? `Previous conversation:\n${context}\n\nUser: ${prompt}\nAssistant: Please provide a natural, conversational response that continues the discussion naturally.` 
        : `User: ${prompt}\nAssistant: Please provide a friendly, conversational response that feels like a natural human conversation.`;

      const { data } = await axios.get(API_URL, {
        params: {
          prompt: enhancedPrompt,
          model: 'chatgpt4'
        },
        timeout: 20000
      });

      if (!data?.answer) {
        throw new Error('Invalid API response');
      }

      let aiResponse = formatResponse(data.answer.trim());
      
      // Store conversation history
      updateConversationHistory(senderId, prompt, aiResponse);
      
      await sendChunks(senderId, aiResponse, token);
      return;

    } catch (error) {
      lastError = error;
      console.error(`[AI Query] Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < MAX_RETRIES) {
        await sendMessage(senderId, { 
          text: `I'm having trouble connecting. Let me try again (Attempt ${attempt + 1} of ${MAX_RETRIES})...` 
        }, token);
        await sleep(RETRY_DELAY * attempt);
      }
    }
  }

  await handleQueryError(senderId, lastError, token);
}

async function handleQueryError(senderId, error, token) {
  let errorMessage = 'I apologize, but I couldn\'t get a response. Could you please try again?';
  
  if (error.code === 'ECONNABORTED') {
    errorMessage = 'I\'m sorry, but the response is taking too long. The server might be busy. Could you please try again in a moment?';
  } else if (error.response) {
    if (error.response.status === 429) {
      errorMessage = 'I apologize, but we\'re experiencing high traffic right now. Please wait a moment before trying again.';
    } else if (error.response.status === 503) {
      errorMessage = 'The AI service is currently unavailable. Please try again later, and I\'ll be here to help.';
    } else {
      errorMessage = `I'm sorry, but there's a server issue (Error ${error.response.status}). Could you please try again later?`;
    }
  } else if (error.message.includes('ECONNREFUSED')) {
    errorMessage = 'I\'m having trouble connecting to my services. Please check your internet connection and try again.';
  }

  await sendMessage(senderId, { text: errorMessage }, token);
}

// --- Conversation History Management ---

function getConversationContext(senderId) {
  const history = module.exports.conversationHistory.get(senderId);
  if (!history || history.length === 0) return null;
  
  const lastExchanges = history.slice(-3);
  return lastExchanges.map(exchange => 
    `User: ${exchange.user}\nAssistant: ${exchange.assistant}`
  ).join('\n\n');
}

function updateConversationHistory(senderId, userMsg, assistantMsg) {
  if (!module.exports.conversationHistory.has(senderId)) {
    module.exports.conversationHistory.set(senderId, []);
  }
  
  const history = module.exports.conversationHistory.get(senderId);
  history.push({ user: userMsg, assistant: assistantMsg });
  
  if (history.length > 10) {
    history.shift();
  }
}

// --- Helper Functions ---

function isGreeting(prompt) {
  const greetings = [
    'hi', 'hello', 'hai', 'hey', 'greetings',
    'good morning', 'good afternoon', 'good evening',
    'hola', 'howdy', 'sup', 'yo', 'hey there'
  ];
  return greetings.some(word => prompt.toLowerCase() === word);
}

function isOwnerQuestion(prompt) {
  const keywords = [
    'who is your owner', 'who owns you', 'who created you', 
    'who made you', 'sino gumawa sayo', 'sino may ari sayo',
    'owner mo', 'creator', 'creater', 'owner'
  ];
  return keywords.some(keyword => 
    prompt.toLowerCase().includes(keyword.toLowerCase())
  );
}

function isUserInfoQuestion(prompt) {
  const keywords = [
    'what is my name', 'ano pangalan ko', 'my name',
    'when is my birthday', 'kelan birthday ko', 'my birthday',
    'who am i', 'sino ako', 'my information', 'info about me'
  ];
  return keywords.some(keyword => 
    prompt.toLowerCase().includes(keyword.toLowerCase())
  );
}

function isFollowUpQuestion(prompt) {
  const keywords = [
    'another', 'more', 'elaborate', 'explain further',
    'can you give', 'tell me more', 'additional',
    'again', 'different', 'other'
  ];
  return keywords.some(keyword => 
    prompt.toLowerCase().includes(keyword.toLowerCase())
  );
}

function formatResponse(text) {
  // Remove markdown formatting
  let formatted = text
    .replace(/\*\*(.+?)\*\*/g, '$1') // Convert bold to plain text
    .replace(/\*/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/---+/g, '')
    .replace(/__/g, '')
    .replace(/_/g, '');

  // Remove all emojis and special characters
  formatted = formatted
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
    .replace(/[\u{2000}-\u{206F}]/gu, '')
    .replace(/[\u{2300}-\u{23FF}]/gu, '')
    .replace(/[\u{2500}-\u{257F}]/gu, '')
    .replace(/[\u{2580}-\u{259F}]/gu, '')
    .replace(/[\u{25A0}-\u{25FF}]/gu, '')
    .replace(/[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\u{3000}-\u{303F}]/gu, '')
    .replace(/[\u{3200}-\u{32FF}]/gu, '')
    .replace(/[\u{3300}-\u{33FF}]/gu, '');

  // Clean up whitespace
  formatted = formatted
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return formatted || 'I got your message, but I\'m not sure how to respond. Could you rephrase that for me?';
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
      location: data.location ? data.location.name : null,
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
    if (i < chunks.length - 1) {
      await sleep(100);
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
