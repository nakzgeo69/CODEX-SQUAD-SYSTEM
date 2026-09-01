// ========== gemini.js - Image Recognition Only ==========
const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const MAX_CHUNK = 1900;

module.exports = {
  name: ['gemini', 'vision', 'analyze', 'imganalyze'],
  description: 'Analyze images using Gemini AI',
  usage: 'gemini [optional description] (send/reply to image)',
  version: '1.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let prompt = args.join(' ').trim();
      let imageUrl = null;

      // ===== CHECK FOR IMAGE IN REPLY =====
      if (event?.message?.reply_to?.mid) {
        const replyData = await this.getRepliedMessageData(event.message.reply_to.mid, token);
        imageUrl = replyData.imageUrl;
        if (!prompt) prompt = 'Analyze this image.';
      }

      // ===== CHECK FOR IMAGE ATTACHMENT =====
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

      // ===== NO IMAGE =====
      if (!imageUrl) {
        await sendMessage(senderId, {
          text: 'Please send or reply to an image.\n\nUsage: gemini [optional description] (with image)'
        }, token);
        return;
      }

      // ===== CALL GEMINI API =====
      console.log('[Gemini] Analyzing image...');
      const response = await this.callGeminiAPI(prompt, imageUrl);
      const aiResponse = this.cleanResponse(response || 'No response from API.');

      // ===== SEND RESPONSE =====
      await this.sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error('[Gemini] Error:', error.message);
      await sendMessage(senderId, { text: 'Error analyzing image. Please try again.' }, token);
    }
  },

  // ========== GEMINI API CALL ==========
  async callGeminiAPI(prompt, imageUrl) {
    try {
      const geminiPrompt = this.buildGeminiPrompt(prompt);
      const apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodeURIComponent(geminiPrompt)}&imageurl=${encodeURIComponent(imageUrl)}`;
      const response = await axios.get(apiUrl, { timeout: 90000, headers: { 'Accept': 'application/json' } });
      
      if (!response || !response.data) {
        throw new Error('No response from Gemini API');
      }
      
      return response.data.response || '';
    } catch (error) {
      console.error('[Gemini] Error:', error.message);
      return 'Cannot analyze the image. Please try again.';
    }
  },

  // ========== BUILD GEMINI PROMPT ==========
  buildGeminiPrompt(userPrompt) {
    return `You are an AI assistant analyzing an image.

FIRST IDENTIFY WHAT TYPE OF IMAGE THIS IS, then respond APPROPRIATELY.

CLASSIFICATION AND RESPONSE:

1. ACTIVITY SHEET / WORKSHEET / QUIZ / EXAM:
   - DO NOT include student name
   - DO NOT include grade and section
   - DO NOT add intro
   - DIRECTLY provide answers
   - READ THE INSTRUCTIONS OF EACH PART CAREFULLY
   - FOLLOW THE EXACT FORMAT required by instructions

   IF SEQUENCING (Arrange in order):
   - Provide the correct ORDER of steps
   - Write the number (1, 2, 3, etc.) in correct sequence
   - Show steps in CORRECT ORDER

   IF CHECK OR X (Proper/Improper):
   - Use ✓ for PROPER
   - Use X for IMPROPER
   - DO NOT leave answers blank
   - Each item should have ✓ or X

   IF MULTIPLE CHOICE:
   - Provide the LETTER of correct answer
   - Write the complete answer

   IF ENUMERATION:
   - Provide COMPLETE list
   - Follow the required number of items

   IF ESSAY (1-2 sentences):
   - Provide answer in 1-2 sentences ONLY
   - DO NOT exceed the required number of sentences

   IF MATH:
   - Show step-by-step solution
   - Provide final answer

   IMPORTANT:
   - Maintain the ORIGINAL format of activity sheet
   - Provide ANSWER ONLY, no explanation if not needed
   - If there are blanks to fill, FILL them with answers
   - DO NOT leave any item blank

2. MATH PROBLEM / EQUATION / GRAPH:
   - Show COMPLETE step-by-step solution
   - Provide final answer

3. INFOGRAPHIC / EDUCATIONAL IMAGE:
   - Summarize in 2-3 sentences ONLY
   - State the main message

4. PAINTING / DRAWING / ARTWORK:
   - Describe in 1-2 sentences
   - If deep meaning: Explain in 1-2 sentences

5. MEME / JOKE / HUMOROUS IMAGE:
   - Explain the joke in 1 sentence

6. PHOTO / CASUAL IMAGE:
   - Describe in 1-2 sentences only

IMPORTANT RULES:
- DIRECTLY provide answers, NO intro
- FOLLOW THE INSTRUCTIONS of the activity sheet
- DO NOT leave answers blank
- Use ✓ or X if required
- Provide correct ORDER if sequencing
- NO translations
- Respond in the user's language ONLY

USER QUESTION: ${userPrompt || 'Analyze this image'}`;
  },

  // ========== GET REPLIED MESSAGE ==========
  async getRepliedMessageData(mid, token) {
    try {
      const url = `https://graph.facebook.com/v21.0/${mid}`;
      const params = {
        access_token: token,
        fields: 'message,from,attachments'
      };
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
      console.error('[Get Replied Message] Failed:', error.message);
      return { message: null, from: null, imageUrl: null };
    }
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

  // ========== SEND CHUNKS ==========
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
