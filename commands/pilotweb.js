const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
    ChannelType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const configManager = require('../utils/configManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pilotweb')
        .setDescription('Create a private web channel for ticket members only')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewChannel),

    async execute(interaction, { configManager }) {
        // Check if in ticket channel
        if (!interaction.channel.name.startsWith('ticket-') && !interaction.channel.name.startsWith('closed-')) {
            return await interaction.editReply({
                content: '❌ This command can only be used inside ticket channels.'
            });
        }

        // Get current channel permissions to see who has access
        const currentPerms = interaction.channel.permissionOverwrites.cache;
        const allowedUsers = [];
        const allowedRoles = [];

        for (const [id, perm] of currentPerms) {
            if (perm.allow.has(PermissionFlagsBits.ViewChannel)) {
                if (interaction.guild.members.cache.has(id)) {
                    allowedUsers.push(id);
                } else if (interaction.guild.roles.cache.has(id)) {
                    allowedRoles.push(id);
                }
            }
        }

        // Always include the command user
        if (!allowedUsers.includes(interaction.user.id)) {
            allowedUsers.push(interaction.user.id);
        }

        // Create permission overwrites for new channel
        const permissionOverwrites = [
            {
                id: interaction.guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            }
        ];

        // Add users
        for (const userId of allowedUsers) {
            permissionOverwrites.push({
                id: userId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            });
        }

        // Add roles
        for (const roleId of allowedRoles) {
            permissionOverwrites.push({
                id: roleId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            });
        }

        // Get guild config for category
        const guildConfig = await configManager.getGuildConfig(interaction.guild.id);
        
        const channelOptions = {
            name: `pilotweb-${interaction.channel.name.replace('ticket-', '').replace('closed-', '').slice(0, 20)}`,
            type: ChannelType.GuildText,
            permissionOverwrites: permissionOverwrites
        };

        if (guildConfig?.ticketCategoryId) {
            const category = interaction.guild.channels.cache.get(guildConfig.ticketCategoryId);
            if (category && category.type === ChannelType.GuildCategory) {
                channelOptions.parent = guildConfig.ticketCategoryId;
            }
        }

        try {
            const webChannel = await interaction.guild.channels.create(channelOptions);

            // Create webhook
            const webhook = await webChannel.createWebhook({
                name: 'PilotWeb',
                avatar: interaction.client.user.displayAvatarURL()
            });

            const webhookEmbed = new EmbedBuilder()
                .setTitle('🔗 Pilot Web Channel Created')
                .setDescription('Use this webhook to send messages to this channel from external services.')
                .addFields(
                    { name: 'Webhook URL', value: `\`${webhook.url}\`` },
                    { name: 'Channel', value: `${webChannel}` }
                )
                .setColor(0x5865F2)
                .setTimestamp();

            const copyRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`copy_webhook_${webhook.id}`)
                        .setLabel('Copy Webhook URL')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('📋')
                );

            await webChannel.send({
                content: `@everyone Pilot web channel created!`,
                embeds: [webhookEmbed],
                components: [copyRow]
            });

            await interaction.editReply({
                content: `✅ Pilot web channel created: ${webChannel}\nWebhook URL sent in the channel.`
            });

        } catch (err) {
            console.error('Pilotweb creation failed:', err);
            await interaction.editReply({ content: '❌ Failed to create pilot web channel.' });
        }
    }
};
