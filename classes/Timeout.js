const { Time } = require("aoi.js/src/utils/helpers/customParser");

class Timeout {
  constructor(client) {
    this.client = client;
  }

  async ready() {
    const db = this.client.db.db("aoijs_vars");
    const collection = db.collection("timeouts");

    let cmds = this.client.cmd.timeout.allValues();

    const __items = await collection
      .find({ _v: { $lt: Date.now() } })
      .toArray();

    for (const item of __items) {
      cmds = cmds.filter((x) => x.name === item._command);
      await collection.deleteOne({ _id: item._id });
      console.log(cmds);
    }

    const __col = await collection.countDocuments();

    //if (__col === 0) await collection.drop();
  }

  async set(command, timeoutData, duration) {
      const __time = Date.now() + Time.parse(duration).ms;
      const __id = require("crypto").randomBytes(6).toString("hex");

      console.log(this.client.cmd.timeout.allValues().filter((x) => x.name === command));
      const col = this.client.db.db("aoijs_vars").collection('timeouts');
      await col.insertOne(
        {
          _id: __id,
          _v: __time,
          _command: command,
          _timeoutData: timeoutData,
        }
      );

      return __id;
  }
}

module.exports = Timeout;
