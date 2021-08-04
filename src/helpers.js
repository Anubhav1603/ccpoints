const fetch = require("node-fetch");
const crypto = require("crypto");
const {db} = require("./db.js");

// used to invalidate all sessions on user edit and things
let invalidation = Math.random();
const requirePerm = async (req, perm, redirect=true) => {
    if (!req.session.user) {
        if (!redirect) return "Error: Your session has expired.<br /><br />Please open a new tab and log in, and then reload this page to resubmit the form.";
        return "Redirecting you to login..." +
            "<script>window.location = \"/login?to=\" + encodeURIComponent(window.location.pathname);</script>";
    }

    if (req.session.invalidate !== invalidation) {
        // re-pull user from database
        const {password: _, ...user} = await db.one("select * from users where userid=$[userid]", req.session.user);
        req.session.user = user;
    }
    req.session.invalidate = invalidation;

    if (req.session.user.perms.includes("all")) return true;
    if (req.session.user.perms.includes(perm)) return true;
    return "Error: You do not have the <tt>" + perm + "</tt> permission.";
};
const setValid = (req) => { req.session.invalidate = invalidation; };
const invalidate = () => { invalidation++; };

const formatTag = (tag) => {
    if (typeof tag !== "string") return null;
    return tag.toUpperCase().split(/[^A-Za-z0-9 ]/).join("").split("O").join("0");
};

const goBack = (link, text) => "<br /><br /><a href=\"" + link + "\" style=\"color: blue;\">Click here to go back to " + text + ".</a>";

const hmac = () => {
    return crypto.createHmac("sha256", process.env.SESSION_SECRET + "_hmac");
};

const failLog = async (req, db, t, action) => {
    // use db to add to fail log, then use transaction to delete fail log entry
    // assumes req.session.user exists
    const fail = await db.one("insert into faillog (userid, action, postdata) values ($[userid], $[action], $[postdata]) returning failid",
        {userid: req.session.user.userid, postdata: req.body, action});
    await t.none("delete from faillog where failid=$[failid]", fail);
};

const clashAPI = async (url, retry=false) => {
    const resp = await fetch(url, {
        headers: {
            "Authorization": "Bearer " + process.env.CLASH_API_TOKEN
        }
    });
    const text = await resp.text();
    try {
        const json = JSON.parse(text);
        if (json.reason === "requestThrottled") throw new Error("requestThrottled");
        // let cache = +resp.headers.raw()['cache-control'][0].split('=').pop();
        return json;
    } catch (e) {
        console.log("Exception in downloading");
        if (retry) throw new Error(e);
        return await clashAPI(url, true);
    }
};

module.exports = {requirePerm, formatTag, goBack, hmac, failLog, invalidate, setValid, clashAPI};
