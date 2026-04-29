const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const config = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('post')
        .setDescription('Post a product for sale')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Product Name')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('Product Description')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('price')
                .setDescription('Product Price')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('currency')
                .setDescription('Choose currency (Dollars or Pesos)')
                .setRequired(true)
                .addChoices(
                    { name: 'Dollars ($)', value: 'Dollars' },
                    { name: 'Pesos (₱)', value: 'Pesos' }
                )
        )
        .addStringOption(option =>
            option.setName('image')
                .setDescription('Image URL of the product')
                .setRequired(false)
        ),

    async execute(interaction) {
        const name = interaction.options.getString('name');
        const description = interaction.options.getString('description');
        const price = interaction.options.getString('price');
        const currency = interaction.options.getString('currency');
        const image = interaction.options.getString('image');

        const targetChannelId = config.system.postChannelId;
        const targetChannel = interaction.guild.channels.cache.get(targetChannelId);

        if (!targetChannel) {
            return await interaction.editReply({ content: '❌ Target post channel not found.' });
        }

        const currencySymbol = currency === 'Dollars' ? '$' : '₱';

        const postEmbed = new EmbedBuilder()
            .setTitle(`📦 ${name}`)
            .setDescription(description)
            .addFields(
                { name: 'Price', value: `${currencySymbol}${price}`, inline: true },
                { name: 'Currency', value: currency, inline: true },
                { name: 'Seller', value: `<@${interaction.user.id}>`, inline: false }
            )
            .setColor(0x57F287)
            .setTimestamp();

        if (image && image.startsWith('http')) {
            postEmbed.setImage(image);
        }

        try {
            await targetChannel.send({ embeds: [postEmbed] });
            const reply = await interaction.editReply({ 
                content: `✅ Successfully posted your product in ${targetChannel}!` 
            });
            
            // Auto-delete the confirmation message after 5 seconds
            setTimeout(() => reply.delete().catch(() => {}), 5000);
        } catch (error) {
            console.error('Post command failed:', error);
            await interaction.editReply({ content: '❌ Failed to send the post. Check bot permissions.' });
        }
    }
};