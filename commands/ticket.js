const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Post the ticket panel (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(o => o.setName('title').setDescription('Embed title').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Embed description').setRequired(true))
        .addStringOption(o => o.setName('color').setDescription('red, green, blue, yellow, purple, black').setRequired(false)),

    async execute(interaction) {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const colorChoice = interaction.options.getString('color') || 'blue';

        const colors = {
            red: 0xED4245,
            green: 0x57F287,
            blue: 0x5865F2,
            yellow: 0xFEE75C,
            purple: 0xEB459E,
            black: 0x23272A
        };

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(colors[colorChoice] || colors.blue)
            .setTimestamp();

        const button = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket')
                    .setLabel('Create Ticket')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎫')
            );

        // This panel is IMPORTANT - don't auto delete
        await interaction.channel.send({ embeds: [embed], components: [button] });
        await interaction.editReply({ content: '✅ Ticket panel posted.' });
    }
};
