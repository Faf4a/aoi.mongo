const { MongoClient, ServerApiVersion } = require("mongodb");
const AoiError = require("aoi.js/src/classes/AoiError");
class Database {
  constructor(client, options) {
    this.client = client;
    this.options = options;

    this.connect();
  }

  async connect() {

    try {
      this.client.db = new MongoClient(this.options.url, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: false
        }
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
      this.client.db.clean = this.clean.bind(this);

      // database ping
      this.client.db.ping = this.ping.bind(this);

      //connect
      await this.client.db.connect();

      // create one function ($datebasePing -> $dbPing)
      this.client.functionManager.createFunction({
        name: "$dbPing",
        type: "djs",
        code: async (d) => {
          const data = d.util.aoiFunc(d);

          data.result = await d.client.db.ping();

          return {
            code: d.util.setCode(data)
          };
        }
      });

      //cleanup
      if (this.options?.cleanup?.enabled == true) {
        const duration = this.options?.cleanup?.duration ?? 7200000;
        const collection = "__aoijs_vars__";

        if (typeof duration !== "number" || duration <= 0) throw new TypeError(`Invalid cleanup duration provided in "${duration}"`);
        setInterval(async () => {
          await this.client.db.clean(collection);
        }, duration);
      }

      if (this.options.logging != false) {
        const latency = await this.client.db.ping();
        const { version } = require("../package.json");
        if (latency != "-1") {
          AoiError.createCustomBoxedMessage(
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
    } catch (err) {
      AoiError.createCustomBoxedMessage(
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
        { text: " aoi.js-mongo  ", textColor: "cyan" }
      );
      process.exit(0);
    }

    if (this.options?.convertOldData?.enabled == true) require("./backup")(this.client, this.options);
  }

  async ping() {
    let start = Date.now();
    const res = await this.client.db.db("admin").command({ ping: 1 });
    if (!res.ok) return -1;
    return Date.now() - start;
  }

  async get(table, key, id) {
    const col = this.client.db.db(table).collection(key);

    if (!this.client.variableManager.has(key, table) && table !== "__aoijs_vars__") return;

    const __var = this.client.variableManager.get(key, table)?.default;

    const data = await col.findOne({ key: `${key}_${id}` });

    return data || __var;
  }

  async set(table, key, id, value) {
    const col = this.client.db.db(table).collection(key);
    await col.updateOne({ key: `${key}_${id}` }, { $set: { value: value } }, { upsert: true });
  }

  async drop(table, variable) {
    if (variable) {
      await this.client.db.db(table).collection(variable).drop();
    } else {
      await this.client.db.db(table).dropDatabase();
    }
  }

  async findOne(table, query) {
    const col = this.client.db.db(table).collection(query);
    return await col.findOne({}, { value: 1, _id: 0 });
  }

  async deleteMany(table, query) {
    const db = this.client.db.db(table);
    const collections = await db.listCollections().toArray();

    for (let collection of collections) {
      const col = db.collection(collection.name);
      await col.deleteMany({ q: query });

      const cd = await col.countDocuments();
      if (cd === 0) {
        await col.drop();
      }
    }
  }

  async delete(table, key, id) {
    const db = this.client.db.db(table);
    const collections = await db.listCollections().toArray();

    let dkey = `${key}_${id}`;
    if (table === "__aoijs_vars__" && typeof key === "number") {
      dkey = `setTimeout_${key}`;
    }

    for (let collection of collections) {
      const col = db.collection(collection.name);
      const doc = await col.findOne({ key: dkey });

      if (doc) {
        await col.deleteOne({ key: dkey });

        if ((await col.countDocuments({})) === 0) await col.drop();

        break;
      }
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

    return results.slice(0, list);
  }

  //cooldown collection clean

  async clean(__collection) {
    const db = this.client.db.db(__collection);
    const collections = await db.listCollections().toArray();

    for (const col of collections) {
      const collection = db.collection(col.name);

      const __items = await collection.find({ _v: { $lt: Date.now() } }).toArray();

      if (__items.length > 0) {
        const __id = __items.map((item) => item._id);
        await collection.deleteMany({ _id: { $in: __id } });
      }

      const __col = await collection.countDocuments();

      if (__col === 0) await collection.drop();
    }
  }
}

module.exports = { Database };
