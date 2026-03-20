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
        .addStringOption(option =>
            option
                .setName('support_role_ids')
                .setDescription('Role IDs that can view all tickets (comma separated, optional)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('log_channel_id')
                .setDescription('Channel ID to log ticket events (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const categoryId = interaction.options.getString('ticket_category_id');
        const supportRoleIds = interaction.options.getString('support_role_ids');
        const logChannelId = interaction.options.getString('log_channel_id');

        const category = interaction.guild.channels.cache.get(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
            return await interaction.editReply({
                content: '❌ Invalid category ID. Please provide a valid category ID.'
            });
        }

        const config = loadConfig();
        config[interaction.guild.id] = {
            ticketCategoryId: categoryId,
            supportRoleIds: supportRoleIds ? supportRoleIds.split(',').map(id => id.trim()) : [],
            logChannelId: logChannelId || null,
            updatedAt: new Date().toISOString(),
            updatedBy: interaction.user.id
        };
        saveConfig(config);

        let replyContent = `✅ **Setup complete!**\n\n**Ticket Category:** ${category.name} (\`${categoryId}\`)`;
        if (supportRoleIds) replyContent += `\n**Support Roles:** ${supportRoleIds}`;
        if (logChannelId) replyContent += `\n**Log Channel:** \`${logChannelId}\``;

        await interaction.editReply({
            content: replyContent
        });
    }
};
