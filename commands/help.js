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

    // Load all commands
    const allCommands = [];
    const commandMap = new Map();
    
    for (const file of commandFiles) {
      const cmd = loadCommand(file);
      if (cmd && cmd.name) {
        const names = Array.isArray(cmd.name) ? cmd.name : [cmd.name];
        names.forEach(name => {
          commandMap.set(name.toLowerCase(), {
            file: file,
            command: cmd,
            aliases: names.filter(n => n !== names[0])
          });
        });
        allCommands.push({
          file: file,
          command: cmd,
          mainName: Array.isArray(cmd.name) ? cmd.name[0] : cmd.name,
          aliases: Array.isArray(cmd.name) ? cmd.name.slice(1) : []
        });
      }
    }

    // If user asked for specific command
    if (args.length > 0) {
      const name = args[0].toLowerCase();
      const found = commandMap.get(name);

      if (found) {
        const cmd = found.command;
        let response = `\n`;
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
        
        response += ``;
        
        await sendMessage(senderId, { text: response }, token);
      } else {
        await sendMessage(senderId, { 
          text: `Command "${name}" not found.\n\nType "help" to see all available commands.`
        }, token);
      }
      return;
    }

    // Group commands by category
    const categories = {
      'AI & Chat': ['ai', 'gemini', 'gpt4'],
      'Image Tools': ['enhance', 'removebg', 'imgbb'],
      'Social Tools': ['share', 'smsbomb', 'smsbomber', 'bomb'],
      'System': ['help', 'commands', 'menu']
    };

    let fullMessage = `\n\n`;
    fullMessage += `---====[🌸 AVAILABLE COMMANDS NOW 🌸]====---\n`;
    fullMessage += `\n\n`;

    // Build categorized list
    for (const [category, cmdNames] of Object.entries(categories)) {
      const available = [];
      
      for (const cmdName of cmdNames) {
        const found = commandMap.get(cmdName);
        if (found) {
          const cmd = found.command;
          const mainName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
          const desc = cmd.description || 'No description';
          available.push(`  ❀ ${mainName} - ${desc.substring(0, 40)}${desc.length > 40 ? '...' : ''}`);
        }
      }

      if (available.length > 0) {
        fullMessage += `📂 ${category}\n`;
        fullMessage += `${available.join('\n')}\n\n`;
      }
    }

    // Add extra commands not in categories
    const extraCommands = [];
    for (const [cmdName, data] of commandMap) {
      let foundInCategory = false;
      for (const category of Object.values(categories)) {
        if (category.includes(cmdName)) {
          foundInCategory = true;
          break;
        }
      }
      if (!foundInCategory) {
        const cmd = data.command;
        const mainName = Array.isArray(cmd.name) ? cmd.name[0] : cmd.name;
        const desc = cmd.description || 'No description';
        extraCommands.push(`  ❀ ${mainName} - ${desc.substring(0, 40)}${desc.length > 40 ? '...' : ''}`);
      }
    }

    if (extraCommands.length > 0) {
      fullMessage += `📂 Others\n`;
      fullMessage += `${extraCommands.join('\n')}\n\n`;
    }

    fullMessage += `\n`;
    fullMessage += `🌸 Type "help [command]" for more details 🌸\n`;
    fullMessage += `   Example: help ai to get the actual command usage\n`;
    fullMessage += ``;

    await sendMessage(senderId, { text: fullMessage }, token);
  }
};
