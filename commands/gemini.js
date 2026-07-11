const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'gemini',
  description: 'Chat with Gemini 2.5 Flash',
  usage: 'gemini [prompt]',
  author: 'codex',

  async execute(senderId, args, token, attachment) {
    let prompt = args.join(' ').trim();
    let imageUrl = null;

    if (attachment && attachment.type === 'image') {
      imageUrl = attachment.payload.url;
    }

    if (!prompt) {
      await sendMessage(senderId, {
        text: 'Please provide a prompt.'
      }, token);
      return;
    }

    try {
      const encodedPrompt = encodeURIComponent(prompt);
      let apiUrl = `https://norch-project.gleeze.com/api/gemini?prompt=${encodedPrompt}`;

      if (imageUrl) {
        const encodedImage = encodeURIComponent(imageUrl);
        apiUrl += `&imageurl=${encodedImage}`;
      }

      const response = await axios.get(apiUrl, {
        timeout: 30000
      });

      const aiResponse = response.data.response;

      if (!aiResponse) {
        throw new Error('Invalid API response');
      }

      let formattedResponse = aiResponse.trim();
      
      formattedResponse = formattedResponse.replace(/\*\*(.+?)\*\*/g, '$1');
      formattedResponse = formattedResponse.replace(/#{1,6}\s/g, '');
      formattedResponse = formattedResponse.replace(/---+/g, '');
      formattedResponse = formattedResponse.replace(/__/g, '');
      formattedResponse = formattedResponse.replace(/_/g, '');
      formattedResponse = formattedResponse.replace(/\*{1,}/g, '');
      formattedResponse = formattedResponse.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
      formattedResponse = formattedResponse.replace(/[\u{2600}-\u{27BF}]/gu, '');
      formattedResponse = formattedResponse.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
      formattedResponse = formattedResponse.replace(/\n{3,}/g, '\n\n');
      formattedResponse = formattedResponse.replace(/[ \t]+/g, ' ');
      formattedResponse = formattedResponse.trim();

      await sendChunks(senderId, formattedResponse, token);

    } catch (error) {
      const reason = error.response
        ? `API error ${error.response.status}`
        : error.message ?? 'Unknown error';

      console.error(`[Gemini] Failed for sender ${senderId}: ${reason}`);
      await sendMessage(senderId, {
        text: 'Server error. Please try again after 15.0s.'
      }, token);
    }
  }
};

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
  for (let i = 0; i < chunks.length; i++) {
    await sendMessage(senderId, { text: chunks[i] }, token);
  }
}
