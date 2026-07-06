const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: 'humanize',
  description: '50/50 AI-Human hybrid text transformer',
  usage: 'humanize [text]',
  author: '0xcodex',

  async execute(senderId, args, token) {
    const message = args.join(' ').trim() || 'hai';

    try {
      // Step 1: Get AI response
      const { data } = await axios.get(
        'https://betadash-api-swordslush-production.up.railway.app/humanize',
        {
          params: { text: message },
          timeout: 15000
        }
      );

      if (data.error === 'Yes') {
        throw new Error('API returned error');
      }

      let aiResponse = data.message || data.message2 || 'No response received';
      
      // Step 2: Hybrid humanization (50% AI, 50% human touch)
      aiResponse = await hybridHumanize(aiResponse);
      
      await sendChunks(senderId, aiResponse, token);

    } catch (error) {
      console.error(`[humanize] Failed: ${error.message}`);
      await sendMessage(senderId, {
        text: '⚠️ Error processing text. Please try again.'
      }, token);
    }
  }
};

// ===== HYBRID HUMANIZATION ENGINE =====
async function hybridHumanize(text) {
  // 50% AI STRUCTURE (clean, logical)
  // 50% HUMAN FLAVOR (natural, conversational)
  
  // --- PHASE 1: Keep AI's logical structure (50%) ---
  let hybrid = text;
  
  // Preserve core meaning and structure
  hybrid = hybrid.replace(/\b(additionally|furthermore|moreover)\b/gi, '');
  
  // --- PHASE 2: Add human elements (50%) ---
  
  // 2.1 Natural sentence starters
  const starters = [
    'Well, ', 'You know, ', 'Honestly, ', 'Basically, ', 
    'I mean, ', 'Look, ', 'The thing is, ', 'To be fair, '
  ];
  
  let sentences = hybrid.split('. ');
  for (let i = 0; i < sentences.length; i++) {
    // Add human flavor to 50% of sentences
    if (i % 2 === 0 && sentences[i].length > 15) {
      const starter = starters[Math.floor(Math.random() * starters.length)];
      sentences[i] = starter + sentences[i].toLowerCase();
    }
  }
  hybrid = sentences.join('. ');
  
  // 2.2 Human vocabulary mix (50% casual, 50% formal)
  const humanVocab = {
    'characterized by': ['is all about', 'means', 'involves'],
    'manifest in': ['show up as', 'appear through', 'come across as'],
    'influenced by': ['shaped by', 'affected by', 'depends on'],
    'associated with': ['linked to', 'connected with', 'related to'],
    'considered a': ['seen as a', 'viewed as a', 'regarded as a'],
    'fundamental': ['basic', 'core', 'essential'],
    'overall': ['general', 'overall', 'in general'],
    'various': ['different', 'multiple', 'several'],
    'such as': ['like', 'including', 'for example'],
    'external circumstances': ['outside factors', 'what happens around us'],
    'personal achievements': ['your own wins', 'personal successes'],
    'relationships': ['connections', 'bonds', 'ties'],
    'intrinsic factors': ['inner traits', 'personal qualities']
  };
  
  // Apply to 50% of occurrences
  for (const [formal, alternates] of Object.entries(humanVocab)) {
    if (Math.random() > 0.5) { // 50% chance
      const replacement = alternates[Math.floor(Math.random() * alternates.length)];
      hybrid = hybrid.replace(new RegExp('\\b' + formal + '\\b', 'gi'), replacement);
    }
  }
  
  // 2.3 Human-sounding transitions
  const transitions = [
    'and you know what? ', 'plus, ', 'also, ', 'not to mention, ',
    'what\'s interesting is ', 'the thing about it is '
  ];
  
  // Insert in 50% of appropriate places
  let parts = hybrid.split('. ');
  for (let i = 1; i < parts.length; i += 2) { // Every other sentence
    if (parts[i].length > 10) {
      const transition = transitions[Math.floor(Math.random() * transitions.length)];
      parts[i] = transition + parts[i].toLowerCase();
    }
  }
  hybrid = parts.join('. ');
  
  // 2.4 Human punctuation variation
  hybrid = hybrid.replace(/\. /g, (match) => {
    const choices = ['. ', '. ', '. ', '! ', '. ', '? ', '. '];
    return choices[Math.floor(Math.random() * choices.length)];
  });
  
  // 2.5 Add human hesitation (50% chance)
  if (Math.random() > 0.5) {
    const hesitations = ['um, ', 'uh, ', 'like, ', 'you know, '];
    const idx = Math.floor(Math.random() * hesitations.length);
    const pos = Math.floor(hybrid.length * 0.3);
    hybrid = hybrid.slice(0, pos) + hesitations[idx] + hybrid.slice(pos);
  }
  
  // 2.6 Natural sentence length variation
  let words = hybrid.split(' ');
  for (let i = 0; i < words.length; i += 20) {
    if (i > 0 && i < words.length - 5 && Math.random() > 0.6) {
      words[i] = words[i] + '.';
    }
  }
  hybrid = words.join(' ');
  
  // --- PHASE 3: Polish for fluency ---
  hybrid = hybrid.replace(/\s+/g, ' ').trim();
  hybrid = hybrid.replace(/\.\./g, '.');
  hybrid = hybrid.replace(/!\./g, '!');
  hybrid = hybrid.replace(/\?\./g, '?');
  
  // Capitalize first letter
  hybrid = hybrid.charAt(0).toUpperCase() + hybrid.slice(1);
  
  return hybrid;
}

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
