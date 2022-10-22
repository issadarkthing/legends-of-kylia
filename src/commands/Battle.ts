import { random } from "@jiman24/discordjs-utils";
import { Command } from "@jiman24/slash-commandment";
import { CommandInteraction } from "discord.js";
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

    const game = new Game(i, playerA, playerB);

    await game.run();
  }
}
