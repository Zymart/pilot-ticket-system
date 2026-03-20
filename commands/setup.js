const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ChannelType
} = require('discord.js');

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

    async execute(interaction, { configManager }) {
        const categoryId = interaction.options.getString('ticket_category_id');
        const supportRoleIds = interaction.options.getString('support_role_ids');
        const logChannelId = interaction.options.getString('log_channel_id');

        const category = interaction.guild.channels.cache.get(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
            return await interaction.editReply({
                content: '❌ Invalid category ID. Please provide a valid category ID.'
            });
        }

        const guildConfig = {
            ticketCategoryId: categoryId,
            supportRoleIds: supportRoleIds ? supportRoleIds.split(',').map(id => id.trim()) : [],
            logChannelId: logChannelId || null,
            updatedBy: interaction.user.id,
            updatedByTag: interaction.user.tag
        };

        // AUTO-SAVE TO JSONBIN
        await configManager.saveGuildConfig(interaction.guild.id, guildConfig);

        let replyContent = `✅ **Setup complete!**\n\n**Ticket Category:** ${category.name} (\`${categoryId}\`)`;
        if (supportRoleIds) replyContent += `\n**Support Roles:** ${supportRoleIds}`;
        if (logChannelId) replyContent += `\n**Log Channel:** \`${logChannelId}\``;

        await interaction.editReply({ content: replyContent });
    }
};
