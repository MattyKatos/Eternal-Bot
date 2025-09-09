const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const commands = [];
const commandsPath = path.join(__dirname, '../commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

const rest = new REST().setToken(config.discord.token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    let data;
    if (config.discord.guildId) {
      // Deploy to specific guild (faster for development)
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, config.discord.guildId),
        { body: commands },
      );
    } else {
      // Deploy globally (takes up to 1 hour to propagate)
      data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
    }

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
  } catch (error) {
    console.error('Error deploying commands:', error);
  }
})();
