import { Command } from "@jiman24/slash-commandment";
import { CommandInteraction } from "discord.js";
import { Player } from "../structure/Player";


export default class extends Command {
  name = "profile";
  description = "Shows player profile";
  
  async exec(i: CommandInteraction) {
    await i.deferReply({ ephemeral: true });

    const player = await Player.load(i.user.id);
    const embed = player.show();

    i.editReply({ embeds: [embed] });
  }
}
