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
        
        const channelNameParts = interaction.channel.name.replace('ticket-', '').replace('closed-', '').split('-');
        const usernameFromChannel = channelNameParts[0] || 'unknown';
        
        const ticketEntry = Array.from(configManager.tickets.entries()).find(([k, v]) => v.channelId === interaction.channel.id);
        const ticketData = ticketEntry ? ticketEntry[1] : null;
        
        const username = ticketData?.robloxUsername || usernameFromChannel;
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

        for (const [id, perm] of interaction.channel.permissionOverwrites.cache) {
            if (id === interaction.guild.id) continue;
            
            if (perm.allow.has(PermissionFlagsBits.ViewChannel)) {
                const isRole = interaction.guild.roles.cache.has(id);
                
                permissionOverwrites.push({
                    id: id,
                    type: isRole ? 0 : 1,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                });
            }
        }

        if (guildConfig?.supportRoleIds?.length > 0) {
            for (const roleId of guildConfig.supportRoleIds) {
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

            // This is the IMPORTANT message - keep it
            const infoMessage = await webChannel.send({
                content: `Web channel created for **${discordUserTag}**`,
                embeds: [infoEmbed, webhookEmbed],
                components: [copyRow]
            });

            // Save message ID to check later
            // (not implemented but you could save this to know which to keep)

            const reply = await interaction.editReply({
                content: `✅ Web channel created: ${webChannel}\n**Discord:** ${discordUserTag}\n**Roblox:** ${username}\n**Item:** ${item}`
            });

            // Auto delete the command reply after 2 minutes
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 120000);

        } catch (err) {
            console.error('Pilotweb creation failed:', err);
            await interaction.editReply({ content: '❌ Failed to create web channel.' });
        }
    }
};
