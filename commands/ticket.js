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
        .setDescription('Create a public ticket panel with buttons')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Only admins
        // Title
        .addStringOption(option => 
            option.setName('title')
                .setDescription('Embed title')
                .setRequired(true))
        // Message
        .addStringOption(option => 
            option.setName('message')
                .setDescription('Embed description/message')
                .setRequired(true))
        // Button 1 (required)
        .addStringOption(option => 
            option.setName('button1')
                .setDescription('First button label')
                .setRequired(true))
        // Button 2 (optional)
        .addStringOption(option => 
            option.setName('button2')
                .setDescription('Second button label (optional)')
                .setRequired(false))
        // Button 3 (optional)
        .addStringOption(option => 
            option.setName('button3')
                .setDescription('Third button label (optional)')
                .setRequired(false))
        // Button 4 (optional)
        .addStringOption(option => 
            option.setName('button4')
                .setDescription('Fourth button label (optional)')
                .setRequired(false))
        // Button 5 (optional)
        .addStringOption(option => 
            option.setName('button5')
                .setDescription('Fifth button label (optional)')
                .setRequired(false)),

    async execute(interaction) {
        const title = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        
        // Collect all buttons
        const buttons = [];
        for (let i = 1; i <= 5; i++) {
            const label = interaction.options.getString(`button${i}`);
            if (label) {
                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`ticket_create_${i}`)
                        .setLabel(label)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎫')
                );
            }
        }

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(message)
            .setColor(0x5865F2) // Discord blurple
            .setTimestamp()
            .setFooter({ 
                text: `Posted by ${interaction.user.tag}`, 
                iconURL: interaction.user.displayAvatarURL() 
            });

        // Split buttons into rows (max 5 per row)
        const rows = [];
        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder()
                .addComponents(buttons.slice(i, i + 5));
            rows.push(row);
        }

        // Send public message
        await interaction.channel.send({
            embeds: [embed],
            components: rows
        });

        // Confirm to admin (ephemeral)
        await interaction.reply({
            content: `✅ Ticket panel posted with **${buttons.length}** button(s)`,
            ephemeral: true
        });
    }
};
