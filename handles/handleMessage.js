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
  
  // DEBUGGING: Log the full event to see what's inside
  console.log('FULL EVENT:', JSON.stringify(event, null, 2));
  console.log('ATTACHMENTS:', JSON.stringify(attachments, null, 2));
  
  let imageUrl = null;
  
  // Try different ways to extract image URL
  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      console.log('Attachment type:', attachment.type);
      console.log('Attachment payload:', JSON.stringify(attachment.payload, null, 2));
      
      if (attachment.type === 'image' || attachment.type === 'photo') {
        // Try multiple possible locations of the URL
        imageUrl = attachment.payload?.url || 
                   attachment.payload?.image?.url || 
                   attachment.url || 
                   null;
        
        if (imageUrl) {
          console.log('IMAGE URL FOUND:', imageUrl);
          imageCache.set(senderId, {
            url: imageUrl,
            timestamp: Date.now()
          });
          break;
        }
      }
    }
  }
  
  // If no image in attachments, try to get from cache
  if (!imageUrl && imageCache.has(senderId)) {
    imageUrl = imageCache.get(senderId).url;
    console.log('Using cached image URL:', imageUrl);
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
      console.log(`Executing command: ${normalizedCommand} with imageUrl:`, imageUrl);
      
      if (normalizedCommand === 'imgbb') {
        await command.execute(senderId, args, pageAccessToken, imageUrl);
      } else if (normalizedCommand === 'ai') {
        await command.execute(senderId, [messageText], pageAccessToken, event, sendMessage, imageCache);
      } else {
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
