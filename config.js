require('dotenv').config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    port: process.env.PORT || 3000,
    system: {
        ticketCategoryId: '1381276042475339776',
        pilotChannelId: '1381795248547827762',
        supportRoleIds: ['1381256734403854436', '1381610337882607666', '1381256815370834002', '1381255162672185424'],
        postChannelId: '1498927368587182180',
        guideChannelId: '1498927587773382666',
        animeNewsChannelId: '1499678431695077507',
        tradeCategoryId: '1381279668329775276',
        vouchChannelId: '1381279964300841062',
        ordersCompletedChannelId: '1498621701670568046',
        tradeLogChannelId: '1381279878313148546',
        facebookVouchUrl: 'https://www.facebook.com/share/v/1HC628gfWL/'
    }
};
