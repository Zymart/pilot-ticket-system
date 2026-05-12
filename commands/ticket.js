const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

module.exports = {
    deferReply: false,
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Choose a channel, then send the message to turn into a ticket panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('ticket_panel_channel_select')
                .setPlaceholder('Pick a channel for the ticket panel')
                .setChannelTypes(ChannelType.GuildText)
                .setMinValues(1)
                .setMaxValues(1)
        );

        await interaction.reply({
            content: `<@${interaction.user.id}> Choose the channel where I should post the ticket panel.`,
            components: [row],
            ephemeral: true
        });
    }
};
