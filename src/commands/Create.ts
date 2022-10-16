import { Command, CommandError } from "@jiman24/slash-commandment";
import { CommandInteraction } from "discord.js";
import { Player } from "../structure/Player";

export default class extends Command {
  name = "create";
  description = "Initialize character";

  constructor() {
    super();

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

  async exec(i: CommandInteraction) {
    await i.deferReply({ ephemeral: true });
    const userID = i.user.id;

    try {
      await Player.load(userID);
      throw new CommandError("You've already created a character");
    } catch {}

    const description = i.options.get("description", true).value as string;
    const imageUrl = i.options.get("image_url", true).attachment?.url as string;
    const player = new Player(userID);

    player.description = description;
    player.imageUrl = imageUrl;

    await player.save();

    i.editReply("Successfully created character");
  }
}
