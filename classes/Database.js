const { MongoClient, ServerApiVersion } = require("mongodb");
const AoiError = require("aoi.js/src/classes/AoiError");
const Interpreter = require("aoi.js/src/core/interpreter.js");
class Database {
  constructor(client, options) {
    this.client = client;
    this.options = options;
    this.debug = this.options.debug ?? false;

    this.connect();
  }

  async connect() {
    try {
      this.client.db = new MongoClient(this.options.url, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: false
        },
        connectTimeoutMS: 15000
      });

      if (!this.options.tables || this.options?.tables.length === 0) throw new TypeError("Missing variable tables, please provide at least one table.");
      if (this.options.tables.includes("__aoijs_vars__")) throw new TypeError("'__aoijs_vars__' is reserved as a table name.");
      this.client.db.tables = [...this.options.tables, "__aoijs_vars__"];

      //bind
      this.client.db.get = this.get.bind(this);
      this.client.db.set = this.set.bind(this);
      this.client.db.drop = this.drop.bind(this);
      this.client.db.delete = this.delete.bind(this);
      this.client.db.deleteMany = this.deleteMany.bind(this);
      this.client.db.findOne = this.findOne.bind(this);
      this.client.db.findMany = this.findMany.bind(this);
      this.client.db.all = this.all.bind(this);
      this.client.db.db.transfer = this.transfer.bind(this);
      this.client.db.db.avgPing = this.ping.bind(this);

      this.client.db.db.readyAt = Date.now();

      await this.client.db.connect();

      if (this.options.logging != false) {
        const latency = await this.client.db.db.avgPing();
        const { version } = require("../package.json");
        if (latency != "-1") {
          AoiError.createConsoleMessage(
            [
              {
                text: `Successfully connected to MongoDB`,
                textColor: "white"
              },
              {
                text: `Cluster Latency: ${latency}ms`,
                textColor: "white"
              },
              {
                text: `Installed on v${version}`,
                textColor: "green"
              }
            ],
            "white",
            { text: " aoi.js-mongo  ", textColor: "cyan" }
          );
        }
      }

      const client = this.client;

