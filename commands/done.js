const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');
const {
    buildTranscriptAttachment,
    createTranscript,
    deleteConnectedChannels,
    isTicketChannel,
    removeTicketByChannel,
    resolveTicketSummary,
    sendTranscriptToLog
} = require('../utils/ticketHelpers');

const FACEBOOK_VOUCH_URL = 'https://www.facebook.com/share/v/1HC628gfWL/';
const VOUCH_CHANNEL_ID = '1381279964300841062';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('done')
        .setDescription('Complete this ticket, send the transcript, and close everything after 5 seconds')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, { configManager }) {
        if (!isTicketChannel(interaction.channel)) {
            return await interaction.editReply({
                content: '❌ This command can only be used in ticket channels.'
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
                .setTitle('✅ Transaction Complete')
                .setDescription(
                    [
                        '🎉 Your order is finished.',
                        '',
                        '💖 Please Vouch us In Our Facebook Post:',
                        FACEBOOK_VOUCH_URL,
                        '',
                        `🗣️ Or Vouch us in ${vouchDestination}`,
                        '',
                        '🕒 This ticket and its connected channel will close in 5 seconds.'
                    ].join('\n')
                )
                .addFields(
                    { name: '👤 Ticket Owner', value: ownerMention, inline: true },
                    { name: '🎮 Roblox Username', value: summary.robloxUsername, inline: true },
                    { name: '🛒 Buying', value: summary.buying, inline: true },
                    { name: '🎯 Game', value: summary.game, inline: true },
                    { name: '🧑‍💼 Completed By', value: interaction.user.tag, inline: true },
                    { name: '🧾 Transcript', value: 'Attached below and copied to the log channel if one is configured.', inline: false }
                )
                .setColor(0x57F287)
                .setTimestamp();

            await interaction.channel.send({
                embeds: [completionEmbed],
                files: [buildTranscriptAttachment(fileName, fileBuffer)]
            });

            const logResult = await sendTranscriptToLog(
                interaction.guild,
                configManager,
                fileName,
                fileBuffer,
                `✅ Transaction completed in ${interaction.channel} by ${interaction.user.tag}`
            );

            removeTicketByChannel(configManager, interaction.channel.id);

            await interaction.editReply({
                content: logResult.sent
                    ? '✅ Transaction marked complete. Transcript sent to the ticket and log channel. Deleting this ticket in 5 seconds.'
                    : '✅ Transaction marked complete. Transcript sent here. Log channel is not configured, so it was not copied anywhere else. Deleting this ticket in 5 seconds.'
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
                content: '❌ Failed to finish this ticket.'
            });
        }
    }
};
