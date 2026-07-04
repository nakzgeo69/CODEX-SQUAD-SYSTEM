const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'ai',
  description: 'Multi-AI Assistant (GPT-4, Claude, Gemini)',
  usage: 'ai [message]',
  author: 'coffee',

  async execute(senderId, args, token) {
    if (!args || args.length === 0) {
      return sendMessage(senderId, {
        text: '🌟 | MULTI-AI ASSISTANT\n・────────────・\n\nSupported Models:\n• GPT-4 (Best)\n• Claude 3\n• Gemini Pro\n• Llama 3\n\nUsage: ai [message]\nModel: GPT-4 by default'
      }, token);
    }

    const prompt = args.join(' ').trim();
    const model = args[0]?.startsWith('--') ? args.shift().replace('--', '') : 'gpt4';
    
    const models = {
      gpt4: 'openai/gpt-4',
      claude: 'anthropic/claude-3-opus',
      gemini: 'google/gemini-pro',
      llama: 'meta-llama/llama-3-70b-instruct'
    };

    const selectedModel = models[model] || models.gpt4;

    try {
      // Using OpenRouter for multiple AI models
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content: 'You are a highly intelligent AI assistant. Provide accurate, helpful, and detailed responses.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://github.com/yourbot',
          'X-Title': 'AI Assistant'
        },
        timeout: 30000
      });

      const aiResponse = response.data.choices[0].message.content.replace(/\\n/g, '\n').trim();

      const modelNames = {
        'openai/gpt-4': 'GPT-4',
        'anthropic/claude-3-opus': 'Claude 3',
        'google/gemini-pro': 'Gemini Pro',
        'meta-llama/llama-3-70b-instruct': 'Llama 3'
      };

      const displayName = modelNames[selectedModel] || 'AI';

      // Send in chunks if too long
      await sendChunks(senderId, `🧠 | ${displayName}\n・────────────・\n\n${aiResponse}\n\n・──── >ᴗ< ─────・`, token);

    } catch (error) {
      console.error('[AI Error]', error.response?.data || error.message);
      
      // Fallback to free APIs
      try {
        const fallback = await getFallbackAI(prompt);
        await sendMessage(senderId, {
          text: `🤖 | AI (Fallback)\n・────────────・\n\n${fallback}\n\n・──── >ᴗ< ─────・`
        }, token);
      } catch (fallbackError) {
        await sendMessage(senderId, {
          text: `❌ Error: ${error.message}\nPlease try again later.`
        }, token);
      }
    }
  }
};

// Fallback AI functions
async function getFallbackAI(query) {
  const apis = [
    // Gemini Pro
    async () => {
      const res = await axios.get('https://api.kenliejugarap.com/gemini-pro/', {
        params: { q: query },
        timeout: 10000
      });
      return res.data?.response || null;
    },
    // Another free API
    async () => {
      const res = await axios.get('https://chatgpt-api.shn.hk/v1/', {
        params: { q: query },
        timeout: 10000
      });
      return res.data?.response || res.data?.text || null;
    }
  ];

  for (const api of apis) {
    try {
      const result = await api();
      if (result) return result;
    } catch (e) {
      continue;
    }
  }

  return 'All AI services are currently unavailable. Please try again later.';
}

// Helper functions
const MAX_CHUNK = 1900;

function splitMessage(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.slice(i, i + MAX_CHUNK));
  }
  return chunks;
}

async function sendChunks(senderId, text, token) {
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    await sendMessage(senderId, { text: chunk }, token);
  }
}
