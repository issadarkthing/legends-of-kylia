import { CommandError } from "@jiman24/slash-commandment";
import { code } from "@jiman24/discordjs-utils";
import { EmbedBuilder } from "discord.js";
import { client } from "..";


export class Player {
  id: string;
  mention: string;
  isBot = false;
  coin = 0;
  xp = 0;
  static INITIAL_POINTS = 10;

  description = "";
  imageUrl = "";
  speed = 0;
  melee = 0;
  ranged = 0;
  defense = 0;
  hp = 50;

  constructor(id: string) {
    this.id = id;
    this.mention = `<@${this.id}>`;
  }


  private xpRequired(level: number) {
    let xp = 20;

    for (let i = 1; i < level; i++) {
      xp += xp * 2;
    }

    return xp;
  }

  get level() {
    let level = 1;

    while (this.xp > this.xpRequired(level)) {
      level++;
    }

    return level;
  }

  static async load(id: string) {
    const data = await client.players.get(id);

    if (!data) {
      throw new CommandError("Unregistered user. Please use `/start` command");
    }

    const player = new Player(id);

    Object.assign(player, data);

    return player;
  }

  show() {
    const embed = new EmbedBuilder()
      .setColor("Random")
      .setThumbnail(this.imageUrl)
      .setDescription(this.description)
      .addFields([
        { name: "Speed", value: code(this.speed), inline: true },
        { name: "Melee", value: code(this.melee), inline: true },
        { name: "Ranged", value: code(this.ranged), inline: true },
        { name: "Defense", value: code(this.defense), inline: true },
      ]);

    return embed;
  }

  async save() {
    const playerData: any = {
      ...this,
    };

    await client.players.set(this.id, playerData);
  }
}
