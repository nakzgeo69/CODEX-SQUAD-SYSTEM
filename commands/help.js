const fs = require('fs');
const path = require('path');
const { sendMessage } = require('../handles/sendMessage');

module.exports = {
  name: ['help', 'commands', 'menu'],
  description: 'Show all available commands with details',
  usage: 'help\nhelp [command name]',
  version: '1.0.0',
  author: 'codex',
  category: 'system',

  async execute(senderId, args, token, event) {
    const commandsDir = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

    const loadCommand = (file) => {
      try {
        return require(path.join(commandsDir, file));
      } catch {
        return null;
      }
    };

    // Load all commands - use Set to avoid duplicates
    const commandMap = new Map();
    const uniqueCommands = new Map(); // Track by main name only
    
    for (const file of commandFiles) {
      const cmd = loadCommand(file);
      if (cmd && cmd.name) {
        const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
        const mainName = names[0].toLowerCase();
        
        // Only add if not already added
        if (!uniqueCommands.has(mainName)) {
          uniqueCommands.set(mainName, {
            file: file,
            command: cmd,
            mainName: mainName,
            allNames: names.map(n => n.toLowerCase()),
            aliases: names.slice(1).map(n => n.toLowerCase())
          });
        }
      }
    }

    // If user asked for specific command
    if (args.length > 0) {
      const name = args[0].toLowerCase();
      let found = null;
      
      // Search in unique commands
      for (const [key, data] of uniqueCommands) {
        if (data.allNames.includes(name)) {
          found = data;
          break;
        }
      }

      if (found) {
        const cmd = found.command;
        let response = `\n\n`;
        response += `📌 Command: ${Array.isArray(cmd.name) ? cmd.name.join(', ') : cmd.name}\n\n`;
        response += `📝 Description: ${cmd.description || 'No description'}\n`;
        response += `📖 Usage: ${cmd.usage || 'No usage info'}\n`;
        response += `👤 Author: ${cmd.author || 'Unknown'}\n`;
        
        if (found.aliases.length > 0) {
          response += `🔗 Aliases: ${found.aliases.join(', ')}\n`;
        }
        
        if (cmd.category) {
          response += `📂 Category: ${cmd.category}\n`;
        }
        
        if (cmd.version) {
          response += `📦 Version: ${cmd.version}\n`;
        }
        
        if (cmd.cooldown) {
          response += `⏱️ Cooldown: ${cmd.cooldown}s\n`;
        }
        
        response += `\n`;
        
        await sendMessage(senderId, { text: response }, token);
      } else {
        await sendMessage(senderId, { 
          text: `Command "${name}" not found.\n\nType "help" to see all available commands.`
        }, token);
      }
      return;
    }

    // Group commands by category - use unique commands only
    const categories = {
      'AI & Chat': ['ai', 'gemini', 'gpt4', 'codex', 'realtime', 'humanize'],
      'Image Tools': ['enhance', 'removebg', 'imgbb', 'imagegen', 'generate'],
      'Social Tools': ['share', 'smsbomb'],
      'System': ['help']
    };

    let fullMessage = `\n---====[🌸 AVAILABLE COMMANDS NOW 🌸]====---\n\n`;

    // Build categorized list
    for (const [category, cmdNames] of Object.entries(categories)) {
      const available = [];
      const addedNames = new Set(); // Track to avoid duplicates within category
      
      for (const cmdName of cmdNames) {
        const found = uniqueCommands.get(cmdName);
        if (found && !addedNames.has(cmdName)) {
          const cmd = found.command;
          const mainName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
          const desc = cmd.description || 'No description';
          available.push(`  ❀ ${mainName} - ${desc.substring(0, 40)}${desc.length > 40 ? '...' : ''}`);
          addedNames.add(cmdName);
        }
      }

      if (available.length > 0) {
        fullMessage += `📂 ${category}\n`;
        fullMessage += `${available.join('\n')}\n\n`;
      }
    }

    // Add extra commands not in categories
    const extraCommands = [];
    const addedExtra = new Set();
    
    for (const [cmdName, data] of uniqueCommands) {
      let foundInCategory = false;
      for (const category of Object.values(categories)) {
        if (category.includes(cmdName)) {
          foundInCategory = true;
          break;
        }
      }
      if (!foundInCategory && !addedExtra.has(cmdName)) {
        const cmd = data.command;
        const mainName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
        const desc = cmd.description || 'No description';
        extraCommands.push(`  ❀ ${mainName} - ${desc.substring(0, 40)}${desc.length > 40 ? '...' : ''}`);
        addedExtra.add(cmdName);
      }
    }

    if (extraCommands.length > 0) {
      fullMessage += `📂 Others\n`;
      fullMessage += `${extraCommands.join('\n')}\n\n`;
    }

    fullMessage += `--===[ 🌸 Type "help [command]" for more details 🌸 ]==--\n`;
    fullMessage += `   Example: help ai to get the actual command usage\n`;

    await sendMessage(senderId, { text: fullMessage }, token);
  }
};
