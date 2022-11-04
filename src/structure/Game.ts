import { ButtonHandler } from "@jiman24/discordjs-button";
import { progressBar, random, sleep, time } from "@jiman24/discordjs-utils";
import { CommandError } from "@jiman24/slash-commandment";
import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Player } from "./Player";
import { PlayerError } from "./Error";
    
const ROLLING_INTERVAL = time.SECOND / 2;
const ROUND_INTERVAL = time.SECOND / 8;

type Attack = "Melee" | "Ranged";

// error thrown when player ins unresponsive
export class UnresponsiveError extends PlayerError {
  constructor(player: Player) {
    super(player);
    this.message = `${player.name} is unresponsive`;
  }
}

// error thrown when the round ended
class EndRoundError extends Error {}

// error thrown when the game ended
class EndGameError extends PlayerError {
  constructor(player: Player) {
    super(player);
    this.message = `${player.name} won the battle!`;
  }
}

// error thrown when counter is initiated
class CounterInitiatedError extends PlayerError {}

// error thrown when consecutive attack happens
class ConsecutiveError extends PlayerError {}

interface Team {
  player: Player;
  initialHP: number;
  attackCount: number;
  consecutive: 0,
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
      consecutive: 0,
    }
    this.teamB = {
      player: b,
      initialHP: b.hp,
      attackCount: 1,
      consecutive: 0,
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
      .setThumbnail(player.imageUrl)
      .setTitle(player.name)

    const button = new ButtonHandler(
      this.i, 
      [ 
        this.playerShow(this.teamA), 
        this.playerShow(this.teamB),
        embed,
      ],
      player.id,
    );

    let roll!: number;

    button.addButton("Roll", () => { roll = this.roll() });

    await button.run();

    await this.updateGameText(`${player.name} is rolling a dice`);

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
    const rollText = "Roll the dice to determine order";
    const rollA = await this.runRollAnimation(this.teamA.player, rollText);
    const rollB = await this.runRollAnimation(this.teamB.player, rollText);
    
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


    if (attackType === "Melee") {
      const nameB = teamB.player.name;
      const rollB = await this.runRollAnimation(teamB.player, 
        `${teamB.player.name} is rolling for speed`
      );
      const modifierB = teamB.player.speed;
      const totalRollB = rollB + modifierB;
      text += this.createRollText(teamB, rollB, modifierB);

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

  private async runAttackPhase(
    attackType: Attack, 
    teamA: Team, 
    teamB: Team,
    counter = false,
  ) {
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
      if (totalRollA < totalRollB && teamB.consecutive < 3) {
        const counterResult = await this.runRollAnimation(teamB.player, `${nameB} is attempting to counter`);

        if (counterResult >= 11) {
          text += `(${rollB} + ${teamB.player.speed}) > 10 Is a success and move to damage`;
          await this.updateGameText(text);
          throw new CounterInitiatedError(teamB.player);
        } else {
          text += `(${rollB} + ${teamB.player.speed}) < 11 The counter has failed`;
          throw new EndRoundError(text);
        }
      } else {
        text += this.createRollText(teamA, rollA, modifierA);
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

  private async runDamagePhase(
    attackType: Attack, 
    teamA: Team, 
    teamB: Team, 
    counter = false,
  ) {
    let text = "**__Damage Phase__**\n";
    let damage = 0;

    const nameA = teamA.player.name;
    const nameB = teamB.player.name;

    if (attackType === "Melee") {
      damage = teamA.player.melee;
    } else if (attackType === "Ranged") {
      damage = teamA.player.ranged;
    }

    text += `${damage}`;
    let isConsecutive = false;
    let rolled20 = false;
    const rolls = [];

    for (let i = 0; i < teamA.attackCount; i++) {
      const roll = await this.runRollAnimation(teamA.player, `Rolling to determine damage`);

      if (!rolled20 && roll === 20) {
        rolled20 = true;
      }
        
      if (rolled20) {
        teamA.consecutive++;

        if (teamA.consecutive < 3) {
          isConsecutive = true;
        } else if (teamA.consecutive >= 3) {
          teamA.consecutive = 0;
        }
      }

      text += ` + ${roll}`;
      damage += roll;
      rolls.push(roll);
    }

    text += ` = ${damage}\n`;

    if (attackType === "Ranged") {
      const initialDamage = damage;
      damage = Math.floor(damage / 2);
      text += `Total attack damage: ${initialDamage} / 2 = ${damage}\n`
    }

    if (counter && !rolled20) {
      damage = Math.floor(damage / 2);
      text += `((${rolls.join(" + ")} + ${teamA.player.melee})/2) done to ${teamB.player.name}'s health\n`
    }

    teamB.player.hp -= damage;
    text += `((${rolls.join(" + ")} + ${teamA.player.melee})) done to ${teamB.player.name}'s health\n`

    if (isConsecutive) {
      text += `${nameA} rolled a 20 thus ${nameB}'s turn is skipped`;
    }

    await this.updateGameText(text);

    if (teamB.player.hp <= 0) {
      throw new EndGameError(teamA.player);
    }

    if (isConsecutive) {
      throw new ConsecutiveError(teamA.player);
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
        } else if (err instanceof ConsecutiveError) {
          teams.reverse();
        } else if (err instanceof CounterInitiatedError) {
          const { player } = err;
          const [teamA, teamB] = player.id === this.teamA.player.id ? 
            [this.teamA, this.teamB] : [this.teamB, this.teamA];

          try {
            await this.runAttackPhase("Melee", teamA, teamB, true);
            await this.runDamagePhase("Melee", teamA, teamB, true);
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
          }
        }

      } finally {
        teams.reverse();

        await this.updateGameText("Preparing for new round...");
        await sleep(ROUND_INTERVAL);
      }
    }
  }
}
