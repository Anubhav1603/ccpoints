const fs = require("fs");

const express = require("express");
const ejs = require("ejs");
const morgan = require("morgan");
const minify = require("html-minifier").minify;
const cookieSession = require("cookie-session");
const bodyParser = require("body-parser");

const minifyOptions = {
    removeComments:            true,
    collapseWhitespace:        true,
    collapseBooleanAttributes: true,
    removeAttributeQuotes:     true,
    removeEmptyAttributes:     true,
    minifyJS:                  true
};

const {db} = require("./db.js");

(async () => {
    const app = express();
    app.use(morgan("combined"));
    app.use(express.static("static"));
    app.use(bodyParser.urlencoded({limit: "50mb", extended: false, parameterLimit: 1000000}));
    app.use(cookieSession({
        name: "token",
        secret: process.env.SESSION_SECRET,
        maxAge: 1 * 60 * 60 * 1000,
        secure: true
    }));
    app.set("trust proxy", 1);

    app.get("/", (req, res) => res.redirect("clans"));

    const helpers = require("./helpers.js");

    for (let page of fs.readdirSync("views")) {
        if (!page.endsWith(".ejs")) continue;
        app.get("/" + page.slice(0, -4), (req, res, next) => {
            ejs.renderFile("./views/" + page, {req, res, db, ...helpers}, {async: true}, (err, strPromise) => {
                if (err) return next(err);
                strPromise.then(str => {
                    res.send(minify(str, minifyOptions));
                    next();
                }).catch((err) => next(err));
            });
        });
    }

    for (let page of fs.readdirSync("actions")) {
        if (!page.endsWith(".js")) continue;
        app.post("/" + page.slice(0, -3), (req, res, next) => {
            (async () => {
                await require("./actions/" + page)(req, res);
            })().then(() => next()).catch((err) => next(err));
        });
    }

    if (await db.oneOrNone("select * from pg_catalog.pg_tables where tablename='users';") === null) {
        console.error("Error: Database is not set up");
        // docker will restart us
        process.exit(1);
    }
    app.listen(3000, () => {
        console.log("Listening on port 3000");
    });
})().catch(console.error);

if (process.env.HEALTHCHECK_URL) {
    const fetch = require("node-fetch");
    setInterval(() => {
        fetch(process.env.HEALTHCHECK_URL).catch(console.error);
    }, 60*60*1000);
}
