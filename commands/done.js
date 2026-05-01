const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const {
    buildTranscriptAttachment,
    createTranscript,
    deleteConnectedChannels,
    incrementCounterChannel,
    isTicketChannel,
    removeTicketByChannel,
    resolveTicketSummary
} = require('../utils/ticketHelpers');

const FACEBOOK_VOUCH_URL = 'https://www.facebook.com/share/v/1HC628gfWL/';
const VOUCH_CHANNEL_ID = '1381279964300841062';
const ORDERS_COMPLETED_CHANNEL_ID = '1498621701670568046';
const TRADE_LOG_CHANNEL_ID = '1381279878313148546';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('done')
        .setDescription('Complete this ticket, send the transcript, and close everything after 5 seconds')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, { configManager }) {
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
            const vouchChannel = interaction.guild.channels.cache.get(VOUCH_CHANNEL_ID);
            const vouchDestination = vouchChannel ? `${vouchChannel}` : `Channel ID: ${VOUCH_CHANNEL_ID}`;

            const completionEmbed = new EmbedBuilder()
                .setTitle('Transaction Complete')
                .setTimestamp();

            if (summary.isTrade) {
                completionEmbed.setDescription(
                    [
                        'Thank you for using our trading service!',
                        '',
                        `Please Vouch us in ${vouchDestination}`,
                        '',
                        'This ticket and its connected channel will close in 5 seconds.'
                    ].join('\n')
                )
                .addFields(
                    { name: 'Buyer', value: ownerMention, inline: true },
                    { name: 'Seller', value: summary.sellerId ? `<@${summary.sellerId}>` : 'Unknown', inline: true },
                    { name: 'Product', value: summary.buying, inline: false },
                    { name: 'Completed By', value: interaction.user.tag, inline: true }
                )
                .setColor(0x9B59B6); // Purple for trade
            } else {
                completionEmbed.setDescription(
                    [
                        'Please Vouch us In Our Facebook Post:',
                        FACEBOOK_VOUCH_URL,
                        '',
                        `Or Vouch us in ${vouchDestination}`,
                        '',
                        'This ticket and its connected channel will close in 5 seconds.'
                    ].join('\n')
                )
                .addFields(
                    { name: 'Ticket Owner', value: ownerMention, inline: true },
                    { name: 'Roblox Username', value: summary.robloxUsername, inline: true },
                    { name: 'Buying', value: summary.buying, inline: true },
                    { name: 'Game', value: summary.game, inline: true },
                    { name: 'Completed By', value: interaction.user.tag, inline: true }
                )
                .setColor(0x57F287); // Green for pilot
            }

            completionEmbed.addFields({ name: 'Transcript', value: 'Attached below.', inline: false });

            let dmStatus = '❌ Transcript could not be sent via DM (DMs might be closed).';
            if (summary.ownerId) {
                try {
                    const owner = await interaction.client.users.fetch(summary.ownerId);
                    await owner.send({
                        embeds: [completionEmbed],
                        files: [buildTranscriptAttachment(fileName, fileBuffer)]
                    });
                    dmStatus = '📬 Transcript and completion message sent to the ticket owner\'s DMs.';
                } catch (dmError) {
                    console.error(`Failed to DM ticket owner (${summary.ownerId}):`, dmError);
                }
            } else {
                dmStatus = '⚠️ Could not find ticket owner ID to send DM.';
            }

            // If it's a trade, DM the seller too and log to the trade channel
            if (summary.isTrade) {
                if (summary.sellerId) {
                    try {
                        const seller = await interaction.client.users.fetch(summary.sellerId);
                        await seller.send({
                            embeds: [completionEmbed],
                            files: [buildTranscriptAttachment(fileName, fileBuffer)]
                        });
                        dmStatus += '\n📬 Transcript also sent to the seller\'s DMs.';
                    } catch (e) {
                        console.error('Failed to DM seller:', e);
                    }
                }

                const tradeLogChannel = interaction.guild.channels.cache.get(TRADE_LOG_CHANNEL_ID);
                if (tradeLogChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle('📝 Trade Transaction Log')
                        .setColor(0x9B59B6)
                        .addFields(
                            { name: 'Buyer', value: ownerMention, inline: true },
                            { name: 'Seller', value: summary.sellerId ? `<@${summary.sellerId}>` : 'Unknown', inline: true },
                            { name: 'Product', value: summary.buying, inline: false },
                            { name: 'Completed By', value: interaction.user.tag, inline: true }
                        )
                        .setTimestamp();
                    
                    await tradeLogChannel.send({ 
                        embeds: [logEmbed],
                        files: [buildTranscriptAttachment(fileName, fileBuffer)]
                    });
                }
            }

            let replyContent = `✅ **Transaction marked complete!**\n\n${dmStatus}\n`;

            if (!summary.isTrade) {
                const counterResult = await incrementCounterChannel(
                    interaction.guild,
                    ORDERS_COMPLETED_CHANNEL_ID
                ).catch(error => {
                    console.error('Order counter update failed:', error);
                    return { updated: false, reason: 'rename_failed' };
                });
                if (counterResult.updated) {
                    replyContent += `📈 Orders completed counter is now **${counterResult.nextValue}**.\n`;
                }
            }

            removeTicketByChannel(configManager, interaction.channel.id);
            replyContent += '\nDeleting this ticket and all linked channels in 5 seconds...';
            await interaction.editReply({ content: replyContent });

            setTimeout(async () => {
                try {
                    await deleteConnectedChannels(interaction.channel, configManager);
                    await interaction.channel.delete('Ticket completed with /done');
                } catch (error) {
                    console.error('Done command cleanup failed:', error);
                }
            }, 5000);
        } catch (error) {
            console.error('Done command failed:', error);
            await interaction.editReply({
                content: 'Failed to finish this ticket.'
            });
        }
    }
};
