const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://spamxshare-server-2.onrender.com/ap/share';

module.exports = {
  name: ['share', 'spamshare'],
  description: 'Share a Facebook post/group link with specified amount and delay.',
  usage: 'share [cookie] | [link] | [amount]',
  version: '1.0.0',
  author: 'codex',
  category: 'tools',
  cooldown: 30,

  async execute(senderId, args, token, event) {
    // Check if args are provided
    if (args.length < 2) {
      await sendMessage(senderId, {
        text: `Share Tool\n\nUsage:\nshare [cookie] | [link] | [amount]\n\nExample:\nshare your_cookie_here | https://www.facebook.com/post | 10\n\nAmount Range: 1-100\nDefault Amount: 10`
      }, token);
      return;
    }

    // Parse input with | separator
    const input = args.join(' ');
    const parts = input.split('|').map(part => part.trim());
    
    const cookie = parts[0];
    const link = parts[1];
    const amount = parseInt(parts[2]) || 10;

    // Validate cookie
    if (!cookie || cookie.length < 10) {
      await sendMessage(senderId, {
        text: 'Invalid cookie. Please provide a valid Facebook cookie.'
      }, token);
      return;
    }

    // Validate link
    if (!link || !link.includes('facebook.com')) {
      await sendMessage(senderId, {
        text: 'Invalid link. Please provide a valid Facebook link.'
      }, token);
      return;
    }

    // Validate amount
    if (isNaN(amount) || amount < 1 || amount > 100) {
      await sendMessage(senderId, {
        text: 'Amount must be between 1 and 100'
      }, token);
      return;
    }

    const delay = 2;

    await sendMessage(senderId, {
      text: `Starting share process...\n\nTarget: ${link}\nAmount: ${amount}\nDelay: ${delay}s`
    }, token);

    try {
      console.log('[share] Request params:', {
        cookie: cookie.substring(0, 20) + '...',
        link: link,
        amount: amount,
        delay: delay
      });

      const response = await axios.get(API_URL, {
        params: {
          cookie: cookie,
          link: link,
          amount: amount,
          delay: delay
        },
        timeout: 60000
      });

      console.log('[share] API Response:', response.data);

      if (response.data && response.data.success) {
        let message = `Share Process Started\n\n`;
        message += `Link: ${response.data.link || link}\n`;
        message += `Amount: ${response.data.amount || amount}\n`;
        message += `Delay: ${response.data.delay || delay}s\n`;
        
        if (response.data.sessionId) {
          message += `Session ID: ${response.data.sessionId}\n`;
        }
        
        if (response.data.estimatedCompletion) {
          message += `Est. Completion: ${response.data.estimatedCompletion}\n`;
        }
        
        if (response.data.message) {
          message += `\n${response.data.message}`;
        }
        
        message += `\n\nNext use available in 30 seconds`;

        await sendMessage(senderId, {
          text: message
        }, token);

        console.log(`[share] Success: ${amount} shares to ${link} by user ${senderId}`);

      } else {
        const errorMsg = response.data?.message || 'Unknown error';
        await sendMessage(senderId, {
          text: `Failed to start sharing\n\nError: ${errorMsg}\n\nPlease check your cookie and try again.`
        }, token);
      }

    } catch (error) {
      console.error('[share] Error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      let errorMessage = `Error Occurred\n\n`;

      if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage += 'Invalid or expired cookie. Please get a new cookie.';
      } else if (error.response?.status === 429) {
        errorMessage += 'Rate limit exceeded. Please wait a few minutes.';
      } else if (error.response?.status === 500) {
        errorMessage += 'Server error. Please try again later.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage += 'Request timeout. The server is taking too long to respond.';
      } else if (error.response) {
        errorMessage += `API Error: ${error.response.status}\nMessage: ${error.response.data?.message || 'Unknown error'}`;
      } else if (error.request) {
        errorMessage += 'No response from API server. Please try again later.';
      } else {
        errorMessage += error.message || 'Unknown error occurred.';
      }

      errorMessage += `\n\nPlease check your cookie and try again.\nExample: share your_cookie | https://www.facebook.com/post | 10`;

      await sendMessage(senderId, {
        text: errorMessage
      }, token);
    }
  }
};
