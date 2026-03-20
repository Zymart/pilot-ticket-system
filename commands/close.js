const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('close')
        .setDescription('Close this ticket and show delete/transcript options')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, { configManager }) {
        // Check if in ticket channel
        if (!interaction.channel.name.startsWith('ticket-') && !interaction.channel.name.startsWith('closed-')) {
            return await interaction.editReply({
                content: '❌ This command can only be used in ticket channels.'
            });
        }

        // Check if already closed
        if (interaction.channel.name.startsWith('closed-')) {
            // Show delete/transcript buttons only
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('transcript_ticket')
                        .setLabel('Transcript')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📄'),
                    new ButtonBuilder()
                        .setCustomId('delete_ticket')
                        .setLabel('Delete')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️')
                );

            const embed = new EmbedBuilder()
                .setTitle('🔒 Ticket Already Closed')
                .setDescription('Choose an action:')
                .setColor(0xED4245)
                .setTimestamp();

            return await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });
        }

        // Close the ticket
        await interaction.channel.permissionOverwrites.set([
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }
        ]);

        const newName = `closed-${interaction.channel.name}`.slice(0, 100);
        await interaction.channel.setName(newName);

        // Update JSONBin
        const ticketEntry = Array.from(configManager.tickets.entries()).find(([k, v]) => v.channelId === interaction.channel.id);
        if (ticketEntry) {
            const [userId, ticketData] = ticketEntry;
            if (ticketData.binId && !ticketData.binId.startsWith('fake-')) {
                const jsonbin = require('../utils/jsonbin');
                const data = await jsonbin.read(ticketData.binId) || {};
                data.status = 'closed';
                data.closedAt = new Date().toISOString();
                data.closedBy = interaction.user.id;
                data.closedByTag = interaction.user.tag;
                await jsonbin.update(ticketData.binId, data);
            }
            await configManager.closeTicket(userId, { ...ticketData, status: 'closed' });
        }

        // Show delete/transcript buttons
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('transcript_ticket')
                    .setLabel('Transcript')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📄'),
                new ButtonBuilder()
                    .setCustomId('delete_ticket')
                    .setLabel('Delete')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️')
            );

        const embed = new EmbedBuilder()
            .setTitle('🔒 Ticket Closed')
            .setDescription(`Closed by ${interaction.user.tag}\n\nChoose an action:`)
            .setColor(0xED4245)
            .setTimestamp();

        await interaction.editReply({
            embeds: [embed],
            components: [actionRow]
        });

        await interaction.channel.send({
            embeds: [{
                title: 'Ticket Closed',
                description: `Closed by ${interaction.user.tag}`,
                color: 0xED4245,
                timestamp: new Date()
            }]
        });
    }
};
