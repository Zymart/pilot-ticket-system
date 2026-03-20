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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pilotweb')
        .setDescription('Create a private web channel for ticket members only')
        .setDefaultMemberPermissions(PermissionFlagsBits.ViewChannel)
        .addStringOption(option =>
            option
                .setName('item')
                .setDescription('The item name for the channel')
                .setRequired(true)
        ),

    async execute(interaction, { configManager }) {
        // Check if in ticket channel
        if (!interaction.channel.name.startsWith('ticket-') && !interaction.channel.name.startsWith('closed-')) {
            return await interaction.editReply({
                content: '❌ This command can only be used inside ticket channels.'
            });
        }

        // Get guild config
        const guildConfig = await configManager.getGuildConfig(interaction.guild.id);
        
        // Check if pilot_channel_id (category) is set
        if (!guildConfig?.pilotChannelId) {
            return await interaction.editReply({
                content: '❌ Pilot category not configured. Use `/setup pilot_channel_id:CATEGORY_ID` first.'
            });
        }

        // Get item from command
        const item = interaction.options.getString('item');
        
        // Get ticket data to find username
        const ticketEntry = Array.from(configManager.tickets.entries()).find(([k, v]) => v.channelId === interaction.channel.id);
        const ticketData = ticketEntry ? ticketEntry[1] : null;
        const username = ticketData?.robloxUsername || 'unknown';
        
        // Clean names for channel
        const cleanUser = username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
        const cleanItem = item.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
        const channelName = `${cleanUser}-${cleanItem}`;

        // Get ALL members who can see this channel (not just from cache)
        await interaction.channel.fetch();
        const allowedUsers = [];
        const allowedRoles = [];

        for (const [id, perm] of interaction.channel.permissionOverwrites.cache) {
            // Skip @everyone (guild id)
            if (id === interaction.guild.id) continue;
            
            // If it's a user and they can view channel
            if (perm.allow.has(PermissionFlagsBits.ViewChannel)) {
                allowedUsers.push(id);
            }
            // If it's a role
            else if (perm.type === 0 && perm.allow.has(PermissionFlagsBits.ViewChannel)) {
                allowedRoles.push(id);
            }
        }

        // Always include command user
        if (!allowedUsers.includes(interaction.user.id)) {
            allowedUsers.push(interaction.user.id);
        }

        // Create permission overwrites
        const permissionOverwrites = [
            {
                id: interaction.guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            }
        ];

        // Add all users from ticket
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

        // Add all roles from ticket
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

        // Verify pilot channel is a category
        const pilotCategory = interaction.guild.channels.cache.get(guildConfig.pilotChannelId);
        if (!pilotCategory || pilotCategory.type !== ChannelType.GuildCategory) {
            return await interaction.editReply({
                content: '❌ Pilot channel ID is not a valid category. Please set a category ID in `/setup`.'
            });
        }

        const channelOptions = {
            name: channelName,
            type: ChannelType.GuildText,
            parent: guildConfig.pilotChannelId,
            permissionOverwrites: permissionOverwrites
        };

        try {
            const webChannel = await interaction.guild.channels.create(channelOptions);

            // Create webhook
            const webhook = await webChannel.createWebhook({
                name: 'PilotWeb',
                avatar: interaction.client.user.displayAvatarURL()
            });

            const webhookEmbed = new EmbedBuilder()
                .setTitle('🔗 Pilot Web Channel Created')
                .setDescription(`Item: **${item}** | User: **${username}**`)
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
                content: `Web channel created for **${username}** - **${item}**`,
                embeds: [webhookEmbed],
                components: [copyRow]
            });

            await interaction.editReply({
                content: `✅ Web channel created: ${webChannel}\n**User:** ${username}\n**Item:** ${item}`
            });

        } catch (err) {
            console.error('Pilotweb creation failed:', err);
            await interaction.editReply({ content: '❌ Failed to create web channel.' });
        }
    }
};
