import { ButtonHandler } from "@jiman24/discordjs-button";
import { Command, CommandError } from "@jiman24/slash-commandment";
import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Player } from "../structure/Player";

export default class extends Command {
  name = "create";
  description = "Initialize character";

  constructor() {
    super();

    this.addStringOption(option =>
      option
        .setName("name")
        .setDescription("Sets the player name")
        .setRequired(true)
    )

    this.addStringOption(option =>
      option
        .setName("description")
        .setDescription("Sets short description for your character")
        .setRequired(true)
    )

    this.addAttachmentOption(option =>
      option
        .setName("image_url")
        .setDescription("Sets image for your character")
        .setRequired(true)
    )
  }

  private async getStat(i: CommandInteraction, player: Player, statCount: number) {
    const options = ["Speed", "Melee", "Ranged", "Defense"] as const;
    const embed = new EmbedBuilder()
      .setColor("Random")
      .setDescription(`Please select stat to be spent on. Remaining stat: **${statCount}**`);
    
    const button = new ButtonHandler(i, [player.show(), embed]);

    let stat!: "speed" | "melee" | "defense" | "ranged";

    for (const option of options) {
      //@ts-ignore
      button.addButton(option, () => stat = option.toLowerCase());
    }

    await button.run();

    return stat;
  }

  async exec(i: CommandInteraction) {
    await i.deferReply({ ephemeral: true });
    const userID = i.user.id;

    try {
      await Player.load(userID);
      throw new CommandError("You've already created a character");
    } catch {}

    const name = i.options.get("name", true).value as string;
    const description = i.options.get("description", true).value as string;
    const imageUrl = i.options.get("image_url", true).attachment?.url as string;
    const player = new Player(userID);

    player.name = name;
    player.description = description;
    player.imageUrl = imageUrl;

    const statPoints = 10;

    for (let point = statPoints; point > 0; point--) {
      const stat = await this.getStat(i, player, point);

      player[stat]++;
    }

    await player.save();

    i.editReply("Successfully created character");
  }
}
