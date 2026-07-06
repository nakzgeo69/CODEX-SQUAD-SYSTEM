const axios = require('axios');

module.exports = {
  name: 'test',
  aliases: ['api'],
  description: 'Test any API endpoint',
  usage: 'test <url>',
  author: 'codex',

  sessions: {},

  async execute(senderId, args, token, sendMessage) {
    const input = args.join(" ");
    
    if (this.sessions[senderId]) {
      await this.handleSession(senderId, input, token, sendMessage);
      return;
    }

    if (!input || !this.isValidUrl(input)) {
      await sendMessage(senderId, { 
        text: 'Usage: test <api_url>\nExample: test https://yin-api.vercel.app/ai/chatgptfree?prompt=Hello&model=chatgpt4' 
      }, token);
      return;
    }

    await this.testApi(senderId, input, {}, token, sendMessage);
  },

  isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },

  async testApi(senderId, url, params, token, sendMessage, method = 'GET', body = null) {
    try {
      const startTime = Date.now();
      
      let fullUrl = url;
      if (method === 'GET' && Object.keys(params).length > 0) {
        const searchParams = new URLSearchParams(params);
        fullUrl += (url.includes('?') ? '&' : '?') + searchParams.toString();
      }

      const config = {
        timeout: 15000,
        validateStatus: status => status < 500,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'API-Tester/2.0'
        }
      };

      let response;
      switch (method.toUpperCase()) {
        case 'POST':
          response = await axios.post(fullUrl, body || params, config);
          break;
        case 'PUT':
          response = await axios.put(fullUrl, body || params, config);
          break;
        case 'DELETE':
          response = await axios.delete(fullUrl, config);
          break;
        default:
          response = await axios.get(fullUrl, config);
      }

      const responseTime = Date.now() - startTime;
      await this.sendFormattedResponse(senderId, response, responseTime, token, sendMessage);

    } catch (error) {
      await this.sendErrorResponse(senderId, error, url, token, sendMessage);
    }
  },

  async sendFormattedResponse(senderId, response, time, token, sendMessage) {
    const isJson = typeof response.data === 'object' && response.data !== null;
    
    let output = `Status: ${response.status}\n`;
    output += `Time: ${time}ms\n`;
    output += `Type: ${response.headers['content-type']?.split(';')[0] || 'Unknown'}\n\n`;

    if (isJson) {
      const jsonStr = JSON.stringify(response.data, null, 2);
      const maxLen = 1900;
      
      if (jsonStr.length > maxLen) {
        const extracted = this.extractAnswer(response.data);
        if (extracted) {
          output += JSON.stringify(extracted, null, 2);
        } else {
          output += jsonStr.slice(0, maxLen) + `\n\n[Truncated: ${jsonStr.length - maxLen} chars]`;
        }
      } else {
        output += jsonStr;
      }
    } else {
      const raw = String(response.data);
      output += raw.slice(0, 500) + (raw.length > 500 ? '\n\n[Truncated]' : '');
    }

    if (output.length > 2000) {
      const chunks = this.splitMessage(output, 1900);
      for (let i = 0; i < chunks.length; i++) {
        await sendMessage(senderId, { text: chunks[i] }, token);
        if (i < chunks.length - 1) await this.delay(300);
      }
    } else {
      await sendMessage(senderId, { text: output }, token);
    }
  },

  extractAnswer(data) {
    if (typeof data === 'object' && data !== null) {
      const fields = ['answer', 'response', 'message', 'content', 'result', 'data'];
      for (const field of fields) {
        if (data[field] !== undefined) {
          return { [field]: data[field] };
        }
      }
      if (Object.keys(data).length <= 10) {
        return data;
      }
      let largest = '';
      let largestKey = '';
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'string' && value.length > largest.length) {
          largest = value;
          largestKey = key;
        }
      }
      if (largestKey) {
        return { [largestKey]: largest };
      }
    }
    return null;
  },

  async sendErrorResponse(senderId, error, url, token, sendMessage) {
    let output = '';

    if (error.code === 'ECONNABORTED') {
      output = `Timeout: Server did not respond in 15 seconds\n\nURL: ${url}`;
    } else if (error.code === 'ENOTFOUND') {
      output = `Domain not found\n\nURL: ${url}`;
    } else if (error.code === 'ECONNREFUSED') {
      output = `Connection refused\n\nURL: ${url}`;
    } else if (error.response) {
      output = `Error ${error.response.status}\n`;
      if (typeof error.response.data === 'object') {
        output += `\n${JSON.stringify(error.response.data, null, 2)}`;
      } else if (error.response.data) {
        output += `\n${String(error.response.data).slice(0, 300)}`;
      }
      output += `\n\nURL: ${url}`;
    } else if (error.request) {
      output = `No response from server\n\nURL: ${url}`;
    } else {
      output = `${error.message}\n\nURL: ${url}`;
    }

    await sendMessage(senderId, { text: output.slice(0, 2000) }, token);
  },

  async handleSession(senderId, input, token, sendMessage) {
    const session = this.sessions[senderId];
    
    try {
      let params = {};
      let body = null;
      let method = 'GET';

      if (input.toLowerCase() === 'cancel') {
        delete this.sessions[senderId];
        await sendMessage(senderId, { text: 'Cancelled' }, token);
        return;
      }

      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed) || typeof parsed === 'object') {
          params = parsed;
        }
      } catch {
        if (input.includes('=')) {
          const pairs = input.split('&');
          pairs.forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) params[key] = decodeURIComponent(value);
          });
        } else if (input.match(/^\d+$/)) {
          params = { id: input };
        } else {
          params = { query: input };
        }
      }

      if (session.waitingForMethod) {
        const methodMap = { '1': 'GET', '2': 'POST', '3': 'PUT', '4': 'DELETE' };
        method = methodMap[input] || 'GET';
        session.method = method;
        session.waitingForMethod = false;
        session.waitingForBody = true;
        this.sessions[senderId] = session;
        
        await sendMessage(senderId, { 
          text: `Enter request body (JSON) or type "none":` 
        }, token);
        return;
      }

      if (session.waitingForBody) {
        if (input.toLowerCase() !== 'none') {
          try {
            body = JSON.parse(input);
          } catch {
            body = { data: input };
          }
        }
        method = session.method || 'GET';
        delete this.sessions[senderId];
        await this.testApi(senderId, session.url, params, token, sendMessage, method, body);
        return;
      }

      delete this.sessions[senderId];
      await this.testApi(senderId, session.url, params, token, sendMessage, 'GET');

    } catch (error) {
      delete this.sessions[senderId];
      await sendMessage(senderId, { 
        text: `Error: ${error.message}\n\nType "test <url>" to start over` 
      }, token);
    }
  },

  splitMessage(text, maxLen) {
    const chunks = [];
    let current = '';
    const lines = text.split('\n');
    
    for (const line of lines) {
      if ((current + line + '\n').length > maxLen) {
        chunks.push(current);
        current = line + '\n';
      } else {
        current += line + '\n';
      }
    }
    
    if (current) chunks.push(current);
    return chunks;
  },

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
};
