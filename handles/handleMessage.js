const fs = require('fs');
const path = require('path');
const { sendMessage } = require('./sendMessage');

const commands = new Map();
const imageCache = new Map();
const prefix = '-';
const CACHE_TTL = 10 * 60 * 1000; 

const loadCommands = () => {
  const commandsDir = path.join(__dirname, '../commands');
  
  for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
    delete require.cache[require.resolve(`../commands/${file}`)];
    const command = require(`../commands/${file}`);
    
    const names = Array.isArray(command.name) ? command.name : [command.name];
    names.forEach(name => {
      if (typeof name === 'string') {
        commands.set(name.toLowerCase(), command);
      }
    });
  }
};

loadCommands();

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of imageCache) {
    if (now - value.timestamp > CACHE_TTL) {
      imageCache.delete(key);
    }
  }
}, CACHE_TTL);

const handleMessage = async (event, pageAccessToken) => {
  const senderId = event?.sender?.id;
  if (!senderId) return;
  
  const messageText = event?.message?.text?.trim();
  const attachments = event?.message?.attachments || [];
  
  let imageUrl = null;
  for (const attachment of attachments) {
    if (attachment.type === 'image' && attachment.payload?.url) {
      imageUrl = attachment.payload.url;
      imageCache.set(senderId, {
        url: attachment.payload.url,
        timestamp: Date.now()
      });
      break;
    }
  }
  
  if (!messageText) return;
  
  const isCommand = messageText.startsWith(prefix);
  const [commandName, ...args] = isCommand 
    ? messageText.slice(prefix.length).split(' ')
    : messageText.split(' ');
  
  const normalizedCommand = commandName.toLowerCase();
  
  try {
    const command = commands.get(normalizedCommand);
    
    if (command) {
      // Check if command is 'imgbb' to pass imageUrl
      if (normalizedCommand === 'imgbb') {
        await command.execute(senderId, args, pageAccessToken, imageUrl);
      } else if (normalizedCommand === 'ai') {
        // AI command needs full event
        await command.execute(senderId, [messageText], pageAccessToken, event, sendMessage, imageCache);
      } else {
        // Other commands just need basic parameters
        await command.execute(senderId, args, pageAccessToken);
      }
    } else if (commands.has('ai')) {
      await commands.get('ai').execute(senderId, [messageText], pageAccessToken, event, sendMessage, imageCache);
    } else {
      await sendMessage(senderId, { text: 'Unknown command. Type "help" for available commands.' }, pageAccessToken);
    }
  } catch (error) {
    console.error('Command execution error:', error.message);
    await sendMessage(senderId, { text: 'Command execution failed.' }, pageAccessToken);
  }
};

module.exports = { handleMessage };
