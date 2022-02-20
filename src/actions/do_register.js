const {db} = require("../db.js");
const {hmac, goBack} = require("../helpers.js");

module.exports = (req, res, next) => (async () => {
    await db.tx("do_register", async t => {
        if (req.body.password !== req.body.passwordconfirm) return res.send("Passwords don't match");

        let userid;
        try {
            const givenBuf = Buffer.from(req.body.key, "base64");
            userid = givenBuf.readUInt32LE(0);

            const ct = (await t.one("select count(*) as ct from users;")).ct;
            const buf = hmac().update(userid.toString()).update(ct.toString()).digest();
            if (Buffer.compare(buf.slice(4), givenBuf.slice(4))) throw "";
        } catch (e) {
            console.log("Registration error", e);
            return res.send("Bad or expired registration key");
        }

        let user;
        try {
            user = await t.one("insert into users (name, email, password) values ($[username], lower($[email]), crypt($[password], gen_salt('bf'))) returning userid, name, email, perms, apikey;", req.body);
        } catch (e) {
            if (e.code === "23505") return res.send("Username or email already exists");
            throw e;
        }

        await t.none("insert into auditlog (userid, action, cdata) values ($[userid], 'register', $[body:json]);",
            {userid, body: user});

        res.send("Registration complete. Note that your account needs to be activated before you can log in." + goBack("/", "the home page"));
    });
})().then(() => next()).catch((err) => next(err));
