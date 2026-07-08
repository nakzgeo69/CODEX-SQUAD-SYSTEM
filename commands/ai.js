const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://yin-api.vercel.app/ai/chatgptfree';
const MAX_CHUNK = 1900;
const MAX_HISTORY = 10;

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
      text: 'Available commands:\n- help: Show this menu\n- clear: Clear conversation history\n- hi/hello: Start fresh conversation\n\nJust type your question and I\'ll help you!' 
    }, token);
    return true;
  }

  if (lowerPrompt === 'clear' || lowerPrompt === 'reset') {
    conversationHistory.delete(senderId);
    await sendMessage(senderId, { 
      text: 'Conversation history cleared. Starting fresh!' 
    }, token);
    return true;
  }

  const greetings = ['hi', 'hello', 'hey', 'halo', 'musta', 'kamusta', 'good morning', 'good afternoon', 'good evening'];
  if (greetings.some(g => lowerPrompt === g)) {
    conversationHistory.delete(senderId);
    await sendMessage(senderId, { 
      text: 'Hello! I\'m Teacher Arlene. What would you like to discuss today?' 
    }, token);
    return true;
  }

  const ownerKeywords = [
    'who is your owner', 'who owns you', 'who created you', 'who made you',
    'sino gumawa sayo', 'sino may ari sayo', 'owner mo', 'creator mo'
  ];
  
  if (ownerKeywords.some(keyword => lowerPrompt.includes(keyword))) {
    await sendMessage(senderId, { 
      text: 'My creator is GeoDevz69. You can contact him at: https://www.facebook.com/geotechph.net' 
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
        : 'I cannot access your name due to privacy settings.';
    }

    if (lowerPrompt.includes('birthday') || lowerPrompt.includes('birth') || lowerPrompt.includes('kelan')) {
      response += userInfo.birthday 
        ? `\nYour birthday is ${userInfo.birthday}.` 
        : '\nI cannot access your birthday.';
    }

    if (!response) {
      const details = [];
      if (userInfo.name) details.push(`Name: ${userInfo.name}`);
      if (userInfo.birthday) details.push(`Birthday: ${userInfo.birthday}`);
      if (userInfo.gender) details.push(`Gender: ${userInfo.gender}`);
      if (userInfo.location) details.push(`Location: ${userInfo.location}`);

      response = details.length > 0 
        ? `Information I have about you:\n${details.join('\n')}` 
        : 'I don\'t have much information about you.';
    }

    await sendMessage(senderId, { text: response }, token);
  } catch (error) {
    console.error(`[User Info] Error: ${error.message}`);
    await sendMessage(senderId, {
      text: 'Unable to retrieve your information. Please try again later.'
    }, token);
  }
}

async function processAIQuery(senderId, prompt, token) {
  try {
    if (!conversationHistory.has(senderId)) {
      conversationHistory.set(senderId, []);
    }
    
    const history = conversationHistory.get(senderId);
    
    history.push({
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    });

    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }

    const contextualPrompt = buildContextualPrompt(history, prompt);

    const { data } = await axios.get(API_URL, {
      params: {
        prompt: contextualPrompt,
        model: 'chatgpt4'
      },
      timeout: 15000
    });

    if (!data?.answer) {
      throw new Error('Invalid API response');
    }

    let aiResponse = formatResponse(data.answer.trim());

    history.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: Date.now()
    });

    conversationHistory.set(senderId, history);
    await sendChunks(senderId, aiResponse, token);

  } catch (error) {
    console.error(`[AI] Error for ${senderId}: ${error.message}`);
    
    const errorMsg = error.response?.status === 429 
      ? 'Too many requests. Please wait a moment and try again.'
      : 'An error occurred. Please try again later.';
    
    await sendMessage(senderId, { text: errorMsg }, token);
  }
}

function buildContextualPrompt(history, currentPrompt) {
  let prompt = '';

  prompt += `You are Teacher Arlene, a conversational AI assistant. 
Respond in a warm and helpful manner. Use emojis moderately.
Ask questions to keep the conversation engaging.
Connect your responses to previous topics when relevant.

`;

  const recentHistory = history.slice(-6);
  if (recentHistory.length > 1) {
    prompt += 'Previous conversation:\n';
    recentHistory.forEach(msg => {
      if (msg.role === 'user') {
        prompt += `User: ${msg.content}\n`;
      } else if (msg.role === 'assistant') {
        prompt += `Teacher Arlene: ${msg.content}\n`;
      }
    });
    prompt += '\n';
  }

  prompt += `Current question: ${currentPrompt}

Instructions:
1. Use previous conversation for context
2. Provide relevant and helpful responses
3. Keep the tone conversational
4. Ask a follow-up question to continue the dialogue

Response:`;

  return prompt;
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
