const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['humanize', 'human'],
  description: 'Transform AI text to human-like response',
  usage: 'humanize [text or reply to AI response]',
  version: '1.0.0',
  author: 'codex',
  category: 'AI',
  cooldown: 5,

  async execute(senderId, args, token, event) {
    try {
      let text = args.join(' ').trim();

      // Check if replying to a message
      if (!text && event?.message?.reply_to?.mid) {
        const repliedMessage = await getRepliedMessage(event.message.reply_to.mid, token);
        if (repliedMessage) {
          text = repliedMessage;
          console.log('[humanize] Using replied message:', text);
        }
      }

      if (!text) {
        await sendMessage(senderId, {
          text: 'Usage: humanize [text] or reply to an AI response'
        }, token);
        return;
      }

      await sendMessage(senderId, {
        text: ''
      }, token);

      // Call humanize API
      const { data } = await axios.get(
        'https://betadash-api-swordslush-production.up.railway.app/humanize',
        {
          params: { text: text },
          timeout: 15000
        }
      );

      if (data.error === 'Yes') {
        throw new Error('API returned error');
      }

      let response = data.message || data.message2 || 'No response received';
      response = cleanResponse(response);

      await sendChunks(senderId, response, token);

    } catch (error) {
      console.error('[humanize] Error:', error.message);
      await sendMessage(senderId, {
        text: 'Server error. Please try again later.'
      }, token);
    }
  }
};

async function getRepliedMessage(mid, token) {
  try {
    const url = `https://graph.facebook.com/v21.0/${mid}`;
    const params = {
      access_token: token,
      fields: 'message'
    };
    const { data } = await axios.get(url, { params });
    return data?.message || null;
  } catch (error) {
    console.error('[getRepliedMessage] Error:', error.message);
    return null;
  }
}

function cleanResponse(text) {
  if (!text) return 'No response.';

  let cleaned = text.trim();

  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1');
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1');
  cleaned = cleaned.replace(/#{1,6}\s*/g, '');
  cleaned = cleaned.replace(/---+/g, '');
  cleaned = cleaned.replace(/__/g, '');
  cleaned = cleaned.replace(/_/g, '');
  cleaned = cleaned.replace(/`/g, '');
  cleaned = cleaned.replace(/```/g, '');
  cleaned = cleaned.replace(/~~/g, '');
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');

  cleaned = cleaned.replace(/[\u{1F000}-\u{1FFFF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2600}-\u{27BF}]/gu, '');
  cleaned = cleaned.replace(/[\u{FE00}-\u{FEFF}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
  cleaned = cleaned.replace(/[\u{2700}-\u{27BF}]/gu, '');

  cleaned = cleaned.trim();

  return cleaned || 'No response.';
}

function splitMessage(text) {
  const MAX_CHUNK = 1900;
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
