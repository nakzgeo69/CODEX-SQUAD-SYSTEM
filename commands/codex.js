const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

const API_URL = 'https://api-library-kohi-production.up.railway.app/api/publicai';
const MAX_CHUNK = 1800;

module.exports = {
  name: 'codex',
  description: 'Advanced Code Assistant & Debugger',
  usage: 'codex [code/message]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    const prompt = args.join(' ').trim() || 'Hello';

    try {
      const response = await axios.get(API_URL, {
        params: {
          prompt: prompt,
          user: '123'
        },
        timeout: 120000,
        maxContentLength: 1024 * 1024 * 10,
        maxBodyLength: 1024 * 1024 * 10
      });

      if (!response.data || !response.data.data) {
        throw new Error('Invalid API response');
      }

      let aiResponse = response.data.data.trim();
      
      if (!aiResponse || aiResponse.length < 10) {
        throw new Error('Empty response');
      }

      const detectedLang = detectLanguage(aiResponse, prompt);
      const hasCode = containsCode(aiResponse);

      aiResponse = cleanResponse(aiResponse);

      if (hasCode && detectedLang) {
        aiResponse = `[${detectedLang.toUpperCase()} CODE]\n\n${aiResponse}`;
      }

      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error(`[codex] Error:`, error.message);
      
      let errorMsg = 'Server error. Please try again later.';
      if (error.code === 'ECONNABORTED') {
        errorMsg = 'Request timeout. Please try a simpler query.';
      } else if (error.response?.status === 429) {
        errorMsg = 'Rate limit exceeded. Please wait and try again.';
      }
      
      await sendMessage(senderId, { text: errorMsg }, token);
    }
  }
};

