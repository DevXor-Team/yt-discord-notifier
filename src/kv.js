const fs = require("fs");
const path = require("path");


class KV {
    constructor(filePath = ".data/store.json") {
        this.filePath = filePath;
        this.dir = path.dirname(this.filePath);
        if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
        if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, "{}", "utf-8");
        this._load();
    }


    _load() {
        try {
            this.data = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
        } catch {
            this.data = {};
        }
    }


    async get(key) {
        this._load();
        return this.data[key];
    }


    async set(key, value) {
        this.data[key] = value;
        await fs.promises.writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
    }
}


module.exports = { KV };