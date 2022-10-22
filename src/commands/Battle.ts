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
    const playerB = await Player.load(user.id);

    const game = new Game(i, playerA, playerB);

    await game.run();
  }
}
