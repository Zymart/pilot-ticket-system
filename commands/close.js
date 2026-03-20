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
        if (!interaction.channel.name.startsWith('ticket-') && !interaction.channel.name.startsWith('closed-')) {
            return await interaction.editReply({
                content: '❌ This command can only be used in ticket channels.'
            });
        }

        if (interaction.channel.name.startsWith('closed-')) {
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

            const reply = await interaction.editReply({
                embeds: [embed],
                components: [actionRow]
            });

            setTimeout(() => reply.delete().catch(() => {}), 300000);
            return;
        }

        await interaction.channel.permissionOverwrites.set([
            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }
        ]);

        const newName = `closed-${interaction.channel.name}`.slice(0, 100);
        await interaction.channel.setName(newName);

        const ticketEntry = Array.from(configManager.tickets.entries()).find(([k, v]) => v.channelId === interaction.channel.id);
        if (ticketEntry) {
            const [userId, ticketData] = ticketEntry;
            await configManager.closeTicket(userId, { ...ticketData, status: 'closed' });
        }

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

        const reply = await interaction.editReply({
            embeds: [embed],
            components: [actionRow]
        });

        setTimeout(() => reply.delete().catch(() => {}), 300000);

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
