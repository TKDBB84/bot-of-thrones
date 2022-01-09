import type { CommandInteraction } from 'discord.js';
import { SlashCommandBuilder } from '@discordjs/builders';
import type { GlobalSlashCommand } from '../SlashCommand.js';

const command = 'ping';
const commandRegistrationData = new SlashCommandBuilder()
  .setName(command)
  .setDescription('Replies with "pong" if bot is active')
  .toJSON();

const PingCommand: GlobalSlashCommand = {
  command,
  commandRegistrationData,

  async exec(interaction: CommandInteraction): Promise<void> {
    await interaction.reply({ content: 'Pong!', ephemeral: true });
  },
};

export default PingCommand;
