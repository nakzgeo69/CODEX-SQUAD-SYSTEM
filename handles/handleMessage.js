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
  
  // Extract image URL from attachments
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
  
  // If message has image and no text command, auto-upload to imgbb
  if (hasImage && imageUrl && !messageText) {
    console.log('Auto-uploading image to ImgBB...');
    const imgbbCommand = commands.get('imgbb');
    if (imgbbCommand) {
      await imgbbCommand.execute(senderId, [], pageAccessToken, imageUrl, event);
      return;
    }
  }
  
  // If message has image and text is not a command, auto-upload with caption
  if (hasImage && imageUrl && messageText) {
    // Check if message starts with command prefix
    const isCommand = messageText.startsWith(prefix);
    const [commandName] = isCommand 
      ? messageText.slice(prefix.length).split(' ')
      : messageText.split(' ');
    
    const normalizedCommand = commandName.toLowerCase();
    const command = commands.get(normalizedCommand);
    
    // If it's a command, execute it
    if (command) {
      const args = messageText.split(' ').slice(1);
      await command.execute(senderId, args, pageAccessToken, imageUrl, event);
      return;
    }
    
    // If it's not a command, auto-upload to imgbb with caption as prompt
    console.log('Auto-uploading image with caption...');
    const imgbbCommand = commands.get('imgbb');
    if (imgbbCommand) {
      await imgbbCommand.execute(senderId, [], pageAccessToken, imageUrl, event);
      // Also send the caption as a separate message
      await sendMessage(senderId, {
        text: `${messageText}`
      }, pageAccessToken);
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
      // Pass event to all commands
      await command.execute(senderId, args, pageAccessToken, imageUrl, event);
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
