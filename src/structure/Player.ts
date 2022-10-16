import { CommandError } from "@jiman24/slash-commandment";
import { client } from "..";


export class Player {
  id: string;
  mention: string;
  isBot = false;
  coin = 0;
  xp = 0;

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

  async save() {
    const playerData: any = {
      ...this,
    };

    await client.players.set(this.id, playerData);
  }
}
