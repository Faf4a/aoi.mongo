## aoi.js-mongo

- Easy to use package for the implementation of MongoDB in aoi.js with minimal changes.

### Setup

To get started with aoi.js-mongo, we have to do a couple things.

- Install the package.
```bash
npm install github:faf4a/aoi.mongo
```

- Update your index.js file.

```js
const { AoiClient, LoadCommands } = require("aoi.js");
const { Database } = require("aoi.mongo");

const client = new AoiClient({
  token: "DISCORD BOT TOKEN",
  prefix: "DISCORD BOT PREFIX",
  intents: ["Guilds", "GuildMessages", "GuildMembers", "MessageContent"],
  events: ["onInteractionCreate", "onMessage"],
  disableAoiDB: true // This is important, ensure it's set to true. You can't use both at once.
});

const database = new Database(client, {
    url: "mongodb+srv://...", // your mongoDB server uri
    tables: ["main"],
    logging: true // enables or disables logs
});

client.variables({
    variable: "value"
});

// rest of your index.js..
```

## Transfer aoi.db database

You can indeed transfer your database!

```js
const { AoiClient, LoadCommands } = require("aoi.js");
const { Database } = require("aoi.mongo");

const client = new AoiClient({
  token: "DISCORD BOT TOKEN",
  prefix: "DISCORD BOT PREFIX",
  intents: ["Guilds", "GuildMessages", "GuildMembers", "MessageContent"],
  events: ["onInteractionCreate", "onMessage"],
  disableAoiDB: true // This is important, ensure it's set to true. You can't use both at once.
});

const database = new Database(client, {
    url: "mongodb+srv://...", // your mongoDB server uri
    tables: ["main"],
    logging: true, // enables or disables logs
    convertOldData: {
      enabled: true,
      dir: "./database"
    },
});

client.variables({
    variable: "value"
});

// rest of your index.js..
```

### Want to keep aoi.db?

Then use https://github.com/NanotechPikachu/aoi.mongodb this version made by [NanotechPikachu](https://github.com/NanotechPikachu)!

### MongoDB URI

- How do I get one?

You need to be registered at https://cloud.mongodb.com/, and create a database accordingly, after you did so follow the steps below:

![https://i.imgur.com/sibh7dA.png](https://i.imgur.com/sibh7dA.png)

![https://i.imgur.com/YerNHad.png](https://i.imgur.com/YerNHad.png)

![https://i.imgur.com/ZTMbq4h.png](https://i.imgur.com/ZTMbq4h.png)

Then paste it in the **URL** field of the database setup, and you're pretty much done!

#### Server Connection Timeout

- Make sure you allowed ALL IPS to connect to your mongoDB server.

`Security` -> `Network Access` -> `Allow all IPs`
