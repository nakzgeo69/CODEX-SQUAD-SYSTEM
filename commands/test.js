const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['test', 'apitest', 'checkapi'],
  description: 'Test if an API endpoint is working',
  usage: 'test [API URL]',
  version: '1.0.0',
  author: 'codex',
  category: 'tools',
  cooldown: 3,

  async execute(senderId, args, token, event) {
    // Check if URL is provided
    if (!args.length) {
      await sendMessage(senderId, {
        text: `API Tester

Usage: test [API URL]

Examples:
  test https://api.github.com/users/octocat
  test https://api.crossref.org/works?query=machine+learning&rows=1

Features:
  ✓ Checks if API is working
  ✓ Shows status code
  ✓ Displays JSON response
  ✓ Detects errors`
      }, token);
      return;
    }

    const url = args.join(' ');
    
    // Validate URL
    if (!/^https?:\/\//.test(url)) {
      await sendMessage(senderId, {
        text: 'Please provide a valid API URL starting with http:// or https://'
      }, token);
      return;
    }

    // Send loading message
    await sendMessage(senderId, {
      text: `Testing API: ${url}...`
    }, token);

    try {
      const startTime = Date.now();
      
      const response = await axios.get(url, {
        timeout: 30000,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; AutoPageBot/1.0)'
        }
      });

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Check if response is JSON
      const isJson = typeof response.data === 'object';
      const status = response.status;
      const statusText = response.statusText || 'OK';

      // Build response message
      let message = `\n`;
      message += `📡 API TEST RESULTS\n`;
      message += `\n\n`;
      
      message += `🔗 URL: ${url}\n`;
      message += `📊 Status: ${status} ${statusText}\n`;
      message += `⏱️ Response Time: ${responseTime}ms\n`;
      
      if (isJson) {
        message += `✅ Response Type: JSON\n`;
        message += `📦 Content-Type: application/json\n\n`;
        
        // Check if response has data
        if (response.data) {
          const dataStr = JSON.stringify(response.data, null, 2);
          const maxLength = 1500;
          
          if (dataStr.length > maxLength) {
            message += `📝 Response (truncated):\n${dataStr.substring(0, maxLength)}...\n\n`;
            message += `💡 Full response has ${dataStr.length} characters.`;
          } else {
            message += `📝 Response:\n${dataStr}`;
          }
        } else {
          message += `📝 Response: Empty or null`;
        }
      } else {
        message += `⚠️ Response Type: Non-JSON (${typeof response.data})\n`;
        message += `📝 Response: ${String(response.data).substring(0, 500)}`;
      }

      message += `\n\n`;
      message += `✅ API is WORKING!`;

      // Send response
      const chunks = splitMessage(message, 1900);
      for (const chunk of chunks) {
        await sendMessage(senderId, { text: chunk }, token);
      }

    } catch (error) {
      console.error('[test] Error:', error.message);
      
      let message = `\n`;
      message += `📡 API TEST RESULTS\n`;
      message += `\n\n`;
      
      message += `🔗 URL: ${url}\n`;
      
      // Determine error type
      if (error.response) {
        // Server responded with error status
        const status = error.response.status;
        const statusText = error.response.statusText || 'Error';
        
        message += `❌ Status: ${status} ${statusText}\n`;
        message += `📝 Error: ${error.response.data?.message || error.message}\n\n`;
        message += `💡 The API responded with an error status code.`;
        
        if (status === 401 || status === 403) {
          message += `\n🔑 This may require authentication or API key.`;
        } else if (status === 404) {
          message += `\n🔍 The endpoint may not exist. Check the URL.`;
        } else if (status === 429) {
          message += `\n⏳ Rate limit exceeded. Try again later.`;
        } else if (status >= 500) {
          message += `\n🔧 Server error. The API may be down.`;
        }
      } else if (error.request) {
        // No response received
        message += `❌ No Response\n`;
        message += `📝 ${error.message}\n\n`;
        message += `💡 The API did not respond. Possible issues:\n`;
        message += `  • API is down or unreachable\n`;
        message += `  • Network connection problem\n`;
        message += `  • CORS or firewall blocking`;
      } else {
        // Request setup error
        message += `❌ Request Failed\n`;
        message += `📝 ${error.message}\n\n`;
        message += `💡 Check the URL format and try again.`;
      }

      message += `\n\n`;
      message += `❌ API is NOT WORKING`;

      await sendMessage(senderId, { text: message }, token);
    }
  }
};

// Helper function to split long messages
function splitMessage(text, maxLength = 1900) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }
  return chunks;
}
