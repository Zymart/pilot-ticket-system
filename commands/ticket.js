const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Create a new support ticket'),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('ticketModal')
            .setTitle('Create Ticket');

        const titleInput = new TextInputBuilder()
            .setCustomId('ticketTitle')
            .setLabel('Title')
            .setPlaceholder('Enter ticket title...')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const messageInput = new TextInputBuilder()
            .setCustomId('ticketMessage')
            .setLabel('Message')
            .setPlaceholder('Describe your issue...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const titleRow = new ActionRowBuilder().addComponents(titleInput);
        const messageRow = new ActionRowBuilder().addComponents(messageInput);

        modal.addComponents(titleRow, messageRow);

        await interaction.showModal(modal);
    }
};
