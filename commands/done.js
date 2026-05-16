const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    FileBuilder
} = require('discord.js');
const config = require('../config');
const {
    buildTranscriptAttachment,
    createTranscript,
    deleteConnectedChannels,
    incrementCounterChannel,
    isTicketChannel,
    removeTicketByChannel,
    resolveTicketSummary
} = require('../utils/ticketHelpers');
const {
    ensureDiscordRestToken,
    sendWithDiscordRestToken
} = require('../utils/discordRest');

const DONE_DELETE_DELAY_MS = 5000;

function buildCompletionMentions() {
    return {
        content: '@everyone',
        allowedMentions: {
            parse: ['everyone']
        }
    };
}

function getVouchChannelUrl(guildId) {
    if (!guildId || !config.system.vouchChannelId) {
        return null;
    }

    return `https://discord.com/channels/${guildId}/${config.system.vouchChannelId}`;
}

function buildVouchButtons(guildId) {
    const buttons = [];
    const facebookVouchLinks = Array.isArray(config.system.facebookVouchLinks)
        ? config.system.facebookVouchLinks
        : [
            {
                label: 'Facebook',
                url: config.system.facebookVouchUrl
            }
        ];

    for (const link of facebookVouchLinks) {
        if (!link?.label || !link?.url) {
            continue;
        }

        buttons.push(
            new ButtonBuilder()
                .setLabel(link.label)
                .setStyle(ButtonStyle.Link)
                .setURL(link.url)
        );
    }

    const vouchChannelUrl = getVouchChannelUrl(guildId);
    if (vouchChannelUrl) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Open Vouch Channel')
                .setStyle(ButtonStyle.Link)
                .setURL(vouchChannelUrl)
        );
    }

    return buttons;
}

function buildVouchActionRow(guildId) {
    const buttons = buildVouchButtons(guildId);
    if (buttons.length === 0) {
        return null;
    }

    return new ActionRowBuilder().addComponents(...buttons);
}

function buildCompletionFields(summary, ownerMention, completedByTag) {
    if (summary.isTrade) {
        return [
            { name: 'Buyer', value: ownerMention, inline: true },
            { name: 'Seller', value: summary.sellerId ? `<@${summary.sellerId}>` : 'Unknown', inline: true },
            { name: 'Product', value: summary.buying, inline: false },
            { name: 'Completed By', value: completedByTag, inline: true }
        ];
    }

    return [
        { name: 'Ticket Owner', value: ownerMention, inline: true },
        { name: 'Roblox Username', value: summary.robloxUsername, inline: true },
        { name: 'Buying', value: summary.buying, inline: true },
        { name: 'Game', value: summary.game, inline: true },
        { name: 'Completed By', value: completedByTag, inline: true }
    ];
}

function buildCompletionDetails(summary, ownerMention, completedByTag) {
    return buildCompletionFields(summary, ownerMention, completedByTag)
        .map(field => `- **${field.name}:** ${field.value}`)
        .join('\n');
}

function buildCompletionIntro(summary, includeEveryone) {
    const lines = [];

    if (includeEveryone) {
        lines.push('@everyone', '');
    }

    lines.push(summary.isTrade ? '## Transaction Complete' : '## Ticket Complete');
    lines.push(summary.isTrade
        ? 'Thank you for using our trading service.'
        : 'Thank you for using our pilot service.');
    lines.push('Use the buttons below to vouch on Facebook or open the vouch channel.');
    lines.push(`This ticket and any linked channels will close in ${DONE_DELETE_DELAY_MS / 1000} seconds.`);

    return lines.join('\n');
}

function buildCompletionComponents({
    summary,
    ownerMention,
    completedByTag,
    guildId,
    includeEveryone = false,
    transcriptFileName = null
}) {
    const accentColor = summary.isTrade ? 0x9B59B6 : 0x57F287;
    const container = new ContainerBuilder()
        .setAccentColor(accentColor)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(buildCompletionIntro(summary, includeEveryone))
        )
        .addSeparatorComponents(
            new SeparatorBuilder().setDivider(true)
        )
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**Details**\n${buildCompletionDetails(summary, ownerMention, completedByTag)}`)
        );

    const vouchActionRow = buildVouchActionRow(guildId);
    if (vouchActionRow) {
        container.addActionRowComponents(vouchActionRow);
    }

    if (transcriptFileName) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('**Transcript**\nAttached below.')
            )
            .addFileComponents(
                new FileBuilder().setURL(`attachment://${transcriptFileName}`)
            );
    }

    return [container];
}

