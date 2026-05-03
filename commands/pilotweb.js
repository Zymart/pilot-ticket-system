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
const config = require('../config');

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
        )
        .addStringOption(option =>
            option
                .setName('timer')
                .setDescription('Enable a timer for this pilot?')
                .setRequired(true)
                .addChoices(
                    { name: 'Yes', value: 'y' },
                    { name: 'No', value: 'n' }
                )
        )
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Duration if timer is Yes (e.g., 3 days, 12 hours)')
                .setRequired(false)
        ),

    parseDuration(str) {
        const match = str.match(/^(\d+)\s*(d|day|days|h|hour|hours|m|min|mins|minutes)$/i);
        if (!match) return null;
        const val = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        if (unit.startsWith('d')) return val * 24 * 60 * 60 * 1000;
        if (unit.startsWith('h')) return val * 60 * 60 * 1000;
        if (unit.startsWith('m')) return val * 60 * 1000;
        return null;
    },

    async execute(interaction, { configManager }) {
        if (!interaction.channel.name.startsWith('ticket-') && !interaction.channel.name.startsWith('closed-')) {
            return await interaction.editReply({
                content: '❌ This command can only be used inside ticket channels.'
            });
        }

        const guildConfig = config.system;
        
        if (!guildConfig?.pilotChannelId) {
            return await interaction.editReply({
                content: '❌ Pilot category not configured.'
            });
        }

        const item = interaction.options.getString('item');
        const hasTimer = interaction.options.getString('timer') === 'y';
        const durationStr = interaction.options.getString('duration');
        let expiresAt = null;

        if (hasTimer) {
            if (!durationStr) return await interaction.editReply({ content: '❌ You must provide a duration if timer is enabled.' });
            const ms = this.parseDuration(durationStr);
            if (!ms) return await interaction.editReply({ content: '❌ Invalid duration format. Use e.g., "3 days" or "12 hours".' });
            expiresAt = Date.now() + ms;
        }

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

            const fields = [
                { name: 'Ticket Owner', value: `<@${discordUserId}> (${discordUserTag})`, inline: true },
                { name: 'Roblox User', value: username, inline: true },
                { name: 'Item', value: item, inline: true },
                { name: 'Created', value: `<t:${createdAt}:F>`, inline: false },
                { name: 'Ticket Channel', value: `${interaction.channel}`, inline: false }
            ];

            if (expiresAt) {
                fields.push({ 
                    name: '⏳ Deadline', 
                    value: `<t:${Math.floor(expiresAt / 1000)}:F> (<t:${Math.floor(expiresAt / 1000)}:R>)`, 
                    inline: false 
                });
            }

            const infoEmbed = new EmbedBuilder()
                .setTitle('📦 New Web Channel')
                .addFields(fields)
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

            // Save timer to state if applicable
            if (expiresAt) {
                const state = configManager.getPilotState?.() || { timers: {} };
                if (!state.timers) state.timers = {};
                state.timers[webChannel.id] = {
                    expiresAt,
                    creatorId: interaction.user.id,
                    notified: false
                };
                configManager.setPilotState?.(state);
            }

        // Ping the ticket owner in the original ticket channel
        await interaction.channel.send({
            content: `🚀 **Pilot Started!** <@${discordUserId}>`
        });

            const reply = await interaction.editReply({
                content: `✅ Web channel created: ${webChannel}\n**Discord:** ${discordUserTag}\n**Roblox:** ${username}\n**Item:** ${item}`
            });

            setTimeout(() => reply.delete().catch(() => {}), 120000);

        } catch (err) {
            console.error('Pilotweb creation failed:', err);
            await interaction.editReply({ content: '❌ Failed to create web channel.' });
        }
    }
};
