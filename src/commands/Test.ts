import { Command } from "@jiman24/slash-commandment";
import { CommandInteraction } from "discord.js";


export default class extends Command {
  name = "test";
  description = "Test command";

  async exec(i: CommandInteraction) {
    i.reply("sample");
  }
}
