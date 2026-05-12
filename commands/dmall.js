const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dmall')
        .setDescription('Send a DM to everyone in the server (Admin only)')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message to send to everyone')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const messageText = interaction.options.getString('message');

        try {
            // Fetch all members of the guild
            // Requires GuildMembers intent, which is already enabled in index.js
            const members = await interaction.guild.members.fetch();
            const humanMembers = members.filter(member => !member.user.bot && member.id !== interaction.user.id); // Exclude bots and the command executor
            
            await interaction.editReply({
                content: `🚀 Starting to send DMs to **${humanMembers.size}** members. This will take roughly **${Math.ceil(humanMembers.size * 0.3)}** seconds due to rate limits...`
            });

            let successCount = 0;
            let errorCount = 0;

            for (const [id, member] of humanMembers) {
                try {
                    await member.send(messageText);
                    successCount++;
                } catch (err) {
                    // Fails if user has DMs disabled or blocked the bot
                    errorCount++;
                }
                // 300ms delay between DMs to avoid triggering Discord's spam filters
                await new Promise(resolve => setTimeout(resolve, 300));
            }

            await interaction.followUp({
                content: `✅ **DM All Process Finished!**\n- Successfully sent: **${successCount}**\n- Failed: **${errorCount}** (likely DMs disabled)`,
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('DM All command failed:', error);
            await interaction.editReply('❌ Failed to execute the DM All process. Please check console for errors.');
        }
    }
};