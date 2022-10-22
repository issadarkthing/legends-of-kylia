import { ButtonHandler } from "@jiman24/discordjs-button";
import { progressBar, random, sleep, time } from "@jiman24/discordjs-utils";
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
}

// error thrown when the round ended
class EndRoundError extends Error {}

// error thrown when the game ended
class EndGameError extends Error {
  player: Player;

  constructor(player: Player) {
    super();
    this.player = player;
    this.message = `${player.mention} won the battle!`;
  }
}

interface Team {
  player: Player;
  initialHP: number;
  attackCount: number;
  counter: boolean;
}

export class Game {
  private interval: number = time.SECOND * 5;
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

  private playerShow(team: Team) {
    const embed = team.player.show();
    embed.addFields([
      { name: "**----**", value: progressBar(team.player.hp, team.initialHP) }
    ])

    return embed;
  }

  private async getAttackType(player: Player) {
    const button = new ButtonHandler(
      this.i, 
      `${player.mention} Please select an attack type`,
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
    return `${team.player.mention} rolled ${roll} + ${modifier} = ${totalRoll}\n`;
  }

  private runReadyPhase(attackType: Attack, teamA: Team, teamB: Team) {
    let text = "**__Ready Phase__**\n";

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
        text += `${nameA} got nat 20 and receives 2 chances in attack phase\n`;
      }

      if (totalRollB > totalRollA) {
        text += `${nameB} rolled higher than ${nameA} thus neutral is reset\n`;
        this.gameText.setDescription(text);
        throw new EndRoundError();
      }
    } else if (attackType === "Ranged") {
      if (totalRollA <= 10) {
        text += `${nameA} rolled lower than 10 thus neutral is reset\n`;
        this.gameText.setDescription(text);
        throw new EndRoundError();
      }
    }

    this.gameText.setDescription(text);
  }

  private runAttackPhase(attackType: Attack, teamA: Team, teamB: Team) {
    let text = "**__Attack Phase__**\n";

    const nameA = teamA.player.mention;
    let rollA = this.roll();

    const nameB = teamB.player.mention;
    const rollB = this.roll();
    const modifierB = teamB.player.defense;
    const totalRollB = rollB + modifierB;
    text += this.createRollText(teamB, rollB, modifierB);
    const canReroll = teamA.attackCount === 2;
    teamA.attackCount = 1;

    if (attackType === "Melee") {
      const modifierA = teamA.player.melee;
      let totalRollA = rollA + modifierA;
      text += this.createRollText(teamA, rollA, modifierA);

      if (totalRollB > totalRollA && canReroll) {
        rollA = this.roll();
        totalRollA = rollA + teamA.player.melee;
        text += `${nameB} rolled higher thus ${nameA} re-rolled and got ${totalRollA}\n`
      }

      if (rollA === 20) {
        teamA.attackCount += 1;   
        text += `${nameA} got nat 20 and receives 2 attacks in damage phase\n`;
      }

      // initiate counter
      if (totalRollA < totalRollB) {
        const counterResult = this.roll();

        if (counterResult >= 11) {
          teamB.counter = true;
          text += `${nameB} rolled higher than ${nameA} and countered successfully\n`;
        }
      }

    } else if (attackType === "Ranged") {
      const modifierA = teamA.player.melee;
      let totalRollA = rollA + modifierA;
      text += this.createRollText(teamA, rollA, modifierA);

      if (totalRollB > totalRollA && canReroll) {
        rollA = this.roll();
        totalRollA = rollA + teamA.player.ranged;
        text += `${nameB} rolled higher thus ${nameA} re-rolled and got ${totalRollA}\n`
      }

      if (totalRollB > totalRollA) {
        text += `${nameB} rolled higher than ${nameA} thus neutral is reset\n`;
        this.gameText.setDescription(text);
        throw new EndRoundError();
      }
    }
    
    this.gameText.setDescription(text);
  }

  private async runDamagePhase(attackType: Attack, teamA: Team, teamB: Team) {
    let text = "**__Damage Phase__**\n";
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
    text += `${nameA} dealt ${damage} damage to ${nameB}!\n`;
    this.gameText.setDescription(text);

    if (teamB.player.hp <= 0) {
      throw new EndGameError(teamA.player);
    }
  }

  private async updateGameText() {
    const embeds = [
      this.playerShow(this.teamA),
      this.gameText,
      this.playerShow(this.teamB),
    ];

    await this.i.editReply({ embeds });
  }

  private async startRound(teamA: Team, teamB: Team) {
    // declaration phase
    const attackType = await this.getAttackType(teamA.player);

    // ready phase
    this.runReadyPhase(attackType, teamA, teamB);
    await this.updateGameText();
    await sleep(this.interval);

    // attack phase
    this.runAttackPhase(attackType, teamA, teamB);
    await this.updateGameText();
    await sleep(this.interval);

    // damage phase
    this.runDamagePhase(attackType, teamA, teamB);
    await this.updateGameText();
    await sleep(this.interval);
  }

  async run() {
    const teams = [this.teamA, this.teamB];

    this.gameText = new EmbedBuilder()
      .setColor("Random")
      .setDescription("Preparing battle");

    while (true) {

      try {

        await this.startRound(...(teams as [Team, Team]));

      } catch (e) {
        const err = e as Error;

        if (err instanceof UnresponsiveError) {
          throw new CommandError(err.message);
        } else if (err instanceof EndRoundError) {
          await this.updateGameText();
          await sleep(this.interval)
          continue;
        } else if (err instanceof EndGameError) {
          await this.updateGameText();
          await sleep(this.interval)

          this.gameText.setDescription(err.message);
          await this.updateGameText();
          await sleep(this.interval);

          break;
        }
      } finally {
        teams.reverse();
      }
    }
  }
}
