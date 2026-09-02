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
      const detectedLanguage = this.detectLanguage(userPrompt || '');
      const prompt = this.buildPrompt(userPrompt, detectedLanguage);
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

  detectLanguage(prompt) {
    if (!prompt) return 'english';
    const lower = prompt.toLowerCase();
    
    const tagalogKeywords = ['ang', 'ng', 'mga', 'sa', 'ay', 'at', 'si', 'sina', 'ni', 'nina', 'kay', 'kina', 'para', 'dahil', 'kasi', 'kaya', 'ba', 'na', 'pa', 'lang', 'lamang', 'daw', 'raw', 'po', 'opo', 'ho', 'oho', 'ako', 'ikaw', 'siya', 'kami', 'tayo', 'kayo', 'sila', 'ito', 'iyan', 'iyon', 'gusto', 'ayaw', 'pwede', 'maaari', 'dapat', 'kailangan', 'meron', 'mayroon', 'wala', 'hindi', 'oo', 'salamat', 'paki', 'pakiusap', 'tanong', 'sagot', 'sabi', 'tulong', 'paliwanag', 'ano', 'bakit', 'paano', 'saan', 'kailan', 'sino', 'alin', 'kamusta', 'kumusta', 'musta'];
    const bisayaKeywords = ['ako', 'ikaw', 'siya', 'kami', 'kita', 'kamo', 'sila', 'kini', 'kana', 'kadto', 'dinhi', 'diha', 'didto', 'unsa', 'ngano', 'giunsa', 'asa', 'kanus-a', 'kinsa', 'pila', 'gusto', 'ayaw', 'pwede', 'mahimo', 'kinahanglan', 'naa', 'wala', 'dili', 'oo', 'salamat', 'palihug', 'pangutana', 'tubag', 'sulti', 'buhaton', 'hatagan', 'ipakita', 'isulti', 'tan-awa', 'basaha', 'sabta', 'tabang', 'tabangi', 'pasabta', 'pasabton', 'mubo', 'muboa', 'simple', 'pasimplehon', 'klaro', 'klaruha', 'kumusta', 'kamusta'];
    
    let tagalogCount = 0;
    let bisayaCount = 0;
    const words = lower.split(/\s+/);
    
    for (const word of words) {
      if (tagalogKeywords.includes(word)) tagalogCount++;
      if (bisayaKeywords.includes(word)) bisayaCount++;
    }
    
    if (tagalogCount >= 2 && tagalogCount >= bisayaCount) return 'tagalog';
    if (bisayaCount >= 2 && bisayaCount > tagalogCount) return 'bisaya';
    return 'english';
  },

  buildPrompt(userPrompt, language = 'english') {
    const langName = this.getLanguageName(language);
    
    if (language === 'tagalog' || language === 'bisaya') {
      return this.buildFilipinoPrompt(userPrompt, langName);
    }
    
    return this.buildEnglishPrompt(userPrompt, langName);
  },

  buildFilipinoPrompt(userPrompt, langName) {
    let prompt = `Suriin ang imaheng ito at magbigay ng TUMPAK na sagot.

TUKUYIN KUNG ANO ANG NASA LARAWAN:

1. ACTIVITY SHEET / WORKSHEET / QUIZ
   - Basahin at unawain ang bawat tanong
   - Magbigay ng TUMPAK na mga sagot
   - Para sa math: Ipakita ang step-by-step na solusyon

2. MATH PROBLEMS / EQUATIONS
   - Ipakita ang step-by-step na solusyon
   - Ibigay ang pinal na sagot

3. SCIENCE / DIAGRAMS / LABELS
   - Tukuyin ang mga bahagi at ang kanilang gamit
   - Ipaliwanag ang mga proseso

4. TEXTBOOK / NOTES / EDUCATIONAL CONTENT
   - Kunin ang mga pangunahing konsepto
   - Ibuod ang mga pangunahing ideya

5. MEME / HUMOROUS IMAGE
   - Tukuyin ang paksa
   - Ipaliwanag ang biro (1-2 pangungusap)

6. GENERAL IMAGE
   - Ilarawan kung ano ang nakikita (1-3 pangungusap)

PARAAN NG PAGTUGON:

Para sa educational/content:
Sagot: [Direktang sagot sa tanong o pangunahing punto]
Paliwanag: [Maikling paliwanag, 1-2 pangungusap]

Para sa multiple choice:
[Letter] [Sagot]

Para sa true/false:
✓ o ✗

Para sa sequencing:
[1, 2, 3, 4]

Para sa fill in the blank:
[Direktang sagot]

Para sa math:
[Step-by-step solution]
Final Answer: [Boxed answer]

MAHALAGANG PANUNTUNAN:
- Magbigay ng DIREKTA at TUMPAK na sagot
- Walang mahabang paliwanag
- Walang introduction o conclusion
- Walang emojis o special characters
- Tumugon sa ${langName.toUpperCase()} na wika`;

    if (userPrompt) {
      prompt += `\n\nTANONG NG USER: ${userPrompt}`;
    }

    return prompt;
  },

  buildEnglishPrompt(userPrompt, langName) {
    let prompt = `Analyze this image and provide ACCURATE answers.

DETECT WHAT THE IMAGE CONTAINS:

1. ACTIVITY SHEET / WORKSHEET / QUIZ
   - Read and understand each question
   - Provide ACCURATE answers
   - For math: Show step-by-step solution

2. MATH PROBLEMS / EQUATIONS
   - Show step-by-step solution
   - Provide final answer

3. SCIENCE / DIAGRAMS / LABELS
   - Identify parts and their functions
   - Explain processes

4. TEXTBOOK / NOTES / EDUCATIONAL CONTENT
   - Extract key concepts
   - Summarize main ideas

5. MEME / HUMOROUS IMAGE
   - Identify the subject
   - Explain the joke briefly (1-2 sentences)

6. GENERAL IMAGE
   - Describe what you see (1-3 sentences)

RESPONSE FORMAT:

For educational/content:
Answer: [Direct answer to the question or main point]
Explanation: [Brief explanation, 1-2 sentences]

For multiple choice:
[Letter] [Answer]

For true/false:
✓ or ✗

For sequencing:
[1, 2, 3, 4]

For fill in the blank:
[Direct answer]

For math:
[Step-by-step solution]
Final Answer: [Boxed answer]

IMPORTANT RULES:
- Provide DIRECT and ACCURATE answers
- No long explanations
- No introduction or conclusion
- No emojis or special characters
- Respond in ${langName.toUpperCase()} language`;

    if (userPrompt) {
      prompt += `\n\nUSER QUESTION: ${userPrompt}`;
    }

    return prompt;
  },

  getLanguageName(languageCode) {
    const names = {
      'english': 'English',
      'tagalog': 'Tagalog',
      'bisaya': 'Bisaya'
    };
    return names[languageCode] || 'English';
  },

  processResponse(response) {
    let processed = response || '';

    // Remove Gemini introductions
    processed = processed
      .replace(/^I'?m?\s+a?\s*Gemini.*?model.*?\n\n?/i, '')
      .replace(/^Here is my analysis.*?\n/i, '')
      .replace(/^Let me analyze.*?\n/i, '')
      .replace(/^Based on my analysis.*?\n/i, '')
      .replace(/^I can see that.*?\n/i, '')
      .replace(/^The image appears to be.*?\n/i, '')
      .replace(/^This looks like.*?\n/i, '')
      .replace(/^Upon examination.*?\n/i, '')
      .replace(/^After analyzing.*?\n/i, '')
      .replace(/^The image shows.*?\n/i, '')
      .replace(/^Ako ay si Gemini.*?\n/i, '')
      .replace(/^Narito ang aking analysis.*?\n/i, '')
      .replace(/^Hayaan mong i-analyze ko.*?\n/i, '')
      .replace(/^Batay sa aking analysis.*?\n/i, '')
      .replace(/^Nakikita ko na.*?\n/i, '');

    // Clean formatting
    processed = processed
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/#{1,6}\s*/g, '')
      .replace(/---+/g, '')
      .replace(/__/g, '')
      .replace(/_/g, '')
      .replace(/~~/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim();

    // Remove emojis
    processed = processed
      .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
      .replace(/[\u{2600}-\u{27BF}]/gu, '')
      .replace(/[\u{FE00}-\u{FEFF}]/gu, '')
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
      .replace(/[\u{1F700}-\u{1F77F}]/gu, '')
      .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')
      .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
      .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
      .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
      .replace(/[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[\u{24C2}-\u{1F251}]/gu, '');

    return processed;
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
