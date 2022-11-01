import { Player } from "./Player";


export class PlayerError extends Error {
  player: Player;

  constructor(player: Player) {
    super();
    this.player = player;
  }
}
