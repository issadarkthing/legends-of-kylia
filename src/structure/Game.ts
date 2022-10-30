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
    this.message = `${player.name} is unresponsive`;
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
    this.message = `${player.name} won the battle!`;
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

  private async runRollAnimation(player: Player, message: string) {
    if (player.isBot) {
      const roll = this.roll();
      await this.updateGameText(`${player.name} rolled ${roll}`);

      return roll;
    }

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setDescription(message)

    const button = new ButtonHandler(this.i, 
      [ 
        this.playerShow(this.teamA), 
        this.playerShow(this.teamB),
        embed,
      ]
    );

    let roll!: number;

    button.addButton("Roll", () => { roll = this.roll() });

    await button.run();

    await this.updateGameText(`Rolling...`);

    const ROLLING_INTERVAL = 500;
    await sleep(ROLLING_INTERVAL);

    if (!roll) {
      throw new UnresponsiveError(player);
    }

    await this.updateGameText(`${player.name} rolled ${roll}!`);

    return roll;
  }

  private playerShow(team: Team) {
    const embed = team.player.show();
    embed.addFields([
      { name: "\u200b", value: progressBar(team.player.hp, team.initialHP) }
    ])

    return embed;
  }

  private async getAttackType(player: Player) {

    if (player.isBot) {
      return random.pick(["Melee", "Ranged"] as Attack[]);
    }

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setThumbnail(player.imageUrl)
      .setDescription(`${player.name}, please select an attack type`);

    const button = new ButtonHandler(this.i, embed, player.id);

    let attack!: Attack;

    button.addButton("Melee", () => { attack = "Melee" });
    button.addButton("Ranged", () => { attack = "Ranged" });

    await button.run();

    if (!attack) {
      throw new UnresponsiveError(player);
    }

    return attack;
  }

  private createRollText(team: Team, roll: number, modifier?: number) {
    const totalRoll = roll + (modifier || 0);
    if (!modifier) return `${team.player.name} rolled **${roll}**\n`;
    return `${team.player.name} rolled ${roll} + ${modifier} = **${totalRoll}**\n`;
  }

  private async runPreGame(): Promise<[Team, Team]> {
    const rollA = await this.runRollAnimation(this.teamA.player, "Determining order");
    const rollB = await this.runRollAnimation(this.teamB.player, "Determining order");
    
    let text = "**__Pre-game__**\n";
    text += `${this.teamA.player.name} rolled ${rollA}!\n`;
    text += `${this.teamB.player.name} rolled ${rollB}!\n`;

    if (rollA === rollB) {
      text += `Result is a tie, rerolling...\n`;
      await this.updateGameText(text);

      return this.runPreGame();
    }

    let order!: [Team, Team];

    if (rollA > rollB) {
      text += `${this.teamA.player.name} rolled higher and makes the first move\n`;
      order = [this.teamA, this.teamB];
    } else if (rollB > rollA) {
      text += `${this.teamB.player.name} rolled higher and makes the first move\n`;
      order = [this.teamB, this.teamA];
    }

    await this.updateGameText(text);

    return order;
  }

  private async runReadyPhase(attackType: Attack, teamA: Team, teamB: Team) {
    let text = "**__Ready Phase__**\n";

    const nameA = teamA.player.name;
    const rollA = await this.runRollAnimation(teamA.player, 
      `${teamA.player.name} is rolling for speed`
    );
    const modifierA = teamA.player.speed;
    const totalRollA = rollA + modifierA;
    text += this.createRollText(teamA, rollA, modifierA);

    const nameB = teamB.player.name;
    const rollB = await this.runRollAnimation(teamB.player, 
      `${teamB.player.name} is rolling for speed`
    );
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
        throw new EndRoundError(text);
      }
    } else if (attackType === "Ranged") {
      if (totalRollA <= 10) {
        text += `${nameA} rolled lower than 10 thus neutral is reset\n`;
        throw new EndRoundError(text);
      }
    }

    await this.updateGameText(text);
  }

  private async runAttackPhase(attackType: Attack, teamA: Team, teamB: Team) {
    let text = "**__Attack Phase__**\n";

    const nameA = teamA.player.name;
    let rollA = await this.runRollAnimation(teamA.player, `${nameA} Rolling for attack`);

    const nameB = teamB.player.name;
    const rollB = await this.runRollAnimation(teamB.player, `${nameB} Rolling for defense`);
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
        rollA = await this.runRollAnimation(teamA.player, `${nameA} is able to re-roll in attempt to get higher roll`)
        totalRollA = rollA + teamA.player.melee;
        text += `${nameB} rolled higher thus ${nameA} re-rolled and got ${totalRollA}\n`
      }

      if (rollA === 20) {
        teamA.attackCount += 1;   
        text += `${nameA} got nat 20 and receives 2 attacks in damage phase\n`;
      }

      // initiate counter
      if (totalRollA < totalRollB) {
        const counterResult = await this.runRollAnimation(teamB.player, `${nameB} is attempting to counter`);

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
        rollA = await this.runRollAnimation(teamA.player, `${nameA} is able to re-roll in attempt to get higher roll`)
        totalRollA = rollA + teamA.player.melee;
        text += `${nameB} rolled higher thus ${nameA} re-rolled and got ${totalRollA}\n`
      }

      if (totalRollB > totalRollA) {
        text += `${nameB} rolled higher than ${nameA} thus neutral is reset\n`;
        throw new EndRoundError(text);
      }
    }
    
    await this.updateGameText(text);
  }

  private async runDamagePhase(attackType: Attack, teamA: Team, teamB: Team) {
    let text = "**__Damage Phase__**\n";
    let damage = 0;
    let attackDamage = 0;

    const nameA = teamA.player.name;
    const nameB = teamB.player.name;

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
    await this.updateGameText(text);

    if (teamB.player.hp <= 0) {
      throw new EndGameError(teamA.player);
    }
  }

  private async updateGameText(message: string) {
    const gameText = new EmbedBuilder()
      .setColor("Random")
      .setDescription(message);

    const embeds = [
      this.playerShow(this.teamA),
      this.playerShow(this.teamB),
      gameText,
    ];

    await this.i.editReply({ embeds });
    await sleep(this.interval);
  }

  private async startRound(teamA: Team, teamB: Team) {
    // declaration phase
    const attackType = await this.getAttackType(teamA.player);

    // ready phase
    await this.runReadyPhase(attackType, teamA, teamB);

    // attack phase
    await this.runAttackPhase(attackType, teamA, teamB);

    // damage phase
    await this.runDamagePhase(attackType, teamA, teamB);
  }

  async run() {

    const teams = await this.runPreGame();

    while (true) {

      try {

        await this.startRound(...(teams as [Team, Team]));

      } catch (e) {
        const err = e as Error;

        if (err instanceof UnresponsiveError) {
          throw new CommandError(err.message);
        } else if (err instanceof EndRoundError) {
          await this.updateGameText(err.message);
          continue;
        } else if (err instanceof EndGameError) {
          await this.updateGameText(err.message);
          break;
        }
      } finally {
        teams.reverse();
      }
    }
  }
}
