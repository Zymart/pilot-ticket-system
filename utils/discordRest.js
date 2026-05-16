const config = require('../config');

function isMissingDiscordRestTokenError(error) {
    return /Expected token to be set for this request/i.test(error?.message || '');
}

function ensureDiscordRestToken(client, context = 'Discord REST request') {
    if (!client?.rest || typeof client.rest.setToken !== 'function') {
        console.error(`${context} failed: Discord client REST manager is unavailable.`);
        return false;
    }

    if (!config.token) {
        console.error(`${context} failed: DISCORD_TOKEN is missing.`);
        return false;
    }

    if (client.token !== config.token) {
        client.token = config.token;
    }

    client.rest.setToken(config.token);
    return true;
}

async function sendWithDiscordRestToken(target, payload, context = 'Discord message send') {
    ensureDiscordRestToken(target?.client, context);

    try {
        return await target.send(payload);
    } catch (error) {
        if (isMissingDiscordRestTokenError(error) && ensureDiscordRestToken(target?.client, `${context} retry`)) {
            return await target.send(payload);
        }

        throw error;
    }
}

module.exports = {
    ensureDiscordRestToken,
    isMissingDiscordRestTokenError,
    sendWithDiscordRestToken
};
