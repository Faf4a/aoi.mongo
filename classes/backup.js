const { readFileSync, readdirSync, existsSync } = require("fs");
const { join } = require("path");
const chalk = require("chalk");
const ora = require("ora");

module.exports = async (client, tables) => {
  await new Promise((resolve) => {
    client.once("ready", () => {
      setTimeout(resolve, 5e3);
    });
  });

  if (!existsSync(join(__dirname, "../../database")) || !existsSync(join(__dirname, "../../database/main"))) {
    console.log("[aoi.mongo]: " + chalk.red("The 'database' and/or 'main' folder does not exist. Make sure it's in the root directory."));
    return;
  }

  const files = readdirSync(join(__dirname, "../../database/main"));

  let progress;
  let total = 0;
  let index = 1;

  console.log("[aoi.mongo]: " + chalk.green("Starting backup process..."));

  console.log(`[aoi.mongo]: Found files: ${chalk.yellow(files.length)}`);

  for (const file of files) {
    const databaseData = readFileSync(join(__dirname, `../../database/main/${file}`));
    const data = JSON.parse(databaseData);
    total += Object.keys(data).length;
  }

  console.log(`[aoi.mongo]: Estimated time for backup: ${chalk.yellow(total * 75 / 1000)} seconds.`);

  console.warn("[aoi.mongo]: " + chalk.red("This process may take a while depending on the amount of data. Canceling this process will lose current progress."));

  console.log(`[aoi.mongo]: Found ${chalk.yellow(total)} keys to transfer.`);

  for (const file of files) {
    const databaseData = readFileSync(join(__dirname, `../../database/main/${file}`));
    const data = JSON.parse(databaseData);

    await new Promise((resolve) => setTimeout(resolve, 1e3));

    const db = client.db.db(tables[0]);

    await new Promise((resolve) => setTimeout(resolve, 3e3));

    progress = ora("[aoi.mongo]: Starting backup...").start();

    for (const [key, value] of Object.entries(data)) {
      const start = process.hrtime.bigint();
      progress.stop();

      const currentProgress = ora(`[${index}/${total}]: Processing ${chalk.yellow(key)}...`).start();

      const collection = db.collection(key.split("_")[0]);

      if (!value.hasOwnProperty("value") || !key) {
        currentProgress.fail(`[${index}/${total}]: No data found for ${chalk.yellow(key)}`);
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));

      currentProgress.text = `[${index}/${total}]: Setting ${chalk.yellow(key)} to ${chalk.cyan(value.value)}`;

      await collection.insertOne({
        key: key,
        value: value.value
      });

      const end = (Number(process.hrtime.bigint() - start) / 1e6).toFixed(2);

      currentProgress.succeed(`[${index}/${total}] [${end}ms]: ${chalk.yellow(key)}`);

      index++;
    }
  }

  progress.succeed("[aoi.mongo]: Transfer completed!");
  console.warn("[aoi.mongo]: " + chalk.red("Please note that the data may not be the same as the original data. Please verify the data before deleting any database files."));
  console.warn(
    "[aoi.mongo]: " + chalk.yellow("Please disable the backup option in the Database option to prevent data loss, else it will attempt to reset the values to the values from the database files.")
  );
};