function detectLanguage(code, prompt) {
  const patterns = {
    php: /<\?php|echo|\$[a-zA-Z_]|function\s+[a-zA-Z_]|class\s+[a-zA-Z_]|public\s+function|namespace/,
    javascript: /const\s+|let\s+|var\s+|function\s*\(|=>|async\s+function|await\s+|console\.log|require\(|import\s+.*from/,
    python: /def\s+[a-zA-Z_]|import\s+[a-zA-Z_]|from\s+[a-zA-Z_]|class\s+[A-Z]|self\.|__init__|print\(/,
    html: /<!DOCTYPE|<\s*html|<\s*head|<\s*body|<\s*div|<\s*span|<\s*p|<\s*h1|<\s*img|<\s*a\s+href/,
    css: /^[\s]*[a-zA-Z\-]+\s*\{|@media|@keyframes|#[\w-]+\s*\{|\.[\w-]+\s*\{/m,
    sql: /SELECT\s+|INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE/,
    java: /public\s+class|private\s+[a-zA-Z]|System\.out|@Override|import\s+java\.|void\s+main/,
    cpp: /#include\s*<|#include\s*"|std::|using\s+namespace|class\s+[A-Z]|public:|private:|protected:|cout|cin/,
    csharp: /using\s+System|namespace\s+[A-Z]|class\s+[A-Z]|public\s+[a-zA-Z]|private\s+[a-zA-Z]|void\s+Main/,
    ruby: /def\s+[a-zA-Z]|class\s+[A-Z]|end\s*$|require\s+['"]|puts\s+|attr_accessor/,
    go: /func\s+[a-zA-Z]|package\s+[a-zA-Z]|import\s+\(|type\s+[A-Z]|struct\s*\{|interface\s*\{/,
    rust: /fn\s+[a-zA-Z]|let\s+mut|let\s+[a-zA-Z]|impl\s+[A-Z]|pub\s+fn|use\s+[a-zA-Z]|println!/,
    swift: /func\s+[a-zA-Z]|class\s+[A-Z]|struct\s+[A-Z]|import\s+[A-Z]|let\s+[a-zA-Z]|var\s+[a-zA-Z]/,
    kotlin: /fun\s+[a-zA-Z]|class\s+[A-Z]|data\s+class|var\s+[a-zA-Z]|val\s+[a-zA-Z]|println\(/,
    typescript: /:\s*[a-zA-Z]+\s*=|interface\s+[A-Z]|type\s+[A-Z]|export\s+interface|export\s+type|as\s+[A-Z]/,
    shell: /^#!/|echo\s+["']|grep\s+|awk\s+|sed\s+|chmod|chown|mkdir|rm\s+-rf|sudo\s+|apt-get/
  };

  const promptLower = prompt.toLowerCase();
  for (const [lang, pattern] of Object.entries(patterns)) {
    if (pattern.test(code) || promptLower.includes(lang)) {
      return lang;
    }
  }

  const langMatch = code.match(/```(\w+)/);
  if (langMatch) return langMatch[1];

  return null;
}

function containsCode(text) {
  const patterns = [
    /```[\s\S]*?```/,
    /<\?php/,
    /function\s*\(/,
    /class\s+[A-Z]/,
    /const\s+[a-zA-Z]/,
    /let\s+[a-zA-Z]/,
    /var\s+[a-zA-Z]/,
    /def\s+[a-zA-Z_]/,
    /<html|<body|<div/,
    /SELECT\s+/,
    /#include\s*</,
    /using\s+System/,
    /package\s+[a-z]/,
    /func\s+[a-zA-Z]/,
    /fn\s+[a-zA-Z]/,
    /\$[a-zA-Z_]/
  ];

  return patterns.some(pattern => pattern.test(text));
}

function cleanResponse(text) {
  const codeBlocks = [];
  let processed = text.replace(/```([\s\S]*?)```/g, (match, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(code);
    return placeholder;
  });

  processed = processed
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^###\s*/gm, '')
    .replace(/^##\s*/gm, '')
    .replace(/^#\s*/gm, '')
    .replace(/---+/g, '')
    .replace(/\n{4,}/g, '\n\n\n');

  codeBlocks.forEach((code, index) => {
    const placeholder = `__CODE_BLOCK_${index}__`;
    const lang = detectLanguage(code, '');
    const langLabel = lang ? lang : '';
    processed = processed.replace(
      placeholder,
      `\n\`\`\`${langLabel}\n${code.trim()}\n\`\`\`\n`
    );
  });

  return processed.trim();
}

function splitIntoChunks(text) {
  const chunks = [];
  
  if (!text) return chunks;
  if (text.length <= MAX_CHUNK) {
    chunks.push(text);
    return chunks;
  }

  const lines = text.split('\n');
  let currentChunk = '';
  let inCodeBlock = false;
  let codeBlockLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLines = [line];
        continue;
      } else {
        inCodeBlock = false;
        const blockContent = codeBlockLines.join('\n');

        if ((currentChunk + blockContent + '\n').length > MAX_CHUNK && currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        currentChunk += blockContent + '\n';
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if ((currentChunk + line + '\n').length > MAX_CHUNK && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }

    currentChunk += line + '\n';
  }

  if (inCodeBlock && codeBlockLines.length > 0) {
    const blockContent = codeBlockLines.join('\n');
    currentChunk += blockContent + '\n';
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(chunk => chunk && chunk.length > 0);
}

async function sendChunks(senderId, text, token) {
  if (!text || text.trim().length === 0) {
    await sendMessage(senderId, { text: 'No content to display.' }, token);
    return;
  }

  const chunks = splitIntoChunks(text);

  if (chunks.length === 0) {
    await sendMessage(senderId, { text: 'No content to display.' }, token);
    return;
  }

  if (chunks.length === 1) {
    await sendMessage(senderId, { text: chunks[0] }, token);
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    let chunkText = chunks[i];
    
    if (chunks.length > 1) {
      chunkText = `[${i+1}/${chunks.length}]\n${chunkText}`;
    }

    await sendMessage(senderId, { text: chunkText }, token);

    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
}
