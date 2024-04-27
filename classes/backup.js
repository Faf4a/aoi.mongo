const { readFileSync, readdirSync, existsSync, statSync } = require("fs");
const { join } = require("path");
const chalk = require("chalk");
const ora = require("ora");

module.exports = async (client, options) => {
  if (!existsSync(join(__dirname, "../../../", options.convertOldData.dir))) {
    console.error("[aoi.mongo]: " + chalk.red(`The '${options.convertOldData.dir}' folder does not exist.`));
    return;
  }

  const directories = readdirSync(join(__dirname, "../../../", options.convertOldData.dir));

  let progress;
  let total = 0;
  let index = 1;

  console.log("[aoi.mongo]: " + chalk.green("Starting backup process..."));

  for (const dir of directories) {
    if (["reference", ".backup", "transaction"].includes(dir)) continue;
    const dirPath = join(__dirname, "../../../", options.convertOldData.dir, dir);

    if (statSync(dirPath).isDirectory()) {
      const files = readdirSync(dirPath);

      console.log(`[aoi.mongo]: Found files in ${dir}: ${chalk.yellow(files.length)}`);

      for (const file of files) {
        const filePath = join(dirPath, file);
        const databaseData = readFileSync(filePath);
        const data = JSON.parse(databaseData);
        total += Object.keys(data).length;
      }
    }
  }

  console.log(`[aoi.mongo]: Estimated time for backup: ${chalk.yellow((total * 75) / 1000)} seconds.`);

  console.warn("[aoi.mongo]: " + chalk.red("This process may take a while depending on the amount of data. Canceling this process will lose current progress."));

  console.log(`[aoi.mongo]: Found ${chalk.yellow(total)} keys to transfer.`);

  for (const dir of directories) {
    if (["reference", ".backup", "transaction"].includes(dir)) continue;
    const dirPath = join(__dirname, "../../../", options.convertOldData.dir, dir);

    if (statSync(dirPath).isDirectory()) {
      const files = readdirSync(dirPath);

      for (const file of files) {
        const filePath = join(dirPath, file);
        const databaseData = readFileSync(filePath);
        const data = JSON.parse(databaseData);

        progress = ora("[aoi.mongo]: Getting ready to backup (this may take a while depending on the amount of data)...\n\r").start();

        await new Promise((resolve) => setTimeout(resolve, 1e3));

        const db = client.db.db(file.split("_scheme_")[0]);

        progress.text = `[aoi.mongo]: Transferring data from table ${chalk.yellow(file.split("_scheme_")[0])}...`;

        await new Promise((resolve) => setTimeout(resolve, 3e3));

        progress.stop();

        for (const [key, value] of Object.entries(data)) {
          const start = process.hrtime.bigint();

          const currentProgress = ora(`[${index}/${total}]: Processing ${chalk.yellow(key)}...`).start();

          const matches = key.match(/(.*?)(_\d+)(.*)/);
          let text;

          if (matches) {
            let [_, matchedText, numbers, rest] = matches;
            text = matchedText;
          } else {
            text = key;
          }

          const collection = db.collection(text);

          if (!value.hasOwnProperty("value") || !key) {
            currentProgress.fail(`[${index}/${total}]: No data found for ${chalk.yellow(key)}`);
            continue;
          }

          await new Promise((resolve) => setTimeout(resolve, 20));

          currentProgress.text = `[${index}/${total}]: Setting ${chalk.yellow(key)} to '${chalk.cyan(value.value).slice(0, 15)}'`;

          const res = await collection.insertOne({
            key: key,
            value: value.value
          });

          if (res.acknowledged) {
            const end = (Number(process.hrtime.bigint() - start) / 1e6).toFixed(2);

            currentProgress.succeed(`[${index}/${total}] [${end}ms]: ${chalk.yellow(key)} ${options.convertOldData.acknowledge ? "acknowledged write?: " + res.acknowledged : ""}`);
          } else {
            currentProgress.fail(`[${index}/${total}]: Failed to write ${chalk.yellow(key)}`);
          }

          index++;
        }
      }
    }
  }

  progress.succeed("[aoi.mongo]: Transfer completed!");
  console.warn("[aoi.mongo]: " + chalk.red("Please note that the data may not be the same as the original data. Please verify the data before deleting any database files."));
  console.warn(
    "[aoi.mongo]: " + chalk.yellow("Please disable the backup option in the Database option to prevent data loss, else it will attempt to reset the values to the values from the database files.")
  );
};
