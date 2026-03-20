const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ChannelType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'guildConfig.json');

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure ticket system settings (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option => 
            option
                .setName('ticket_category_id')
                .setDescription('The category ID where tickets will be created')
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName('support_role')
                .setDescription('Role that can view all tickets (optional)')
                .setRequired(false)
        )
        .addChannelOption(option =>
            option
                .setName('log_channel')
                .setDescription('Channel to log ticket events (optional)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),

    async execute(interaction) {
        const categoryId = interaction.options.getString('ticket_category_id');
        const supportRole = interaction.options.getRole('support_role');
        const logChannel = interaction.options.getChannel('log_channel');

        const category = interaction.guild.channels.cache.get(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
            return await interaction.reply({
                content: '❌ Invalid category ID. Please provide a valid category ID.',
                flags: MessageFlags.Ephemeral
            });
        }

        const config = loadConfig();
        config[interaction.guild.id] = {
            ticketCategoryId: categoryId,
            supportRoleId: supportRole?.id || null,
            logChannelId: logChannel?.id || null,
            updatedAt: new Date().toISOString(),
            updatedBy: interaction.user.id
        };
        saveConfig(config);

        let replyContent = `✅ **Setup complete!**\n\n**Ticket Category:** ${category.name} (\`${categoryId}\`)`;
        if (supportRole) replyContent += `\n**Support Role:** ${supportRole.name}`;
        if (logChannel) replyContent += `\n**Log Channel:** ${logChannel}`;

        await interaction.reply({
            content: replyContent,
            flags: MessageFlags.Ephemeral
        });
    }
};
