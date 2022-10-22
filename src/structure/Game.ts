import { ButtonHandler } from "@jiman24/discordjs-button";
import { random } from "@jiman24/discordjs-utils";
import { CommandError } from "@jiman24/slash-commandment";
import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Player } from "./Player";

type Attack = "Melee" | "Ranged";

export class UnresponsiveError extends Error {
  player: Player;

  constructor(player: Player) {
    super();
    this.player = player;
    this.message = `${player.mention} is unresponsive`;
  }
};

// error thrown when the round ended
class EndRoundError extends Error {}

// error thrown when the game ended
class EndGameError extends Error {}

interface Team {
  player: Player;
  initialHP: number;
  attackCount: number;
  counter: boolean;
}

export class Game {
  private i: CommandInteraction;
  private teamA: Team;
  private teamB: Team;
  private gameText!: EmbedBuilder;

  constructor(i: CommandInteraction, a: Player, b: Player) {
    this.i = i;
    this.teamA = {
      player: a,
      initialHP: a.hp,
      attackCount: 1,
      counter: false,
    }
    this.teamB = {
      player: b,
      initialHP: b.hp,
      attackCount: 1,
      counter: false,
    }
  }

  private roll() {
    return random.integer(1, 20);
  }

  private async getAttackType(player: Player) {
    const button = new ButtonHandler(
      this.i, 
      "Please select an attack type",
      player.id,
    );

    let attack!: Attack;

    button.addButton("Melee", () => { attack = "Melee" });
    button.addButton("Ranged", () => { attack = "Ranged" });

    await button.run();

    if (!attack) {
      throw new UnresponsiveError(player);
    }

    return attack;
  }

  private createRollText(team: Team, roll: number, modifier: number) {
    const totalRoll = roll + modifier;
    return `${team.player.mention} rolled ${roll} + ${modifier} = ${totalRoll}`;
  }

  private runReadyPhase(attackType: Attack, teamA: Team, teamB: Team) {
    let text = "";

    const nameA = teamA.player.mention;
    const rollA = this.roll();
    const modifierA = teamA.player.speed;
    const totalRollA = rollA + modifierA;
    text += this.createRollText(teamA, rollA, modifierA);

    const nameB = teamB.player.mention;
    const rollB = this.roll();
    const modifierB = teamB.player.speed;
    const totalRollB = rollB + modifierB;
    text += this.createRollText(teamB, rollB, modifierB);

    if (attackType === "Melee") {
      if (rollA === 20) {
        teamA.attackCount += 1;
        text += `${nameA} got nat 20 and receives 2 chances in attack phase`;
      }

      if (totalRollB > totalRollA) {
        text += `${nameB} rolled higher than ${nameA} thus neutral is reset`;
        throw new EndRoundError();
      }
    } else if (attackType === "Ranged") {
      if (totalRollA <= 10) {
        text += `${nameA} rolled lower than 10 thus neutral is reset`;
        throw new EndRoundError();
      }
    }

    this.gameText.setDescription(text);
  }

  private runAttackPhase(attackType: Attack, teamA: Team, teamB: Team) {
    let text = "";
    let rollA = this.roll();

    const nameA = teamA.player.mention;
    const nameB = teamB.player.mention;

    const rollB = this.roll();
    const totalRollB = rollB + teamB.player.defense;
    const canReroll = teamA.attackCount === 2;
    teamA.attackCount = 1;

    if (attackType === "Melee") {
      let totalRollA = rollA + teamA.player.melee;

      if (canReroll) {
        rollA = this.roll();
        totalRollA = rollA + teamA.player.melee;
        text += `${nameA} re-rolled and got ${rollA} + ${teamA.player.melee} = ${totalRollA}`;
      }

      if (rollA === 20) {
        teamA.attackCount += 1;   
        text += `${nameA} got nat 20 and receives 2 chances in damage phase`;
      }

      // initiate counter
      if (totalRollA < totalRollB) {
        const counterResult = this.roll();

        if (counterResult >= 11) {
          teamB.counter = true;
          text += `${nameB} rolled higher than ${nameA} and countered successfully`;
        }
      }

    } else if (attackType === "Ranged") {
      let totalRollA = rollA + teamA.player.ranged;

      if (totalRollB > totalRollA && canReroll) {
        rollA = this.roll();
        totalRollA = rollA + teamA.player.ranged;
        text += `${nameB} rolled higher thus ${nameA} re-rolled and got ${totalRollA}`
      }

      if (totalRollB > totalRollA) {
        text += `${nameB} rolled higher than ${nameA} thus neutral is reset`;
        throw new EndRoundError();
      }
    }
    
    this.gameText.setDescription(text);
  }

  private async runDamagePhase(attackType: Attack, teamA: Team, teamB: Team) {
    let text = "";
    let damage = 0;
    let attackDamage = 0;

    const nameA = teamA.player.mention;
    const nameB = teamB.player.mention;

    if (attackType === "Melee") {
      attackDamage = teamA.player.melee;
    } else if (attackType === "Ranged") {
      attackDamage = teamA.player.ranged;
    }

    for (let i = 0; i < teamA.attackCount; i++) {
      damage += this.roll() + attackDamage;
    }

    if (attackType === "Ranged") {
      damage = Math.floor(damage / 2);
    }

    teamB.player.hp -= damage;
    text += `${nameA} dealt ${damage} damage to ${nameB}!`;

    this.gameText.setDescription(text);
  }

  private async updateGameText() {
    await this.i.editReply({ 
      embeds: [
        this.teamA.player.show(),
        this.gameText,
        this.teamB.player.show(),
      ] 
    });
  }

  private async startRound(teamA: Team, teamB: Team) {

    // declaration phase
    const attackType = await this.getAttackType(teamA.player);

    // ready phase
    this.runReadyPhase(attackType, teamA, teamB);
    this.updateGameText();

    // attack phase
    this.runAttackPhase(attackType, teamA, teamB);
    this.updateGameText();

    // damage phase
    this.runDamagePhase(attackType, teamA, teamB);
    this.updateGameText();
  }

  async run() {
    const teams = [this.teamA, this.teamB];

    this.gameText = new EmbedBuilder()
      .setColor("Random")
      .setDescription("Fight!");

    while (true) {

      try {

        await this.startRound(...(teams as [Team, Team]));

      } catch (e) {
        const err = e as Error;

        if (err as UnresponsiveError) {
          throw new CommandError(err.message);
        } else if (err as EndRoundError) {
          await this.updateGameText();
          continue;
        } else if (err as EndGameError) {
          break;
        }
      } finally {

        teams.reverse();
      }
    }
  }
}
