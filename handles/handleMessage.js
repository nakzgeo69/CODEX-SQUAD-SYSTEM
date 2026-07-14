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
  let hasImage = false;
  
  for (const attachment of attachments) {
    if (attachment.type === 'image' || attachment.type === 'photo') {
      imageUrl = attachment.payload?.url || attachment.url || null;
      hasImage = true;
      if (imageUrl) {
        imageCache.set(senderId, {
          url: imageUrl,
          timestamp: Date.now()
        });
        break;
      }
    }
  }

  if (hasImage && imageUrl && !messageText) {
    console.log('[handleMessage] Auto-analyzing image with gemini...');
    const geminiCommand = commands.get('gemini');
    if (geminiCommand) {
      await geminiCommand.execute(senderId, [], pageAccessToken, event);
      return;
    }
  }

  if (hasImage && imageUrl && messageText) {
    const isCommand = messageText.startsWith(prefix);
    const [commandName] = isCommand 
      ? messageText.slice(prefix.length).split(' ')
      : messageText.split(' ');
    
    const normalizedCommand = commandName.toLowerCase();
    const command = commands.get(normalizedCommand);
    
    if (command) {
      const args = messageText.split(' ').slice(1);
      await command.execute(senderId, args, pageAccessToken, event);
      return;
    }
    
    console.log('[handleMessage] Auto-analyzing image with caption...');
    const geminiCommand = commands.get('gemini');
    if (geminiCommand) {
      await geminiCommand.execute(senderId, [], pageAccessToken, event);
      return;
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
      await command.execute(senderId, args, pageAccessToken, event);
    } else if (commands.has('ai')) {
      await commands.get('ai').execute(senderId, [messageText], pageAccessToken, event);
    }
  } catch (error) {
    console.error('Command execution error:', error.message);
    await sendMessage(senderId, { text: 'Command execution failed.' }, pageAccessToken);
  }
};

module.exports = { handleMessage };
