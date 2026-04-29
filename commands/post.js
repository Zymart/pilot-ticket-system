const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');

module.exports = {
    deferReply: false, // The initial /post command will show a modal, not defer a reply.
    data: new SlashCommandBuilder()
        .setName('post')
        .setDescription('Start the process to post a product for sale'),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('post_modal')
            .setTitle('Create Your Product Post');

        const productNameInput = new TextInputBuilder()
            .setCustomId('product_name')
            .setLabel('Product Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const productDescriptionInput = new TextInputBuilder()
            .setCustomId('product_description')
            .setLabel('Product Description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        const productPriceInput = new TextInputBuilder()
            .setCustomId('product_price')
            .setLabel('Product Price (e.g., 10.99)')
            .setPlaceholder('Enter a number, e.g., 10.99')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(20);

        const productCurrencyInput = new TextInputBuilder()
            .setCustomId('product_currency')
            .setLabel('Currency (Dollars or Pesos)')
            .setPlaceholder('Type "Dollars" or "Pesos"')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(10);

        const productImageInput = new TextInputBuilder()
            .setCustomId('product_image_url')
            .setLabel('Image URL (Optional)')
            .setPlaceholder('e.g., https://example.com/image.png')
            .setStyle(TextInputStyle.Short)
            .setRequired(false);

        modal.addComponents(
            new ActionRowBuilder().addComponents(productNameInput),
            new ActionRowBuilder().addComponents(productDescriptionInput),
            new ActionRowBuilder().addComponents(productPriceInput),
            new ActionRowBuilder().addComponents(productCurrencyInput),
            new ActionRowBuilder().addComponents(productImageInput)
        );

        await interaction.showModal(modal);
    }
};