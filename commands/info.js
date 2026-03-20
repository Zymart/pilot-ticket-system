const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Show info about this pilotweb channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewChannel),

    async execute(interaction, { configManager }) {
        // Check if in pilotweb channel
        if (!interaction.channel.name.includes('-')) {
            return await interaction.editReply({
                content: '❌ This command can only be used in pilotweb channels.'
            });
        }

        // Parse channel name: {username}-{item}
        const channelName = interaction.channel.name;
        const parts = channelName.split('-');
        
        if (parts.length < 2) {
            return await interaction.editReply({
                content: '❌ Invalid channel name format.'
            });
        }

        const item = parts.pop();
        const username = parts.join('-');

        // Find ticket by roblox username
        let ticketData = null;
        let ticketOwner = null;

        for (const [userId, data] of configManager.tickets) {
            const cleanStored = data.robloxUsername?.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanStored === username) {
                ticketData = data;
                ticketOwner = userId;
                break;
            }
        }

        // If not in active tickets, check closed tickets or channel history
        if (!ticketData) {
            // Try to get from channel topic or first message
            const messages = await interaction.channel.messages.fetch({ limit: 10 });
            const firstMessage = messages.last();
            
            if (firstMessage && firstMessage.embeds.length > 0) {
                const embed = firstMessage.embeds[0];
                const ownerField = embed.fields?.find(f => f.name === 'Discord Owner');
                const robloxField = embed.fields?.find(f => f.name === 'Roblox User');
                const itemField = embed.fields?.find(f => f.name === 'Item');

                if (ownerField && robloxField && itemField) {
                    const ownerMatch = ownerField.value.match(/<@(\d+)>/);
                    ticketOwner = ownerMatch ? ownerMatch[1] : null;
                    
                    const infoEmbed = new EmbedBuilder()
                        .setTitle('📋 Channel Info')
                        .addFields(
                            { name: 'Ticket Owner', value: ownerField.value, inline: true },
                            { name: 'Roblox Username', value: robloxField.value, inline: true },
                            { name: 'Item', value: itemField.value, inline: true }
                        )
                        .setColor(0x5865F2)
                        .setTimestamp();

                    return await interaction.editReply({ embeds: [infoEmbed] });
                }
            }
        }

        if (!ticketData) {
            // Fallback: just show parsed info
            const infoEmbed = new EmbedBuilder()
                .setTitle('📋 Channel Info')
                .addFields(
                    { name: 'Roblox Username', value: username, inline: true },
                    { name: 'Item', value: item, inline: true },
                    { name: 'Status', value: 'Ticket data not found in memory', inline: false }
                )
                .setColor(0x5865F2)
                .setTimestamp();

            return await interaction.editReply({ embeds: [infoEmbed] });
        }

        // Show full info from ticket data
        const infoEmbed = new EmbedBuilder()
            .setTitle('📋 Channel Info')
            .addFields(
                { name: 'Ticket Owner', value: `<@${ticketOwner}> (${ticketData.userTag})`, inline: true },
                { name: 'Roblox Username', value: ticketData.robloxUsername, inline: true },
                { name: 'Item', value: item, inline: true },
                { name: 'Buying', value: ticketData.buying || 'N/A', inline: true },
                { name: 'Game', value: ticketData.game || 'N/A', inline: true },
                { name: 'Ticket Status', value: ticketData.status || 'unknown', inline: true }
            )
            .setColor(0x5865F2)
            .setTimestamp();

        await interaction.editReply({ embeds: [infoEmbed] });
    }
};
