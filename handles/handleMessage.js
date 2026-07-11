const { sendMessage } = require('./sendMessage');

let commands = {};

const cooldowns = new Map();
const COOLDOWN_SECONDS = 3;

async function loadCommands() {
  const fs = require('fs');
  const path = require('path');
  const commandsPath = path.join(__dirname, '..', 'commands');
  
  try {
    const files = fs.readdirSync(commandsPath);
    for (const file of files) {
      if (file.endsWith('.js')) {
        try {
          const command = require(path.join(commandsPath, file));
          if (command.name && command.execute) {
            commands[command.name] = command;
          }
        } catch (err) {
          console.error(`Error loading command ${file}:`, err.message);
        }
      }
    }
  } catch (error) {
    console.error('Error loading commands:', error);
  }
}

loadCommands();

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
    const helpMessage = 'AVAILABLE COMMANDS:\n\n' +
      'gemini - Chat with Gemini 2.5 Flash (supports image upload)\n' +
      'help - Show this menu';
    
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
        text: `Please wait ${remaining} second(s) before using this command again.` 
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
      text: 'An error occurred while executing the command.' 
    }, pageAccessToken);
  }
}

module.exports = { handleMessage };
