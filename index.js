const { commandDescriptions, loadCommands } = require('../handles/commandHandler');

let commands = {};

const cooldowns = new Map();
const COOLDOWN_SECONDS = 3;

(async () => {
  commands = await loadCommands();
})();

async function handleMessage(event, pageAccessToken) {
  const senderId = event.sender.id;
  const message = event.message;
  const text = message.text || '';
  const args = text.trim().split(/\s+/);
  const commandName = args.shift()?.toLowerCase();

  let attachment = null;
  
  if (message.attachments && message.attachments.length > 0) {
    const att = message.attachments[0];
    if (att.type === 'image') {
      attachment = {
        type: 'image',
        payload: {
          url: att.payload.url
        }
      };
    }
  }

  if (commandName === 'help' || commandName === 'commands' || commandName === 'menu') {
    const descriptions = commandDescriptions();
    const helpMessage = descriptions.length 
      ? `╔══════════════════════════╗\n║  📜  AVAILABLE COMMANDS  ║\n╚══════════════════════════╝\n\n${descriptions.join('\n')}`
      : 'No commands available.';
    
    await sendMessage(senderId, { text: helpMessage }, pageAccessToken);
    return;
  }

  const command = commands[commandName];
  if (!command) return;

  const now = Date.now();
  if (cooldowns.has(senderId)) {
    const last = cooldowns.get(senderId);
    if ((now - last) / 1000 < COOLDOWN_SECONDS) {
      const remaining = Math.ceil(COOLDOWN_SECONDS - (now - last) / 1000);
      await sendMessage(senderId, { 
        text: `⏳ Please wait ${remaining} second(s) before using this command again.` 
      }, pageAccessToken);
      return;
    }
  }
  cooldowns.set(senderId, now);

  try {
    await command.execute(senderId, args, pageAccessToken, attachment);
  } catch (error) {
    console.error(`Command error (${commandName}):`, error);
    await sendMessage(senderId, { 
      text: '⚠️ An error occurred while executing the command.' 
    }, pageAccessToken);
  }
}

async function sendMessage(recipientId, messageData, pageAccessToken) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v23.0/me/messages?access_token=${pageAccessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: messageData
        })
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Facebook API Error:', errorData);
    }
  } catch (error) {
    console.error('Send Message Error:', error);
  }
}

module.exports = { handleMessage, sendMessage };
