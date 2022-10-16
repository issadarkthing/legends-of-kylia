import { Client } from "./structure/Client";
import path from "path";
import { CommandError } from "@jiman24/slash-commandment";
import { config } from "dotenv";

config();

export const client = new Client({
  intents: ["GuildMessages", "Guilds", "GuildMembers"],
});

client.commandManager.handleCommandError((i, err) => {
  let errMsg = "There's an error occured";

  if (err instanceof CommandError) {
    errMsg = err.message;
  } else {
    console.log(err);
  }

  if (i.replied || i.deferred) {
    i.editReply(errMsg);
  } else {
    i.reply(errMsg);
  }
});

client.commandManager.handleCommandOnCooldown((i, cmd, timeLeft) => {
  const { hours, minutes, seconds } = timeLeft;

  i.editReply(
    `You cannot run ${cmd.name} command after **${hours}h ${minutes}m ${seconds}s**`
  );
});

client.discordClient.on("ready", () => {
  console.log(client.discordClient.user?.username, "is ready!");
  client.commandManager.registerCommands(path.resolve(__dirname, "./commands"));
});


client.discordClient.login(process.env.BOT_TOKEN);
