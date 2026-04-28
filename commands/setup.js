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
                .setName('pilot_channel_id')
                .setDescription('The pilot category ID for web channels')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('support_role_ids')
                .setDescription('Role IDs that can view all tickets (comma separated)')
                .setRequired(false)
        ),

    async execute(interaction, { configManager }) {
        const categoryId = interaction.options.getString('ticket_category_id');
        const pilotChannelId = interaction.options.getString('pilot_channel_id');
        const supportRoleIds = interaction.options.getString('support_role_ids');

        const category = interaction.guild.channels.cache.get(categoryId);
        if (!category || category.type !== ChannelType.GuildCategory) {
            return await interaction.editReply({
                content: '❌ Invalid category ID.'
            });
        }

        const guildConfig = {
            ticketCategoryId: categoryId,
            pilotChannelId: pilotChannelId || null,
            supportRoleIds: supportRoleIds ? supportRoleIds.split(',').map(id => id.trim()) : [],
            updatedBy: interaction.user.id,
            updatedByTag: interaction.user.tag
        };

        await configManager.saveGuildConfig(interaction.guild.id, guildConfig);

        let replyContent = `✅ **Setup complete!**\n\n**Ticket Category:** ${category.name} (\`${categoryId}\`)`;
        if (pilotChannelId) replyContent += `\n**Pilot Category:** \`${pilotChannelId}\``;
        if (supportRoleIds) replyContent += `\n**Support Roles:** ${supportRoleIds}`;

        await interaction.editReply({ content: replyContent });
    }
};
