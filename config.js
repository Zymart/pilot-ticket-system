const path = require('path');
const dotenv = require('dotenv');

dotenv.config();
dotenv.config({ path: path.join(__dirname, '.env') });

function cleanEnvValue(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    return trimmed || null;
}

function cleanTokenValue(value) {
    const cleaned = cleanEnvValue(value);
    if (!cleaned) {
        return null;
    }

    return cleaned.replace(/^Bot\s+/i, '').trim() || null;
}

function hasBotTokenPrefix(value) {
    return /^Bot\s+/i.test(cleanEnvValue(value) || '');
}

function findEnv(names, validator = value => !!value) {
    for (const name of names) {
        const value = cleanEnvValue(process.env[name]);
        if (value && validator(value)) {
            return { key: name, value };
        }
    }

    return { key: null, value: null };
}

function findAllEnv(names, validator = value => !!value) {
    return names
        .map(name => ({ key: name, value: cleanEnvValue(process.env[name]) }))
        .filter(entry => entry.value && validator(entry.value));
}

function isSnowflake(value) {
    return /^\d{17,20}$/.test(value);
}

function getTokenClientId(token) {
    try {
        const tokenBody = token.replace(/^Bot\s+/i, '');
        const encodedId = tokenBody.split('.')[0];
        const normalized = encodedId.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(normalized, 'base64').toString('utf8');
        return isSnowflake(decoded) ? decoded : null;
    } catch {
        return null;
    }
}

const tokenEnvNames = [
    'DISCORD_TOKEN',
    'DISCORD_BOT_TOKEN',
    'BOT_TOKEN',
    'TOKEN',
    'CLIENT_TOKEN'
];
const clientIdEnvNames = [
    'CLIENT_ID',
    'DISCORD_CLIENT_ID',
    'APPLICATION_ID',
    'APP_ID',
    'BOT_CLIENT_ID'
];
const guildIdEnvNames = [
    'GUILD_ID',
    'DISCORD_GUILD_ID',
    'SERVER_ID',
    'DISCORD_SERVER_ID'
];
const jsonbinKeyEnvNames = [
    'JSONBIN_MASTER_KEY',
    'JSONBIN_API_KEY',
    'JSONBIN_KEY',
    'X_MASTER_KEY'
];

const clientIdEnv = findEnv(clientIdEnvNames, isSnowflake);
const tokenCandidates = tokenEnvNames
    .map(name => ({
        key: name,
        value: cleanTokenValue(process.env[name]),
        hadBotPrefix: hasBotTokenPrefix(process.env[name])
    }))
    .filter(entry => entry.value);
const matchingToken = clientIdEnv.value
    ? tokenCandidates.find(candidate => getTokenClientId(candidate.value) === clientIdEnv.value)
    : null;
const tokenEnv = matchingToken || tokenCandidates[0] || { key: null, value: null };
const tokenClientId = tokenEnv.value ? getTokenClientId(tokenEnv.value) : null;
const guildIdEnv = findEnv(guildIdEnvNames, isSnowflake);
const jsonbinKeyEnv = findEnv(jsonbinKeyEnvNames);

module.exports = {
    token: tokenEnv.value,
    tokenEnvKey: tokenEnv.key,
    tokenHadBotPrefix: !!tokenEnv.hadBotPrefix,
    tokenClientId,
    availableTokenEnvKeys: tokenCandidates.map(candidate => candidate.key),
    clientId: clientIdEnv.value || tokenClientId,
    clientIdEnvKey: clientIdEnv.value ? clientIdEnv.key : (tokenClientId ? 'decoded from token' : null),
    guildId: guildIdEnv.value,
    guildIdEnvKey: guildIdEnv.key,
    jsonbinMasterKey: jsonbinKeyEnv.value,
    jsonbinMasterKeyEnvKey: jsonbinKeyEnv.key,
    port: process.env.PORT || 3000,
    system: {
        ticketCategoryId: '1381276042475339776',
        pilotChannelId: '1381795248547827762',
        supportRoleIds: ['1381256734403854436', '1381610337882607666', '1381256815370834002', '1381255162672185424'],
        postChannelId: '1498927368587182180',
        guideChannelId: '1498927587773382666',
        animeNewsChannelId: '1499678431695077507',
        mangaNewsChannelId: '1499705817169924156',
        animeSuggestChannelId: '1499711972873207918',
        tradeCategoryId: '1381279668329775276',
        vouchChannelId: '1381279964300841062',
        ordersCompletedChannelId: '1498621701670568046',
        tradeLogChannelId: '1381279878313148546',
        facebookVouchUrl: 'https://www.facebook.com/share/v/1HC628gfWL/'
    }
};
