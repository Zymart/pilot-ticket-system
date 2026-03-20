const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Show info about this pilotweb channel (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, { configManager }) {
        // Check if in pilotweb channel
        if (!interaction.channel.name.includes('-')) {
            return await interaction.editReply({
                content: '❌ This command can only be used in pilotweb channels.'
            });
        }

        // Get channel creation time
        const createdAt = Math.floor(interaction.channel.createdTimestamp / 1000);

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
        let ticketOwnerTag = null;
        let ticketChannel = null;

        for (const [userId, data] of configManager.tickets) {
            const cleanStored = data.robloxUsername?.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanStored === username) {
                ticketData = data;
                ticketOwner = userId;
                ticketOwnerTag = data.userTag;
                ticketChannel = interaction.guild.channels.cache.get(data.channelId);
                break;
            }
        }

        // Build info embed with exact field order
        const infoEmbed = new EmbedBuilder()
            .setTitle('📋 Channel Info')
            .setColor(0x5865F2)
            .setTimestamp();

        // If found in memory
        if (ticketData) {
            infoEmbed.addFields(
                { name: 'Ticket Owner', value: `<@${ticketOwner}> (${ticketOwnerTag})`, inline: false },
                { name: 'Username', value: ticketData.robloxUsername, inline: true },
                { name: 'Item', value: item, inline: true },
                { name: 'Ticket Channel', value: ticketChannel ? `${ticketChannel}` : 'Not found', inline: false },
                { name: 'Created', value: `<t:${createdAt}:F>`, inline: false }
            );
        } else {
            // Fallback: read from first message
            const messages = await interaction.channel.messages.fetch({ limit: 10 });
            const firstMessage = messages.last();
            
            let discordOwner = null;
            let discordOwnerTag = null;
            let robloxUser = username;
            let itemValue = item;
            let sourceTicketChannel = null;

            if (firstMessage && firstMessage.embeds.length > 0) {
                const embed = firstMessage.embeds[0];
                const ownerField = embed.fields?.find(f => f.name === 'Ticket Owner');
                const robloxField = embed.fields?.find(f => f.name === 'Roblox User');
                const itemField = embed.fields?.find(f => f.name === 'Item');
                const ticketField = embed.fields?.find(f => f.name === 'Ticket Channel');

                if (ownerField) {
                    const match = ownerField.value.match(/<@(\d+)>/);
                    discordOwner = match ? match[1] : null;
                    discordOwnerTag = ownerField.value.match(/\((.+)\)/)?.[1] || 'Unknown';
                }
                if (robloxField) robloxUser = robloxField.value;
                if (itemField) itemValue = itemField.value;
                if (ticketField) {
                    const match = ticketField.value.match(/<#(\d+)>/);
                    if (match) sourceTicketChannel = match[1];
                }
            }

            const ticketChannelMention = sourceTicketChannel ? `<#${sourceTicketChannel}>` : `${interaction.channel}`;

            infoEmbed.addFields(
                { name: 'Ticket Owner', value: discordOwner ? `<@${discordOwner}> (${discordOwnerTag || 'Unknown'})` : 'Unknown', inline: false },
                { name: 'Username', value: robloxUser, inline: true },
                { name: 'Item', value: itemValue, inline: true },
                { name: 'Ticket Channel', value: ticketChannelMention, inline: false },
                { name: 'Created', value: `<t:${createdAt}:F>`, inline: false }
            );
        }

        await interaction.editReply({ embeds: [infoEmbed] });
    }
};
