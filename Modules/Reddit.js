const snoowrap = require('snoowrap');
const Bot = require('./Bot');
const Debug = require('./Debug');
const { userMention } = require('discord.js');

module.exports = class Reddit {
	/**@type {snoowrap}*/
	static r = null;
	static async setup() {
		this.r = new snoowrap({
			userAgent: 'Desktop:discreddit_bot:1.0.0 (by u/symmetricalboy)',
			clientId: process.env.REDDIT_CLIENT_ID,
			clientSecret: process.env.REDDIT_CLIENT_SECRET,
			refreshToken: process.env.REDDIT_REFRESH_TOKEN,
		});
	}
	static async startVerification(username, interaction) {
		if (this.isAlreadyVerifying(username, interaction.guildId)) {
			await interaction.reply({ content: `There is already a pending verification request for **u/${username}**.`, ephemeral: false });
			return;
		}
		try {
			const memberName = await interaction.user.tag;
			const discordId = await interaction.user.id;
			const channelId = interaction.channelId;
			await this.r.composeMessage({
				subject: 'Pending Discord Verification',
				to: username,
				text: `Hello. I am a bot. A request was made from the Discord username **${memberName}** to verify their ownership of this Reddit account. If this request was made by you, please reply to this message with the word **verify** to complete the process. If this request was not made by you, please reply to this message with the word **cancel** to deny and remove the request from this bot. This is an automated message and this inbox is not monitored. If you have any questions or concerns, please contact u/symmetricalboy on Reddit or Gori#0001 on Discord.`,
			});
			await this.setOngoingVerification(username, discordId, channelId, interaction.guildId);
			await interaction.reply({ content: `A private message from **u/discreddit_bot** has been sent to **u/${username}**. Please check your Reddit inbox to complete verification.`, ephemeral: false });
		}
		catch (err) {
			await Debug.log(err);
			await interaction.reply({ content: 'Sorry. Something went wrong. Do you have private messages on Reddit disabled?', ephemeral: false });
		}
	}

	static async verificationLoop() {
		const inbox = await this.r.getInbox();
		for (const message of inbox) {
			for (const guild of Bot.client.guilds.cache) {
				if (this.isAlreadyVerifying(message.author.name, guild[0])) {
					const response = message.body.toLowerCase();
					if (response.indexOf('verify') != -1) {
						await this.handleVerify(message.author.name, guild[0]);
						await message.deleteFromInbox();
					}
					else if (response.indexOf('cancel') != -1) {
						await this.handleCancel(message.author.name, guild[0]);
						await message.deleteFromInbox();
					}
				}
			}

		}
	}

	static async handleCancel(username, guildId) {
		try {
			const ongoingVerifications = Bot.getGuildValue(guildId, 'ongoingVerifications') || {};
			try {
				const channelId = ongoingVerifications[username].channelId;
				if (channelId) {
					const channel = await (await Bot.client.guilds.fetch(guildId)).channels.fetch(channelId);
					await channel?.send({ content: `${userMention(ongoingVerifications[username].userId)}, your requested verification has been denied or canceled. Please try again.` });
				}
			}
			catch (err) { }
			await this.removeVerification(username, guildId);
		}
		catch (err) {
			await Debug.log(err);
		}

	}
	static async handleVerify(username, guildId) {
		try {
			const ongoingVerifications = Bot.getGuildValue(guildId, 'ongoingVerifications') || {};
			const guild = await Bot.client.guilds.fetch(guildId);
			const member = await guild.members.fetch(ongoingVerifications[username].userId);
			try {
				await member.setNickname('u/' + username);
			}
			catch (err) {
				if (err.code != 50013) {
					await Debug.log(err);
				}
			}
			if (process.env.VERIFIED_ROLE) {
				const role = (await guild.roles.fetch()).find((r) => { return r.name == process.env.VERIFIED_ROLE; });
				if (role) {
					await guild.members.addRole({ user: member, role: role });
				}
			}
			if (process.env.UNVERIFIED_ROLE) {
				const role = (await guild.roles.fetch()).find((r) => { return r.name == process.env.UNVERIFIED_ROLE; });
				if (role) {
					await guild.members.removeRole({ user: member, role: role });
				}
			}
			try {
				const channelId = ongoingVerifications[username].channelId;
				if (channelId) {
					const channel = await (await Bot.client.guilds.fetch(guildId)).channels.fetch(channelId);
					await channel?.send({ content: `${userMention(ongoingVerifications[username].userId)}, your Reddit username has been successfully verified and connected to your Discord username. Thank you!` });
				}
			}
			catch (err) { }
			await this.removeVerification(username, guildId);

		}
		catch (err) {
			await Debug.log(err);
		}
	}
	static async setOngoingVerification(username, userId, channelId, guildId) {
		const ongoingVerifications = Bot.getGuildValue(guildId, 'ongoingVerifications') || {};
		ongoingVerifications[username] = { userId, channelId };
		await Bot.setGuildValue(guildId, 'ongoingVerifications', ongoingVerifications);
	}
	static async removeVerification(username, guildId) {
		const ongoingVerifications = Bot.getGuildValue(guildId, 'ongoingVerifications') || {};
		ongoingVerifications[username] = undefined;
		delete ongoingVerifications[username];
		await Bot.setGuildValue(guildId, 'ongoingVerifications', ongoingVerifications);
	}
	static isAlreadyVerifying(username, guildId) {
		const ongoingVerifications = Bot.getGuildValue(guildId, 'ongoingVerifications') || {};
		return ongoingVerifications[username] !== undefined;
	}
};
