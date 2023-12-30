## aoi.js-mongo

- Easy to use package for the implementation of MongoDB in aoi.js with minimal changes.

### Setup

To get started with aoi.js-mongo, we have to do a couple things.

- Install the package.
```bash
npm install https://github.com/Faf4a/aoi.js-mongo
```

- Update your index.js file.

```js
const { AoiClient, LoadCommands } = require("aoi.js");
const { Database } = require("aoi.js-mongo");

const client = new AoiClient({
  token: "DISCORD BOT TOKEN",
  prefix: "DISCORD BOT PREFIX",
  intents: ["Guilds", "GuildMessages", "GuildMembers", "MessageContent"],
  events: ["onInteractionCreate", "onMessage"],
  disableAoiDB: true // This is important, ensure it's set to true. You can't use both at once.
});

const database = new Database(client, {
    url: "mongodb+srv://...", // your mongoDB server uri
    cleanup: {
      collection: "cooldown", // the collection where you store your cooldown data ("cooldown" by default)
      enabled: true, // enable cleanup of not used variables within the given collection
      duration: 86400000 // the duration of the cleanup, once a day is enough (in ms)
    },
    logging: true // enables or disables logs
});

// rest of your index.js..
```

### MongoDB URI

- How do I get one?

You need to be registered at https://cloud.mongodb.com/, and create a database accordingly, after you did so follow the steps below:

![https://i.imgur.com/sibh7dA.png](https://i.imgur.com/sibh7dA.png)

![https://i.imgur.com/YerNHad.png](https://i.imgur.com/YerNHad.png)

![https://i.imgur.com/ZTMbq4h.png](https://i.imgur.com/ZTMbq4h.png)

Then paste it in the **URL** field of the database setup, and you're pretty much done!