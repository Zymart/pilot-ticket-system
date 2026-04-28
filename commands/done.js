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
                .setDescription(
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
                    { name: 'Completed By', value: interaction.user.tag, inline: true },
                    { name: 'Transcript', value: 'Attached below.', inline: false }
                )
                .setColor(0x57F287)
                .setTimestamp();

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

            const counterResult = await incrementCounterChannel(
                interaction.guild,
                ORDERS_COMPLETED_CHANNEL_ID
            ).catch(error => {
                console.error('Order counter update failed:', error);
                return { updated: false, reason: 'rename_failed' };
            });

            removeTicketByChannel(configManager, interaction.channel.id);

            await interaction.editReply({
                content: `✅ **Transaction marked complete!**\n\n${dmStatus}\n` +
                    (counterResult.updated ? `📈 Orders completed counter is now **${counterResult.nextValue}**.\n` : '') +
                    '\nDeleting this ticket and all linked channels in 5 seconds...'
            });

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
