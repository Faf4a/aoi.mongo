const { MongoClient, ServerApiVersion } = require("mongodb");
const AoiError = require("aoi.js/src/classes/AoiError");

class Database {
    constructor(client, options) {
        this.client = client;
        this.options = options;

        this.connect();
        this.createFunctions();
    }

    async connect() {
        try {
            this.client.db = new MongoClient(this.options.url, {
                serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: false,
                },
            });
            
            await new Promise((resolve) => {
                this.client.once("ready", () => {
                    resolve();
                });
            });

            await this.client.db.connect();

            if (this.options?.cleanup?.enabled == true) {
                const duration = this.options?.cleanup?.duration ?? 7200000
                const collection = this.options?.cleanup?.collection ?? "cooldown";

                if (typeof duration !== "number" || duration <= 0) throw new TypeError(`Invalid cleanup duration provided in "${duration}"`);
                setInterval(async () => {
                    await this.client.db.clean(collection);
                }, duration);
            }

            if (this.options.logging !== false) {
                let ping = (await this.client.db.db("admin").command({ ping: 1 })).ok;
                AoiError.createCustomBoxedMessage(
                    [
                    {
                        text: `Successfully connected to MongoDB`,
                        textColor: "white",
                    },
                    {
                        text: `Latency: ${ping}ms`,
                        textColor: "white",
                    },
                    ],
                    "white",
                    { text: "aoi.js-mongo ", textColor: "cyan" }
                );
            }

            //bind
            this.client.db.get = this.get.bind(this);
            this.client.db.set = this.set.bind(this);
            this.client.db.drop = this.drop.bind(this);
            this.client.db.delete = this.delete.bind(this);
            this.client.db.findOne = this.findOne.bind(this);
            this.client.db.findMany = this.findMany.bind(this);
            this.client.db.clean = this.clean.bind(this);
        } catch (err) {
            AoiError.createCustomBoxedMessage(
                [
                {
                    text: `Failed to connect to MongoDB`,
                    textColor: "red",
                },
                {
                    text: err.message,
                    textColor: "white",
                },
                ],
                "white",
                { text: "aoi.js-mongo   ", textColor: "cyan" }
            );
            await process.exit(0)
        }
    }

    async get(table, variable, guildId, userId, messageId, channelId) {
        const col = this.client.db.db(table).collection(variable);
        let __var = this.client.variableManager.has(variable, "undefined");

        if (!__var) return console.error(`[aoi.js-mongo]: Unable to find variable "${variable}" in variable manager.`);

        __var = this.client.variableManager.get(variable, "undefined")?.default;

        const data = (await col.findOne({
            _guildId: guildId ? guildId : null,
            _userId: userId ? userId : null,
            _messageId: messageId ? messageId : null,
            _channelId: channelId ? channelId : null,
        }, { _v: 1, _id: 0 }))?._v

        return data || __var;
    }
     
    async set(table, variable, data, guildId, userId, messageId, channelId) {
        const col = this.client.db.db(table).collection(variable);    
        await col.updateOne({ _guildId: guildId, _userId: userId }, { $set: { _v: data, _guildId: guildId, _userId: userId, _messageId: messageId, _channelId: channelId } }, { upsert: true });
    }

    async drop(table, variable) {
        (await this.client.db.db(table).collection(variable)).drop();
    }
     
    async findOne(table, variable) {
       const col = this.client.db.db(table).collection(variable);
       return await col.findOne({}, { _v: 1, _id: 0 });
    }
    
    async delete(table, variable, value, guildId, userId, messageId, channelId) {
        const col = this.client.db.db(table).collection(variable);

        await col.deleteOne({
            _v: value ? value : 0,
            _guildId: guildId ? guildId : null,
            _userId: userId ? userId : null,
            _messageId: messageId ? messageId : null,
            _channelId: channelId ? channelId : null,
        });
    
        if ((await col.countDocuments({})) === 0) await col.drop();
    }
     
    async findMany(table, variable, query) {
       const col = this.client.db.db(table).collection(variable);
       return await col.find(query).toArray();
    }

    //cooldown collection clean

    async clean(__collection) {
        const db = this.client.db.db(__collection);
        const collections = await db.listCollections().toArray();

        for (const col of collections) {
            const collection = db.collection(col.name);
    
            const __items = await collection.find({ _v: { $lt: Date.now() } }).toArray();

            if (__items.length > 0) {
                const __id = __items.map(item => item._id);
                await collection.deleteMany({ _id: { $in: __id } });
            }

            const __col = await collection.countDocuments();

            if (__col === 0) await collection.drop();
        }
    }
     
    async createFunctions() {      
        this.client.functionManager.createFunction({
            name: "$deleteVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, table = "default"] = data.inside.splits;

                await d.client.db.drop(table, variable);

                data.result = ""

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$setUserVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, value,, userId = d.author?.id, guildId = d.guild?.id, table = "default"] = data.inside.splits;

                await d.client.db.set(table, variable, value, guildId, userId);

                data.result = "";

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$getUserVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, userId = d.author?.id , guildId = d.guild?.id, table = "default"] = data.inside.splits;

                data.result = await d.client.db.get(table, variable, guildId, userId);

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$setGuildVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, value, guildId = d.guild?.id, table = "default"] = data.inside.splits;

                await d.client.db.set(table, variable, value, guildId);

                data.result = "";

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$getGuildVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, guildId = d.guild?.id, table = "default"] = data.inside.splits;

                data.result = await d.client.db.get(table, variable, guildId) || undefined;

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$setGlobalUserVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, value, userId = d.author?.id, table = "default" ] = data.inside.splits;

                await d.client.db.set(table, variable, value, null, userId);

                data.result = "";

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$getGlobalUserVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, userId = d.author?.id, table = "default" ] = data.inside.splits;

                data.result = await d.client.db.get(table, variable, null, userId) || undefined;

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$setVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, value, table = "default" ] = data.inside.splits;

                await d.client.db.set(table, variable, value);

                data.result = "";

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$getVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, table = "default" ] = data.inside.splits;

                data.result = await d.client.db.get(table, variable) || undefined;

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$setChannelVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, value, channelId = d.channel?.id, table = "default"] = data.inside.splits;

                await d.client.db.set(table, variable, value, null, null, null, channelId);

                data.result = "";

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$getChannelVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, channelId = d.channel?.id, table = "default" ] = data.inside.splits;

                data.result = await d.client.db.get(table, variable, null, null, null, channelId) || undefined;

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$setMessageVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, value, messageId = d.message?.id, table = "default" ] = data.inside.splits;

                await d.client.db.set(table, variable, value, null, null, messageId);

                data.result = "";

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$getMessageVar",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, messageId = d.message?.id, table = "default"] = data.inside.splits;

                data.result = await d.client.db.get(table, variable, null, null, messageId) || undefined;

                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$getGuildLeaderboard",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, table = "default", format = "{position}) {guild.name}: {value}", sep = "\n"] = data.inside.splits;
            
                let lb_data = await d.client.db.findMany(table, variable, {
                    _guildId: { $ne: null },
                    _userId: null,
                    _messageId: null,
                    _channelId: null,
                });
            
                lb_data = lb_data.sort((a, b) => b._v - a._v);
                        
                lb_data = lb_data.map((e, index) => {
                    const guild = d.client.guilds.cache.get(e._guildId);            
            
                    return format
                        .replace("{guild}", e._guildId)
                        .replace("{guild.name}", guild ? guild.name : "Unknown Guild")
                        .replace("{value}", e._v)
                        .replace("{value:false}", e._v)
                        .replace("{value:true}", Number(e._v).toLocaleString() || e._v)
                        .replace("{position}", index + 1);
                });
            
                data.result = lb_data.join(sep);
            
                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$getUserLeaderboard",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, table = "default", format = "{position}) {user.name}: {value}", sep = "\n"] = data.inside.splits;
            
                let lb_data = await d.client.db.findMany(table, variable, {
                    _guildId: { $ne: null },
                    _userId: { $ne: null },
                    _messageId: null,
                    _channelId: null,
                });
            
                lb_data = lb_data.sort((a, b) => b._v - a._v);
                        
                lb_data = await Promise.all(lb_data.map(async (e, index) => {
                    const user = d.client.guilds.cache.get(e._guildId).members.cache.get(e._userId) || await d.client.guilds.cache.get(e._guildId)?.members.fetch(e._userId);
                    return format
                        .replace("{user}", e._userId)
                        .replace("{user.name}", user ? user.user.username : "Unknown User")
                        .replace("{value}", e._v)
                        .replace("{value:false}", e._v)
                        .replace("{value:true}", Number(e._v).toLocaleString() || e._v)
                        .replace("{position}", index + 1);
                }));
            
                data.result = lb_data.join(sep);
            
                return {
                    code: d.util.setCode(data),
                };
            },
            name: "$getGlobalUserLeaderboard",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [variable, table = "default", format = "{position}) {user.name}: {value}", sep = "\n"] = data.inside.splits;
            
                let lb_data = await d.client.db.findMany(table, variable, {
                    _guildId: null,
                    _userId: { $ne: null },
                    _messageId: null,
                    _channelId: null,
                });
            
                lb_data = lb_data.sort((a, b) => b._v - a._v);
                        
                lb_data = await Promise.all(lb_data.map(async (e, index) => {
                    const user = d.client.users.cache.get(e._userId) || await d.client.users.fetch(e._userId);
                    console.log(e._v.toLocaleString());
                    return format
                        .replace("{user}", e._userId)
                        .replace("{user.name}", user ? user.username : "Unknown User")
                        .replace("{value}", e._v)
                        .replace("{value:false}", e._v)
                        .replace("{value:true}", Number(e._v).toLocaleString() || e._v)
                        .replace("{position}", index + 1);
                }));
            
                data.result = lb_data.join(sep);
            
                return {
                    code: d.util.setCode(data),
                };
            },
        },  {
            name: "$getUserLeaderboardInfo",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                let [variable, table = "default", varType = "global", resolveId = d.author?.id, format = "value"] = data.inside.splits;
            
                let type;
                if (varType === "global") {
                    type = {
                        _guildId: null,
                        _userId: { $ne: null },
                        _messageId: null,
                        _channelId: null,
                    }
                } else if (varType === "guild") {
                    type = {
                        _guildId: { $ne: null },
                        _userId: null,
                        _messageId: null,
                        _channelId: null,
                    }
                } else if (varType === "user") {
                    type = {
                        _guildId: { $ne: null },
                        _userId: { $ne: null },
                        _messageId: null,
                        _channelId: null,
                    }
                }

                let lb_data = await d.client.db.findMany(table, variable, type);
                lb_data = lb_data.sort((a, b) => b._v - a._v);
                
                const key = varType === "guild" ? "_guildId" : "_userId";

                try {
                    if (format === "position") {
                        data.result = lb_data.findIndex(obj => obj[key] === resolveId) + 1;
                    } else if (format === "value") {
                        data.result = lb_data.filter(obj => obj[key] === resolveId)[0]._v;
                    } else {
                        return d.aoiError.fnError(d, "custom", { inside: data.inside }, `type`);
                    }
                } catch (e) {
                    return d.aoiError.fnError(d, "custom", {}, `Couldn't find _v in variable`);
                }
            
                return {
                    code: d.util.setCode(data),
                };
            },
        }, {
            name: "$getLeaderboardInfo",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                let [variable, table = "default", varType = "global", position = "1", format = "value"] = data.inside.splits;
            
                let type;
                if (varType === "global") {
                    type = {
                        _guildId: null,
                        _userId: { $ne: null },
                        _messageId: null,
                        _channelId: null,
                    }
                } else if (varType === "guild") {
                    type = {
                        _guildId: { $ne: null },
                        _userId: null,
                        _messageId: null,
                        _channelId: null,
                    }
                } else if (varType === "user") {
                    type = {
                        _guildId: { $ne: null },
                        _userId: { $ne: null },
                        _messageId: null,
                        _channelId: null,
                    }
                }

                let lb_data = await d.client.db.findMany(table, variable, type);
                lb_data = lb_data.sort((a, b) => b._v - a._v);

                if (lb_data.length === 0 || !lb_data) return d.aoiError.fnError(d, "custom", { inside: data.inside }, `lb_data`);
                
                format = format.toLowerCase()

                if (position === "last") position = lb_data.length - 1 

                try {
                    if (format === "position") {
                        data.result = position;
                    } else if (format === "value") {
                        data.result = lb_data[Number(position) - 1]._v
                    } else if (format === "username") {
                        data.result = (await d.util.getUser(d, lb_data[Number(position) - 1]._userId))?.username
                    } else if (format === "userid") {
                        data.result = (await d.util.getUser(d, lb_data[Number(position) - 1]._userId))?.username
                    } else {
                        return d.aoiError.fnError(d, "custom", { inside: data.inside }, `type`);
                    }
                } catch (e) {
                    return d.aoiError.fnError(d, "custom", {}, `Couldn't find _v in variable`);
                }
            
                return {
                    code: d.util.setCode(data),
                };
            },
        }, //cooldown functions
        {
            name: "$cooldown",
            type: "djs",
            code: async (d) => {
                const { Time } = require("aoi.js/src/utils/helpers/customParser")
                const data = await d.util.aoiFunc(d);
                let [time, error, table = "cooldown"] = data.inside.splits;
                if (!d.command?.name) return d.aoiError.fnError(d, "custom", {}, `Command name not found`);

                time = Date.now() + Time.parse(time).ms

                let _v = await d.client.db.get(table, d.command.name, null, d.author?.id) || undefined

                if (!_v) {
                    await d.client.db.set(table, d.command.name, time, null, d.author?.id);
                    error = false;
                } else {
                    if (Date.now() >= _v || !_v) {
                        await d.client.db.set(table, d.command.name, time, null, d.author?.id);
                        error = false
                    } else {
                        error = await d.util.errorParser(error, d);
                        await d.aoiError.makeMessageError(d.client, d.channel, error.data ?? error, error.options, d);
                        error = true;
                    }
                }
            
                return {
                    code: d.util.setCode(data),
                    error
                };
            },
        }, {
            name: "$guildCooldown",
            type: "djs",
            code: async (d) => {
                const { Time } = require("aoi.js/src/utils/helpers/customParser")
                const data = await d.util.aoiFunc(d);
                let [time, error, table = "cooldown"] = data.inside.splits;
                if (!d.command?.name) return d.aoiError.fnError(d, "custom", {}, `Command name not found`);

                time = Date.now() + Time.parse(time).ms

                let _v = await d.client.db.get(table, d.command.name, d.guild?.id) || undefined

                if (!_v) {
                    await d.client.db.set(table, d.command.name, time, d.guild?.id);
                    error = false;
                } else {
                    if (Date.now() >= _v || !_v) {
                        await d.client.db.set(table, d.command.name, time, d.guild?.id);
                        error = false
                    } else {
                        error = await d.util.errorParser(error, d);
                        await d.aoiError.makeMessageError(d.client, d.channel, error.data ?? error, error.options, d);
                        error = true;
                    }
                }
            
                return {
                    code: d.util.setCode(data),
                    error
                };
            },
        }, {
            name: "$channelCooldown",
            type: "djs",
            code: async (d) => {
                const { Time } = require("aoi.js/src/utils/helpers/customParser")
                const data = await d.util.aoiFunc(d);
                let [time, error, table = "cooldown"] = data.inside.splits;
                if (!d.command?.name) return d.aoiError.fnError(d, "custom", {}, `Command name not found`);

                time = Date.now() + Time.parse(time).ms

                let _v = await d.client.db.get(table, d.command.name, null, null, null, d.channel?.id) || undefined

                if (!_v) {
                    await d.client.db.set(table, d.command.name, time, null, null, null, d.channel?.id);
                    error = false;
                } else {
                    if (Date.now() >= _v || !_v) {
                        await d.client.db.set(table, d.command.name, time, null, null, null, d.channel?.id);
                        error = false
                    } else {
                        error = await d.util.errorParser(error, d);
                        await d.aoiError.makeMessageError(d.client, d.channel, error.data ?? error, error.options, d);
                        error = true;
                    }
                }
            
                return {
                    code: d.util.setCode(data),
                    error
                };
            },
        }, {
            name: "$getCooldownTime",
            type: "djs",
            code: async (d) => {
                const data = await d.util.aoiFunc(d);
                const [command, type, resolveId, table = "cooldown"] = data.inside.splits;

                let cooldown;

                if (type === "channel") {
                    cooldown = await d.client.db.get(table, command, null, null, null, resolveId) || undefined
                } else if (type === "user") {
                    cooldown = await d.client.db.get(table, command, null, resolveId) || undefined
                } else if (type === "guild") {
                    cooldown = await d.client.db.get(table, command, resolveId) || undefined
                } else {
                    return d.aoiError.fnError(d, "custom", { inside: data.inside }, `type`);
                }

                if (!cooldown) {
                    data.result = 0;
                } else {
                    data.result = cooldown?._v
                }
            
                return {
                    code: d.util.setCode(data)
                };
            },
        });
    }
}

module.exports = { Database };