function buildCompletionEmbed(summary, ownerMention, completedByTag, includeTranscript = false) {
    const completionEmbed = new EmbedBuilder()
        .setTitle(summary.isTrade ? 'Transaction Complete' : 'Ticket Complete')
        .setDescription([
            summary.isTrade
                ? 'Thank you for using our trading service.'
                : 'Thank you for using our pilot service.',
            '',
            'Use the buttons below to vouch on Facebook or open the vouch channel.',
            `This ticket and any linked channels will close in ${DONE_DELETE_DELAY_MS / 1000} seconds.`
        ].join('\n'))
        .addFields(buildCompletionFields(summary, ownerMention, completedByTag))
        .setColor(summary.isTrade ? 0x9B59B6 : 0x57F287)
        .setTimestamp();

    if (includeTranscript) {
        completionEmbed.addFields({ name: 'Transcript', value: 'Attached below.', inline: false });
    }

    return completionEmbed;
}

function buildTranscriptFiles(transcriptFileName, transcriptFileBuffer) {
    if (!transcriptFileName || !transcriptFileBuffer) {
        return undefined;
    }

    return [buildTranscriptAttachment(transcriptFileName, transcriptFileBuffer)];
}

function buildCompletionPayload({
    summary,
    ownerMention,
    completedByTag,
    guildId,
    includeEveryone = false,
    transcriptFileName = null,
    transcriptFileBuffer = null
}) {
    const completionMentions = includeEveryone ? buildCompletionMentions() : null;
    const payload = {
        flags: MessageFlags.IsComponentsV2,
        components: buildCompletionComponents({
            summary,
            ownerMention,
            completedByTag,
            guildId,
            includeEveryone,
            transcriptFileName
        })
    };

    const transcriptFiles = buildTranscriptFiles(transcriptFileName, transcriptFileBuffer);
    if (transcriptFiles) {
        payload.files = transcriptFiles;
    }

    if (completionMentions) {
        payload.allowedMentions = completionMentions.allowedMentions;
    }

    return payload;
}

function buildLegacyCompletionPayload({
    summary,
    ownerMention,
    completedByTag,
    guildId,
    includeEveryone = false,
    transcriptFileName = null,
    transcriptFileBuffer = null
}) {
    const completionMentions = includeEveryone ? buildCompletionMentions() : null;
    const payload = {
        embeds: [buildCompletionEmbed(summary, ownerMention, completedByTag, Boolean(transcriptFileName))]
    };
    const vouchActionRow = buildVouchActionRow(guildId);

    if (vouchActionRow) {
        payload.components = [vouchActionRow];
    }

    const transcriptFiles = buildTranscriptFiles(transcriptFileName, transcriptFileBuffer);
    if (transcriptFiles) {
        payload.files = transcriptFiles;
    }

    if (completionMentions) {
        payload.content = completionMentions.content;
        payload.allowedMentions = completionMentions.allowedMentions;
    }

    return payload;
}

