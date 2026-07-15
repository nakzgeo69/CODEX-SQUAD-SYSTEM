const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images and provide smart actionable responses',
  usage: 'Send an image and the bot will analyze it',
  version: '3.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 10,

  async execute(senderId, args, token, event) {
    try {
      const imageUrl = await this.extractImageUrl(event, token);

      if (!imageUrl) {
        await sendMessage(senderId, { text: 'Please send an image or reply to an image.' }, token);
        return;
      }

      const userPrompt = args.join(' ').trim();
      const prompt = this.buildPrompt(userPrompt);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(prompt)}&imageurl=${encodeURIComponent(imageUrl)}`;

      let response = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          attempts++;
          
          response = await axios.get(apiUrl, {
            timeout: 90000,
            headers: { 'Accept': 'application/json' },
            maxContentLength: 50 * 1024 * 1024,
            maxBodyLength: 50 * 1024 * 1024,
            validateStatus: function (status) {
              return status >= 200 && status < 300;
            }
          });

          if (response.status === 200 && response.data) {
            break;
          }

        } catch (error) {
          console.log(`[gemini] Attempt ${attempts} failed:`, error.message);
          
          if (attempts >= maxAttempts) {
            throw error;
          }

          if (error.response?.status === 429) {
            await new Promise(resolve => setTimeout(resolve, 10000));
          } else if (error.response?.status >= 500) {
            await new Promise(resolve => setTimeout(resolve, 5000));
          } else if (error.code === 'ECONNABORTED') {
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }

      if (!response || !response.data) {
        throw new Error('No response from API');
      }

      let cleanResponse = this.processResponse(response.data.response || '');
      
      if (!cleanResponse || cleanResponse.length < 10) {
        await sendMessage(senderId, { text: 'Unable to analyze. Please try again with a clearer image.' }, token);
        return;
      }

      cleanResponse = cleanResponse.substring(0, 8000);
      const chunks = this.splitMessage(cleanResponse, 1900);
      
      for (const chunk of chunks) {
        await sendMessage(senderId, { text: chunk }, token);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
    } catch (error) {
      console.error('[gemini] Error:', error.message);
      const errorMessage = this.getErrorMessage(error);
      await sendMessage(senderId, { text: errorMessage }, token);
    }
  },

  buildPrompt(userPrompt) {
    let prompt = `Analyze this image and provide a comprehensive response.

DETECT THE CONTENT TYPE and respond accordingly:

CONTENT TYPES:
- Educational: Provide analysis, learning tips, study strategies, real-world examples
- Career/Professional: Provide career advice, skills needed, industry insights, growth strategies
- Math/Science: Solve problems step-by-step, explain concepts, provide practice examples
- Business/Marketing: Provide business insights, marketing strategies, growth tips
- Health/Medical: Provide health tips, wellness advice, medical information
- Technology: Provide tech insights, trends, learning resources
- Legal: Provide legal information, rights, procedures
- Arts/Creative: Provide creative tips, techniques, inspiration
- Travel/Geography: Provide travel tips, location info, cultural insights
- Food/Cooking: Provide recipes, cooking tips, food facts
- Sports/Fitness: Provide workout tips, sports strategies, fitness advice
- Finance/Money: Provide financial advice, savings tips, investment basics
- Relationships: Provide relationship advice, communication tips
- DIY/Home: Provide DIY tips, home improvement advice
- History: Provide historical context, significance, lessons
- General: Provide analysis, observations, helpful suggestions

For EVERY response, ALWAYS include:
1. ANALYSIS - Detailed analysis of what you see
2. TIPS WITH EXAMPLES - Practical suggestions with specific examples
3. REAL-WORLD APPLICATIONS WITH EXAMPLES - How to apply in real life
4. NEXT STEPS WITH EXAMPLES - Actionable steps with clear examples

IMPORTANT:
- Generate content based on what you SEE in the image
- Do not repeat previous responses
- Be specific to the image content
- Use plain text only. No symbols, no markdown
- If the image is unclear, state that clearly and provide general guidance

RESPONSE FORMAT:
[TITLE/HEADER]

ANALYSIS:
[Detailed analysis of the image]

TIPS WITH EXAMPLES:
1. [Tip] - Example: [Specific example]
2. [Tip] - Example: [Specific example]
3. [Tip] - Example: [Specific example]

REAL-WORLD APPLICATIONS WITH EXAMPLES:
1. [Application] - Example: [Specific example]
2. [Application] - Example: [Specific example]

NEXT STEPS WITH EXAMPLES:
1. [Action] - Example: [Specific example]
2. [Action] - Example: [Specific example]`;

    if (userPrompt) {
      prompt += `\n\nUSER QUESTION: ${userPrompt}`;
    }

    return prompt;
  },

  processResponse(response) {
    let processed = response || '';

    processed = this.cleanFormatting(processed);

    return processed;
  },

  cleanFormatting(response) {
    let cleaned = response;

    cleaned = cleaned
      .replace(/\$/g, '')
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/`/g, '')
      .replace(/_/g, '')
      .replace(/~{2}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i, '')
      .replace(/^Here is my analysis.*?\n/i, '')
      .replace(/^Let me analyze.*?\n/i, '')
      .replace(/^The image appears to be.*?\n/i, '')
      .replace(/^Based on my analysis.*?\n/i, '')
      .replace(/^I can see that.*?\n/i, '')
      .replace(/^This looks like.*?\n/i, '')
      .replace(/^Upon examination.*?\n/i, '')
      .replace(/^After analyzing.*?\n/i, '')
      .replace(/^The image shows.*?\n/i, '')
      .trim();

    return cleaned;
  },

  getErrorMessage(error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return 'Server is busy. Please wait a moment and try again.';
    }
    
    if (error.response?.status === 400) {
      return 'Invalid image format. Please send a valid image.';
    }
    
    if (error.response?.status === 500 || error.response?.status === 502 || error.response?.status === 503) {
      return 'Server is currently down. Please try again later.';
    }
    
    if (error.response?.status === 429) {
      return 'API rate limit reached. Please wait a moment and try again.';
    }
    
    if (error.response?.status === 413) {
      return 'Image too large. Please compress and try again.';
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return 'Connection failed. Please check your internet connection.';
    }
    
    return 'Error analyzing image. Please try again.';
  },

  async extractImageUrl(event, token) {
    try {
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
      
      const response = await axios.get(url, { 
        params,
        timeout: 30000
      });
      
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
      console.error('[Replied Image] Failed:', err.response?.data || err.message);
      return null;
    }
  },

  splitMessage(text, maxLength) {
    const chunks = [];
    
    if (text.length <= maxLength) {
      return [text];
    }
    
    const lines = text.split('\n');
    let currentChunk = '';
    
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }
};
