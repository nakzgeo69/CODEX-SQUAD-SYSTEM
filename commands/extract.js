const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['extract'],
  description: 'Extract text from an image by replying to it',
  usage: 'Reply to an image with "extract"',
  version: '1.0.0',
  author: 'codex',
  category: 'Utility',
  cooldown: 10,

  async execute(senderId, args, token, event) {
    try {
      // ===== CHECK IF REPLYING TO AN IMAGE =====
      if (!event?.message?.reply_to?.mid) {
        await sendMessage(senderId, { text: 'Please reply to an image with "extract" to extract text from it.' }, token);
        return;
      }

      // ===== GET THE REPLIED IMAGE URL =====
      const imageUrl = await this.getRepliedImage(event.message.reply_to.mid, token);

      if (!imageUrl) {
        await sendMessage(senderId, { text: 'The replied message does not contain an image. Please reply to an image.' }, token);
        return;
      }

      // ===== EXTRACT TEXT FROM IMAGE =====
      const ocrText = await this.extractTextFromImage(imageUrl);
      
      if (!ocrText || ocrText.length < 5) {
        await sendMessage(senderId, { text: 'No text detected in the image. Please try again with a clearer image.' }, token);
        return;
      }

      // ===== PRESERVE FORMATTING =====
      const extractedText = this.preserveFormatting(ocrText);

      // ===== SEND THE EXTRACTED TEXT =====
      if (extractedText.length > 1900) {
        const chunks = this.splitMessage(extractedText, 1900);
        let part = 1;
        for (const chunk of chunks) {
          await sendMessage(senderId, { text: `[Part ${part}/${chunks.length}]\n${chunk}` }, token);
          part++;
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      } else {
        await sendMessage(senderId, { text: extractedText }, token);
      }
      
    } catch (error) {
      console.error('[extract] Error:', error.message);
      await sendMessage(senderId, { text: this.getErrorMessage(error) }, token);
    }
  },

  // ============================================================
  // PRESERVE FORMATTING
  // ============================================================
  preserveFormatting(text) {
    if (!text) return text;
    
    let formatted = text;
    formatted = formatted.replace(/\n{4,}/g, '\n\n\n');
    formatted = formatted.replace(/[ \t]+/g, ' ');
    formatted = formatted.trim();
    return formatted;
  },

  // ============================================================
  // OCR: EXTRACT TEXT FROM IMAGE
  // ============================================================
  async extractTextFromImage(imageUrl) {
    try {
      console.log('[extract] Extracting text from image...');
      
      const apiKey = 'K85096363488957';
      const url = `https://api.ocr.space/parse/imageurl?apikey=${apiKey}&url=${encodeURIComponent(imageUrl)}&language=eng,tgl&isOverlayRequired=false`;
      
      const response = await axios.get(url, {
        timeout: 60000,
        headers: { 'Accept': 'application/json' }
      });
      
      const data = response.data;
      
      if (data.IsErroredOnProcessing) {
        console.log('[extract] OCR Error:', data.ErrorMessage?.[0] || 'Unknown OCR error');
        return '';
      }
      
      const parsedText = data?.ParsedResults?.[0]?.ParsedText || '';
      console.log('[extract] Extracted text length:', parsedText.length);
      
      return parsedText;
      
    } catch (error) {
      console.error('[extract] OCR Error:', error.message);
      return '';
    }
  },

  // ============================================================
  // GET REPLIED IMAGE
  // ============================================================
  async getRepliedImage(mid, token) {
    try {
      const url = `https://graph.facebook.com/v21.0/${mid}/attachments`;
      const params = { access_token: token };
      const response = await axios.get(url, { params, timeout: 30000 });
      
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
      console.error('[extract] Replied Image Failed:', err.response?.data || err.message);
      return null;
    }
  },

  // ============================================================
  // SPLIT MESSAGE
  // ============================================================
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
  },

  // ============================================================
  // ERROR MESSAGE
  // ============================================================
  getErrorMessage(error) {
    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      return 'OCR server is busy. Please wait a moment and try again.';
    }
    if (error.response?.status === 400) {
      return 'Invalid image format. Please send a valid image.';
    }
    if (error.response?.status === 500 || error.response?.status === 502 || error.response?.status === 503) {
      return 'OCR server is currently down. Please try again later.';
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
    return 'Error extracting text from image. Please try again.';
  }
};
