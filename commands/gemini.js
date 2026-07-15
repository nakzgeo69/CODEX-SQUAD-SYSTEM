const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['gemini'],
  description: 'Analyze images and answer questions using Gemini AI',
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
    let prompt = `Analyze this image and provide an accurate response.

CONTENT DETECTION:
- If the image contains mathematical expressions, equations, or number problems: Solve them completely. Show step-by-step solution and provide the final answer.
- If the image contains puzzles, logic problems, or questions: Provide the correct answer with clear explanation.
- If the image contains text, documents, or written content: Extract and summarize the information accurately.
- If the image contains logos, photos, artwork, or scenes: Provide detailed description and analysis of what you see, including context and notable details.

IMPORTANT RULES:
- For math: Show complete solution steps using plain text. Use words like plus, minus, times, divided by, equals.
- For analysis: Provide thorough description with observations and context.
- Be precise and accurate. Double-check your calculations and reasoning.
- If the image is unclear or ambiguous, state that clearly.
- Do not ask questions. Provide the complete response directly.

FORMAT:
- For problems: Provide SOLUTION with steps, EXPLANATION of reasoning, FINAL ANSWER.
- For analysis: Provide ANALYSIS with DETAILS and CONTEXT.`;

    if (userPrompt) {
      prompt += `\n\nUSER QUESTION: ${userPrompt}`;
    }

    return prompt;
  },

  processResponse(response) {
    let processed = response || '';

    processed = this.cleanFormatting(processed);
    processed = this.validateMathAccuracy(processed);
    processed = this.enhanceAnalysis(processed);

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

  validateMathAccuracy(response) {
    const hasMath = this.detectMath(response);
    
    if (hasMath) {
      let validated = response;
      
      const numbers = response.match(/-?\d+\.?\d*/g);
      if (numbers && numbers.length > 0) {
        const calculations = this.extractCalculations(response);
        if (calculations.length > 0) {
          for (const calc of calculations) {
            const result = this.solveMath(calc);
            if (result !== null) {
              validated = validated.replace(calc, result);
            }
          }
        }
      }
      
      return validated;
    }
    
    return response;
  },

  detectMath(response) {
    const mathIndicators = [
      'plus', 'minus', 'times', 'divided by', 'equals',
      '=', '+', '-', '*', '/', 'x', '÷',
      'solve', 'calculate', 'equation', 'formula',
      'sum', 'product', 'difference', 'quotient',
      'square', 'cube', 'root', 'power', 'exponent'
    ];
    
    const lowerResponse = response.toLowerCase();
    for (const indicator of mathIndicators) {
      if (lowerResponse.includes(indicator)) {
        return true;
      }
    }
    
    const numbers = response.match(/\d+/g);
    return numbers && numbers.length > 0;
  },

  extractCalculations(response) {
    const operations = response.match(/\d+\s*[+\-*/x÷]\s*\d+/g);
    return operations || [];
  },

  solveMath(expression) {
    try {
      let sanitized = expression.replace(/[^0-9+\-*/.]/g, '');
      
      if (!sanitized.match(/^[\d+\-*/.]*$/)) {
        return null;
      }
      
      const result = Function('"use strict"; return (' + sanitized + ')')();
      
      if (typeof result === 'number' && !isNaN(result)) {
        return expression + ' = ' + result;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  },

  enhanceAnalysis(response) {
    const hasAnalysis = this.detectAnalysis(response);
    
    if (hasAnalysis) {
      let enhanced = response;
      
      if (!response.includes('ANALYSIS:') && !response.includes('DESCRIPTION:')) {
        enhanced = 'ANALYSIS:\n\n' + enhanced;
      }
      
      if (response.length < 100) {
        enhanced = enhanced + '\n\nIf you need more specific information about this image, please ask a follow-up question.';
      }
      
      return enhanced;
    }
    
    return response;
  },

  detectAnalysis(response) {
    const analysisIndicators = [
      'image shows', 'logo', 'photo', 'picture', 'artwork',
      'document', 'scene', 'location', 'person', 'object',
      'color', 'design', 'brand', 'establishment'
    ];
    
    const lowerResponse = response.toLowerCase();
    for (const indicator of analysisIndicators) {
      if (lowerResponse.includes(indicator)) {
        return true;
      }
    }
    
    return false;
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
