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
        if (!interaction.channel.name.startsWith('ticket-') && !interaction.channel.name.startsWith('closed-')) {
            return await interaction.editReply({
                content: '❌ This command can only be used inside ticket channels.'
            });
        }

        const guildConfig = await configManager.getGuildConfig(interaction.guild.id);
        
        if (!guildConfig?.pilotChannelId) {
            return await interaction.editReply({
                content: '❌ Pilot category not configured.'
            });
        }

        const item = interaction.options.getString('item');
        
        const ticketEntry = Array.from(configManager.tickets.entries()).find(([k, v]) => v.channelId === interaction.channel.id);
        const ticketData = ticketEntry ? ticketEntry[1] : null;
        const username = ticketData?.robloxUsername || 'unknown';
        const discordUserId = ticketData?.userId || interaction.user.id;
        const discordUserTag = ticketData?.userTag || interaction.user.tag;

        const cleanUser = username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        const cleanItem = item.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        const channelName = `${cleanUser}-${cleanItem}`;

        await interaction.channel.fetch();
        
        const permissionOverwrites = [
            {
                id: interaction.guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            }
        ];

        // Get all permission overwrites from ticket channel and copy them
        for (const [id, perm] of interaction.channel.permissionOverwrites.cache) {
            if (id === interaction.guild.id) continue;
            
            if (perm.allow.has(PermissionFlagsBits.ViewChannel)) {
                // Check if it's a role
                const role = interaction.guild.roles.cache.get(id);
                if (role) {
                    permissionOverwrites.push({
                        id: id,
                        type: 0, // role
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    });
                } else {
                    // It's a user - use type 1
                    permissionOverwrites.push({
                        id: id,
                        type: 1, // member
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory,
                            PermissionFlagsBits.AttachFiles
                        ]
                    });
                }
            }
        }

        // Add support roles from config
        if (guildConfig?.supportRoleIds?.length > 0) {
            for (const roleId of guildConfig.supportRoleIds) {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role) {
                    const alreadyAdded = permissionOverwrites.some(p => p.id === roleId);
                    if (!alreadyAdded) {
                        permissionOverwrites.push({
                            id: roleId,
                            type: 0,
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        });
                    }
                }
            }
        }

        // Ensure ticket owner is added
        const ownerAdded = permissionOverwrites.some(p => p.id === discordUserId);
        if (!ownerAdded) {
            permissionOverwrites.push({
                id: discordUserId,
                type: 1,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            });
        }

        // Ensure command user is added
        const userAdded = permissionOverwrites.some(p => p.id === interaction.user.id);
        if (!userAdded) {
            permissionOverwrites.push({
                id: interaction.user.id,
                type: 1,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles
                ]
            });
        }

        const pilotCategory = interaction.guild.channels.cache.get(guildConfig.pilotChannelId);
        if (!pilotCategory || pilotCategory.type !== ChannelType.GuildCategory) {
            return await interaction.editReply({
                content: '❌ Invalid pilot category.'
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

            const webhook = await webChannel.createWebhook({
                name: 'PilotWeb',
                avatar: interaction.client.user.displayAvatarURL()
            });

            const createdAt = Math.floor(webChannel.createdTimestamp / 1000);

            const infoEmbed = new EmbedBuilder()
                .setTitle('📦 New Web Channel')
                .addFields(
                    { name: 'Ticket Owner', value: `<@${discordUserId}> (${discordUserTag})`, inline: true },
                    { name: 'Roblox User', value: username, inline: true },
                    { name: 'Item', value: item, inline: true },
                    { name: 'Created', value: `<t:${createdAt}:F>`, inline: false },
                    { name: 'Ticket Channel', value: `${interaction.channel}`, inline: false }
                )
                .setColor(0x5865F2)
                .setTimestamp();

            const webhookEmbed = new EmbedBuilder()
                .setTitle('🔗 Webhook Ready')
                .setDescription('Use this webhook URL to send messages from external services.')
                .addFields(
                    { name: 'Channel', value: `${webChannel}` }
                )
                .setColor(0x57F287)
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
                content: `Web channel created for **${discordUserTag}**`,
                embeds: [infoEmbed, webhookEmbed],
                components: [copyRow]
            });

            await interaction.editReply({
                content: `✅ Web channel created: ${webChannel}\n**Discord:** ${discordUserTag}\n**Roblox:** ${username}\n**Item:** ${item}`
            });

        } catch (err) {
            console.error('Pilotweb creation failed:', err);
            await interaction.editReply({ content: '❌ Failed to create web channel.' });
        }
    }
};