async function sendCompletionMessage(target, payloadOptions) {
    try {
        return await sendWithDiscordRestToken(
            target,
            buildCompletionPayload(payloadOptions),
            '/done completion message'
        );
    } catch (error) {
        console.error('Components V2 completion message failed; falling back to legacy embed:', error);
        return await sendWithDiscordRestToken(
            target,
            buildLegacyCompletionPayload(payloadOptions),
            '/done legacy completion message'
        );
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('done')
        .setDescription('Complete this ticket, send the transcript, and close everything after 5 seconds')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, { configManager }) {
        ensureDiscordRestToken(interaction.client, '/done command');

        if (!isTicketChannel(interaction.channel)) {
            return await interaction.editReply({
                content: 'This command can only be used in ticket channels.'
            });
        }

        try {
            const summary = await resolveTicketSummary(configManager, interaction.channel);
            const ownerMention = summary.ownerId ? `<@${summary.ownerId}>` : summary.ownerTag;
            const ticketData = {
                userId: summary.ownerId,
                userTag: summary.ownerTag,
                robloxUsername: summary.robloxUsername,
                buying: summary.buying,
                game: summary.game
            };
            const { fileName, fileBuffer } = await createTranscript(
                interaction.channel,
                ticketData,
                interaction.user.tag
            );
            const completionPayloadOptions = {
                summary,
                ownerMention,
                completedByTag: interaction.user.tag,
                guildId: interaction.guild.id
            };

            let channelMessageStatus = 'Completion message posted in this ticket.';
            try {
                await sendCompletionMessage(interaction.channel, {
                    ...completionPayloadOptions,
                    includeEveryone: true
                });
            } catch (error) {
                console.error('Done command channel completion message with @everyone failed; retrying without @everyone:', error);

                try {
                    await sendCompletionMessage(interaction.channel, {
                        ...completionPayloadOptions,
                        includeEveryone: false
                    });
                    channelMessageStatus = 'Completion message posted in this ticket without @everyone.';
                } catch (retryError) {
                    console.error('Done command channel completion message failed:', retryError);
                    channelMessageStatus = 'Completion message could not be posted in this ticket.';
                }
            }

            let dmStatus = 'Transcript could not be sent via DM. Their DMs might be closed.';
            if (summary.ownerId) {
                try {
                    const owner = await interaction.client.users.fetch(summary.ownerId);
                    await sendCompletionMessage(owner, {
                        ...completionPayloadOptions,
                        transcriptFileName: fileName,
                        transcriptFileBuffer: fileBuffer
                    });
                    dmStatus = 'Transcript and completion message sent to the ticket owner DMs.';
                } catch (dmError) {
                    console.error(`Failed to DM ticket owner (${summary.ownerId}):`, dmError);
                }
            } else {
                dmStatus = 'Could not find ticket owner ID to send DM.';
            }

            if (summary.isTrade) {
                if (summary.sellerId) {
                    try {
                        const seller = await interaction.client.users.fetch(summary.sellerId);
                        await sendCompletionMessage(seller, {
                            ...completionPayloadOptions,
                            transcriptFileName: fileName,
                            transcriptFileBuffer: fileBuffer
                        });
                        dmStatus += '\nTranscript also sent to the seller DMs.';
                    } catch (error) {
                        console.error('Failed to DM seller:', error);
                    }
                }

                const tradeLogChannel = interaction.guild.channels.cache.get(config.system.tradeLogChannelId);
                if (tradeLogChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('Trade Transaction Log')
                        .setColor(0x9B59B6)
                        .addFields(buildCompletionFields(summary, ownerMention, interaction.user.tag))
                        .setTimestamp();

                    try {
                        await sendWithDiscordRestToken(
                            tradeLogChannel,
                            {
                                embeds: [logEmbed],
                                files: [buildTranscriptAttachment(fileName, fileBuffer)]
                            },
                            '/done trade log message'
                        );
                    } catch (logError) {
                        console.error('Trade log send failed:', logError);
                    }
                }
            }

            let replyContent = `**Transaction marked complete!**\n\n${channelMessageStatus}\n${dmStatus}\n`;

            if (!summary.isTrade) {
                const counterResult = await incrementCounterChannel(
                    interaction.guild,
                    config.system.ordersCompletedChannelId
                ).catch(error => {
                    console.error('Order counter update failed:', error);
                    return { updated: false, reason: 'rename_failed' };
                });
                if (counterResult.updated) {
                    replyContent += `Orders completed counter is now **${counterResult.nextValue}**.\n`;
                }
            }

            removeTicketByChannel(configManager, interaction.channel.id);
            replyContent += `\nDeleting this ticket and all linked channels in ${DONE_DELETE_DELAY_MS / 1000} seconds...`;
            await interaction.editReply({ content: replyContent });

            setTimeout(async () => {
                try {
                    await deleteConnectedChannels(interaction.channel, configManager);
                    await interaction.channel.delete('Ticket completed with /done');
                } catch (error) {
                    console.error('Done command cleanup failed:', error);
                }
            }, DONE_DELETE_DELAY_MS);
        } catch (error) {
            console.error('Done command failed:', error);
            await interaction.editReply({
                content: 'Failed to finish this ticket.'
            });
        }
    }
};
