const fs = require("fs");
const {execSync} = require("child_process");

const pgpromise = require("pg-promise");
const monitor = require("pg-monitor");

execSync("mkdir -p ../logs");
const options = {
    error: (err, e) => {
        if (err.code === "ECONNREFUSED") {
            // connection error, exit so we can be restarted
            console.log("Failed to connect to postgres");
            setTimeout(() => process.exit(0), 1000);
        }
        fs.appendFileSync("../logs/sqlerrors.log", new Date() + "\n" +
            JSON.stringify(e["query"]) + "\n" +
            JSON.stringify(err) + "\n" +
            JSON.stringify(e["ctx"]) + "\n\n");
    }
};

monitor.attach(options, ["error", "query", "transact"]);
const pgp = pgpromise(options);

const db = pgp({
    user: "fwapoints",
    password: "fwapoints",
    database: "fwapoints",
    host: "fwapoints_postgres_1",
    port: 5432
});

module.exports = {db, pgp};
