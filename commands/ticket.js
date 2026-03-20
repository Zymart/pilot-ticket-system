const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Post a ticket panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(o => o.setName('title').setDescription('Panel title').setRequired(true))
        .addStringOption(o => o.setName('message').setDescription('Panel description').setRequired(true))
        .addStringOption(o => o.setName('button1').setDescription('Button 1 text').setRequired(true))
        .addStringOption(o => o.setName('button2').setDescription('Button 2 (optional)').setRequired(false))
        .addStringOption(o => o.setName('button3').setDescription('Button 3 (optional)').setRequired(false))
        .addStringOption(o => o.setName('color').setDescription('Embed color: blurple, red, green, yellow, black').setRequired(false)),

    async execute(interaction) {
        const title = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        const colorChoice = interaction.options.getString('color') || 'blurple';

        const colors = {
            blurple: 0x5865F2,
            red: 0xED4245,
            green: 0x57F287,
            yellow: 0xFEE75C,
            black: 0x23272A
        };

        // Build buttons
        const buttons = [];
        for (let i = 1; i <= 3; i++) {
            const label = interaction.options.getString(`button${i}`);
            if (label) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`ticket_${i}_${label.toLowerCase().replace(/\s+/g, '_')}`)
                        .setLabel(label)
                        .setStyle(i === 1 ? ButtonStyle.Success : i === 2 ? ButtonStyle.Primary : ButtonStyle.Danger)
                        .setEmoji(i === 1 ? '🎫' : i === 2 ? '💬' : '⚠️')
                );
            }
        }

        // Cool embed
        const embed = new EmbedBuilder()
            .setTitle(` ${title}`)
            .setDescription(`>>> ${message}`)
            .setColor(colors[colorChoice] || colors.blurple)
            .addFields(
                { name: 'How it works', value: 'Click a button below to open a private ticket channel.', inline: false }
            )
            .setImage('https://media.discordapp.net/attachments/933841367677173840/1083711883211116614/divider.png') // Optional divider line
            .setTimestamp()
            .setFooter({ text: 'Ticket System', iconURL: interaction.guild.iconURL() });

        // Max 3 buttons per row
        const rows = [];
        for (let i = 0; i < buttons.length; i += 3) {
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 3)));
        }

        await interaction.channel.send({ embeds: [embed], components: rows });
        await interaction.reply({ content: '✅ Panel posted.', ephemeral: true });
    }
};
