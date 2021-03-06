import { CommandInteraction, SlashCommandBuilder, SlashCommandStringOption } from 'discord.js';
import type { SlashCommand } from './SlashCommand.js';
import { CoTAPIId, GuildIds } from '../consts.js';
import getDataSource from '../data-source.js';
import { SbUser, FFXIVChar } from '../entities/index.js';
import XIVApi from '@xivapi/js';
import dayjs from 'dayjs';
import logger from '../logger.js';

const getNumberOFDays = ({ firstSeenApi }: { firstSeenApi: string | Date }): number => {
  const firstSeen = dayjs(firstSeenApi);
  const firstPull = dayjs(new Date(2019, 9, 11, 23, 59, 59));
  const beginningOfTime = dayjs(new Date(2019, 8, 2, 23, 59, 59));

  if (firstSeen.isBefore(beginningOfTime)) {
    return dayjs().diff(beginningOfTime, 'd');
  } else if (firstSeen.isAfter(beginningOfTime) && firstSeen.isBefore(firstPull)) {
    return dayjs().diff(beginningOfTime, 'd');
  } else {
    return dayjs().diff(firstSeen, 'd');
  }
};

const commandRegistrationData = new SlashCommandBuilder()
  .setName('days')
  .setDescription("Returns the approximate number of days you've been in the FC")
  .addStringOption((option: SlashCommandStringOption) =>
    option.setName('character_name').setDescription('Full FFXIV Character Name').setRequired(false),
  )
  .toJSON();

const DaysCommand: SlashCommand = {
  command: 'days',
  commandRegistrationData,

  async exec(interaction: CommandInteraction): Promise<void> {
    const { XIV_API_TOKEN = '' } = process.env;
    if (
      !interaction.inGuild() ||
      (interaction.guildId !== GuildIds.COT_GUILD_ID && interaction.guildId !== GuildIds.SASNERS_TEST_SERVER_GUILD_ID)
    ) {
      return;
    }
    const dataSource = await getDataSource();
    const sbUserRepo = dataSource.getRepository(SbUser);
    const characterRepo = dataSource.getRepository(FFXIVChar);

    const discordId = interaction.member.user.id;
    const charName = interaction.options.get('character_name', false)?.value?.toString();
    logger.debug('charNameArgument', charName);
    let sbUser = await sbUserRepo.findOne({ where: { discordUserId: discordId } });
    if (!sbUser) {
      sbUser = new SbUser();
      sbUser.discordUserId = discordId;
      await sbUserRepo.save(sbUser);
    }
    if (!charName) {
      // try using claimed character
      const char = await characterRepo.findOne({ where: { user: { discordUserId: sbUser.discordUserId } } });
      if (!char) {
        await interaction.reply({
          content:
            "Sorry It doesnt look like you've claimed a character, you can use the claim command to do that, or provide a character name",
        });
        return;
      }
      if (!char.firstSeenApi) {
        await interaction.reply({
          content: `Sorry I have no record of ${char.name} in the FC`,
        });
        return;
      }
      const numDays = getNumberOFDays(char);
      await interaction.reply({
        content: `${char.name} has been in the FC for approximately ${numDays} days`,
      });
      return;
    }
    const xivClient = new XIVApi({ private_key: XIV_API_TOKEN, language: 'en' });
    let matchingMember: XivApiCharacterSearchResult | undefined;
    let char = await characterRepo
      .createQueryBuilder()
      .where('LOWER(name) = LOWER(:name)', { name: charName.trim().toLowerCase() })
      .getOne();

    logger.debug('foundChar', char);
    if (char && char.firstSeenApi) {
      const numDays = getNumberOFDays(char);
      await interaction.reply({
        content: `${char.name} has been in the FC for approximately ${numDays} days`,
      });
      return;
    }

    if (char && char.apiId) {
      const { FreeCompany = null, Character = null } = xivClient.character.get(char.apiId.toString(), { data: 'FC' });
      if (FreeCompany && FreeCompany.Name.trim().toLowerCase() === 'Crowne of Thorne' && Character) {
        matchingMember = Character;
      }
    }
    if (!char || !char.apiId) {
      const { FreeCompanyMembers = [] } = xivClient.freecompany.get(CoTAPIId, { data: 'FCM' });
      logger.debug('searchResults', FreeCompanyMembers);
      matchingMember = FreeCompanyMembers.find(
        (member) => member.Name.trim().toLowerCase() === charName.trim().toLowerCase(),
      );
    }

    logger.debug('matchingMember', matchingMember);
    if (!matchingMember) {
      await interaction.reply({
        content: `Sorry I can't find a record of ${charName.trim()} in the FC through the lodestone.`,
      });
      return;
    }

    char = characterRepo.create();
    char.firstSeenApi = new Date();
    char.apiId = +matchingMember.ID;
    char.name = matchingMember.Name.trim();
    char = await characterRepo.save(char, { reload: true });
    logger.debug('savedChar', char);
    await interaction.reply({
      content: `${char.name} has been in the FC for approximately less than 1 day`,
    });
    return;
  },
};

export default DaysCommand;
