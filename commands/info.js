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
        let ticketChannel = null;

        for (const [userId, data] of configManager.tickets) {
            const cleanStored = data.robloxUsername?.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanStored === username) {
                ticketData = data;
                ticketOwner = userId;
                ticketChannel = interaction.guild.channels.cache.get(data.channelId);
                break;
            }
        }

        // Build info embed
        const infoEmbed = new EmbedBuilder()
            .setTitle('📋 Channel Info')
            .setColor(0x5865F2)
            .setTimestamp();

        // If found in memory
        if (ticketData) {
            infoEmbed.addFields(
                { name: 'Username', value: ticketData.robloxUsername, inline: true },
                { name: 'Item', value: item, inline: true },
                { name: 'Created', value: `<t:${createdAt}:F>`, inline: false },
                { name: 'Ticket Owner', value: `<@${ticketOwner}> (${ticketData.userTag})`, inline: false }
            );

            if (ticketChannel) {
                infoEmbed.addFields({ name: 'Ticket Channel', value: `${ticketChannel}`, inline: false });
            }
        } else {
            // Fallback: read from first message
            const messages = await interaction.channel.messages.fetch({ limit: 10 });
            const firstMessage = messages.last();
            
            let discordOwner = null;
            let robloxUser = username;
            let itemValue = item;

            if (firstMessage && firstMessage.embeds.length > 0) {
                const embed = firstMessage.embeds[0];
                const ownerField = embed.fields?.find(f => f.name === 'Ticket Owner');
                const robloxField = embed.fields?.find(f => f.name === 'Roblox User');
                const itemField = embed.fields?.find(f => f.name === 'Item');

                if (ownerField) {
                    const match = ownerField.value.match(/<@(\d+)>/);
                    discordOwner = match ? match[1] : null;
                }
                if (robloxField) robloxUser = robloxField.value;
                if (itemField) itemValue = itemField.value;
            }

            infoEmbed.addFields(
                { name: 'Username', value: robloxUser, inline: true },
                { name: 'Item', value: itemValue, inline: true },
                { name: 'Created', value: `<t:${createdAt}:F>`, inline: false }
            );

            if (discordOwner) {
                infoEmbed.addFields({ name: 'Ticket Owner', value: `<@${discordOwner}>`, inline: false });
            }
        }

        await interaction.editReply({ embeds: [infoEmbed] });
    }
};
