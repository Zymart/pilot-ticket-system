const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('extend')
        .setDescription('Extend the pilot timer for this channel (Admin only)')
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Additional time to add (e.g., 1 day, 5 hours)')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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
        const durationStr = interaction.options.getString('duration');
        const msToAdd = this.parseDuration(durationStr);

        if (!msToAdd) {
            return await interaction.editReply({
                content: '❌ Invalid duration format. Use e.g., "1 day", "5 hours", or "30 mins".'
            });
        }

        const state = configManager.getPilotState?.() || { timers: {} };
        if (!state.timers) state.timers = {};

        const timer = state.timers[interaction.channel.id];
        if (!timer) {
            // Create a new timer if none exists
            state.timers[interaction.channel.id] = {
                expiresAt: Date.now() + msToAdd,
                creatorId: interaction.user.id,
                notified: false
            };
        } else {
            // Extend existing (reset notified status if it was expired)
            timer.expiresAt = Math.max(timer.expiresAt, Date.now()) + msToAdd;
            timer.notified = false;
        }

        configManager.setPilotState?.(state);

        const newExpiry = Math.floor(state.timers[interaction.channel.id].expiresAt / 1000);
        await interaction.editReply({
            content: `✅ Pilot timer extended by **${durationStr}**.\nNew deadline: <t:${newExpiry}:F> (<t:${newExpiry}:R>)`
        });
    }
};