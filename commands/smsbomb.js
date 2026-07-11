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
        const now = Date.now();
        
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
                text: `SMS Bomber Tool\n\nUsage:\nsmsbomb [phone] | [amount]\n\nExample:\nsmsbomb 09123456789 | 10\n\nAmount Range: 1-100 messages\nCooldown: 3 minutes`
            }, token);
            return;
        }

        // Parse args with | separator
        let phone, requestedAmount;
        const separatorIndex = args.findIndex(arg => arg === '|');

        if (separatorIndex !== -1) {
            phone = args.slice(0, separatorIndex).join(' ');
            requestedAmount = parseInt(args[separatorIndex + 1]);
        } else {
            phone = args[0];
            requestedAmount = parseInt(args[1]);
        }

        const apiKey = '79d08d76a3deae3fae1c7637141db818ec02faf1e3597e302c4ed9e1d5211d89';

        // Validate phone number
        if (!phone || phone.length < 10) {
            await sendMessage(senderId, { text: 'Invalid phone number. Please provide a valid phone number.' }, token);
            return;
        }

        // Validate amount
        if (isNaN(requestedAmount) || requestedAmount < 1 || requestedAmount > 100) {
            await sendMessage(senderId, { text: 'Amount must be between 1 and 100' }, token);
            return;
        }

        await sendMessage(senderId, { text: `Starting SMS bombing to ${phone}...` }, token);

        try {
            const response = await axios.get('https://haji-mix-api.gleeze.com/api/smsbomber', {
                params: {
                    phone: phone,
                    amount: requestedAmount,
                    api_key: apiKey
                },
                timeout: 30000
            });

            console.log('Full API Response:', JSON.stringify(response.data, null, 2));

            if (response.data) {
                // Set cooldown
                userCooldowns.set(senderId, Date.now());

                // Get the actual amount sent from the response
                let actualSent = 0;
                
                // Try to get actual count from different response formats
                if (response.data.success_count !== undefined) {
                    actualSent = parseInt(response.data.success_count) || 0;
                } else if (response.data.sent !== undefined) {
                    actualSent = parseInt(response.data.sent) || 0;
                } else if (response.data.total !== undefined) {
                    actualSent = parseInt(response.data.total) || 0;
                } else if (response.data.count !== undefined) {
                    actualSent = parseInt(response.data.count) || 0;
                } else if (response.data.success !== undefined) {
                    actualSent = parseInt(response.data.success) || 0;
                } else if (response.data.message) {
                    const countMatch = response.data.message.match(/(\d+)/);
                    if (countMatch) {
                        actualSent = parseInt(countMatch[1]) || requestedAmount;
                    } else {
                        actualSent = requestedAmount;
                    }
                } else {
                    actualSent = requestedAmount;
                }

                // If actualSent is 0, use the requested amount
                if (actualSent === 0) {
                    actualSent = requestedAmount;
                }

                // Build response message
                let message = `SMS Bombing Complete\n\n`;
                message += `Target: ${phone}\n`;
                message += `Requested: ${requestedAmount} messages\n`;
                message += `Successfully Sent: ${actualSent}\n\n`;

                if (actualSent !== requestedAmount) {
                    message += `Note: The system sent ${actualSent} messages instead of ${requestedAmount}.\n`;
                    message += `This is due to the API's automatic message limit.\n\n`;
                }

                message += `Next use available in 3 minutes`;

                await sendMessage(senderId, { text: message }, token);
                
                console.log(`SMS bomb: Requested ${requestedAmount}, Actual Sent ${actualSent} to ${phone} by user ${senderId}`);
                
            } else {
                await sendMessage(senderId, { 
                    text: `Failed to Start SMS Bombing\n\nError: ${response.data?.message || 'Unknown error'}\n\nPlease check the phone number and try again later.`
                }, token);
            }
            
        } catch (error) {
            console.error('SMS Bomber Error:', error);
            
            let errorMessage = `Error Occurred\n\n`;
            
            if (error.response?.status === 429) {
                errorMessage += `Rate limit exceeded. Please wait a few minutes before trying again.`;
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