      this.client.once("ready", async () => {
        await require("aoi.js/src/events/Custom/timeout.js")({ client, interpreter: Interpreter }, undefined, undefined, true);

        setInterval(async () => {
          await require("aoi.js/src/events/Custom/handleResidueData.js")(client);
        }, 3.6e6);
      });
    } catch (err) {
      AoiError.createConsoleMessage(
        [
          {
            text: `Failed to connect to MongoDB`,
            textColor: "red"
          },
          {
            text: err.message,
            textColor: "white"
          }
        ],
        "white",
        { text: " aoi.mongo  ", textColor: "cyan" }
      );
      process.exit(0);
    }

    if (this.options?.convertOldData?.enabled == true) {
      this.client.once("ready", () => {
        require("./backup")(this.client, this.options);
      });
    }
  }

  async ping() {
    let start = Date.now();
    const res = await this.client.db.db("admin").command({ ping: 1 });
    if (!res.ok) return -1;
    return Date.now() - start;
  }

  async get(table, key, id = undefined) {
    const col = this.client.db.db(table).collection(key);
    const aoijs_vars = ["cooldown", "setTimeout", "ticketChannel"];

    if (this.debug == true) {
      console.log(`[received] get(${table}, ${key}, ${id})`);
    }

    let data;
    if (aoijs_vars.includes(key)) {
      data = await col.findOne({ key: `${key}_${id}` });
    } else {
      if (!this.client.variableManager.has(key, table)) return;
      const __var = this.client.variableManager.get(key, table)?.default;
      data = (await col.findOne({ key: `${key}_${id}` })) || __var;
    }

    if (this.debug == true) {
      console.log(`[returning] get(${table}, ${key}, ${id}) -> ${typeof data === "object" ? JSON.stringify(data) : data}`);
    }

    return data;
  }

  async set(table, key, id, value) {
    if (this.debug == true) {
      console.log(`[received] set(${table}, ${key}, ${id}, ${typeof value === "object" ? JSON.stringify(value) : value})`);
    }

    const col = this.client.db.db(table).collection(key);
    if (!id) key = key;
    else key = `${key}_${id}`;

    await col.updateOne({ key }, { $set: { value: value } }, { upsert: true });
    if (this.debug == true) {
      console.log(`[returning] set(${table}, ${key}, ${id}, ${value}) -> ${typeof value === "object" ? JSON.stringify(value) : value}`);
    }
  }

  async drop(table, variable) {
    if (this.debug == true) {
      console.log(`[received] drop(${table}, ${variable})`);
    }
    if (variable) {
      await this.client.db.db(table).collection(variable).drop();
    } else {
      await this.client.db.db(table).dropDatabase();
    }

    if (this.debug == true) {
      console.log(`[returning] drop(${table}, ${variable}) -> dropped ${table}`);
    }
  }

  async findOne(table, query) {
    const col = this.client.db.db(table).collection(query);
    return await col.findOne({}, { value: 1, _id: 0 });
  }

  async deleteMany(table, query) {
    if (this.debug == true) {
      console.log(`[received] deleteMany(${table}, ${query})`);
    }

    const db = this.client.db.db(table);
    const collections = await db.listCollections().toArray();

    for (let collection of collections) {
      const col = db.collection(collection.name);
      if (this.debug == true) {
        const data = await col.find({ q: query }).toArray();
        console.log(`[returning] deleteMany(${table}, ${query}) -> ${data}`);
      }
  
      await col.deleteMany({ q: query });
    }
    if (this.debug == true) {
      console.log(`[returning] deleteMany(${table}, ${query}) -> deleted`);
    }
  }

  async delete(table, key, id) {
    if (id) key = `${key}_${id}`;
    else key = key;

    if (this.debug == true) {
      console.log(`[received] delete(${table}, ${key})`);
    }
    const db = this.client.db.db(table);
    const collections = await db.listCollections().toArray();

    for (let collection of collections) {
      const col = db.collection(collection.name);
      const doc = await col.findOne({ key });

      if (this.debug == true) {
        console.log(`[returning] delete(${table}, ${key}) -> ${doc.value}`);
      }

      if (doc) {
        await col.deleteOne({ key });
        break;
      }
    }
    if (this.debug == true) {
      console.log(`[returned] delete(${table}, ${key}) -> deleted`);
    }
  }

  async findMany(table, query, limit) {
    const db = this.client.db.db(table);
    const collections = await db.listCollections().toArray();
    let results = [];

    for (let collection of collections) {
      const col = db.collection(collection.name);
      let data;

      if (typeof query === "function") {
        data = await col.find({}).toArray();
        data = data.filter(query);
      } else {
        data = await col.find(query).toArray();
      }

      if (limit) {
        data = data.slice(0, limit);
      }

      results.push(...data);
    }

    return results;
  }

  async all(table, filter, list = 100, sort = "asc") {
    const db = this.client.db.db(table);
    const collections = await db.listCollections().toArray();
    let results = [];
    if (this.debug == true) {
      console.log(`[received] all(${table}, ${filter}, ${list}, ${sort})`);
    }
    for (let collection of collections) {
      const col = db.collection(collection.name);
      let data = await col.find({}).toArray();
      data = data.filter(filter);
      results.push(...data);
    }

    if (sort === "asc") {
      results.sort((a, b) => a.value - b.value);
    } else if (sort === "desc") {
      results.sort((a, b) => b.value - a.value);
    }
    if (this.debug == true) {
      console.log(`[returning] all(${table}, ${filter}, ${list}, ${sort}) -> ${JSON.stringify(results)} items`);
    }
    return results.slice(0, list);
  }

  async transfer() {
    require("./backup")(this.client, this.options);
  }
}

module.exports = { Database };
