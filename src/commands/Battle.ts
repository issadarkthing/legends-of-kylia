import { ButtonHandler } from "@jiman24/discordjs-button";
import { random } from "@jiman24/discordjs-utils";
import { Command, CommandError } from "@jiman24/slash-commandment";
import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Game } from "../structure/Game";
import { Player } from "../structure/Player";

export default class extends Command {
  name = "battle";
  description = "Battle other player";

  constructor() {
    super();

    this.addUserOption(option =>
      option
        .setName("player")
        .setDescription("Player you want to challange for a battle")
        .setRequired(true)
    )
  }

  async exec(i: CommandInteraction) {
    await i.deferReply();

    const user = i.options.getUser("player", true);
    const playerA = await Player.load(i.user.id);
    const playerB = user.bot ? new Player(user.id) : await Player.load(user.id);

    playerB.isBot = user.bot;

    if (playerB.isBot) {
      const stats = ["speed", "melee", "ranged", "defense"] as const;

      for (let i = 0; i < Player.INITIAL_POINTS; i++) {
        const stat = random.pick(stats);

        playerB[stat]++;
      }

      playerB.description = "Bot";
      playerB.imageUrl = user.displayAvatarURL();
    }

    const prompt = new EmbedBuilder()
      .setColor("Random")
      .setDescription(`${playerA.mention} invited ${playerB.mention} to a battle. Do you accept?`);
    const confirmation = new ButtonHandler(i, [playerA.show(), prompt], user.id);

    let inviteAccepted = false;

    confirmation.addButton("Accept", () => { inviteAccepted = true });
    confirmation.addButton("Reject", () => { inviteAccepted = false });

    if (!playerB.isBot) {
      await confirmation.run();
    }

    if (!inviteAccepted) {
      throw new CommandError(`${playerB.mention} rejected the battle invitation`);
    }

    const game = new Game(i, playerA, playerB);

    await game.run();
  }
}
