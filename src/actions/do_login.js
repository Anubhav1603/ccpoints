const {db} = require("../db.js");
const {requirePerm, setValid} = require("../helpers.js");

module.exports = async (req, res) => {
    await db.tx("do_login", async t => {
        let resp = await t.oneOrNone("select *, password = crypt($[password], password) as pw from users where email=lower($[email])", req.body);
        if (!resp || !resp.pw) return res.send("Bad login");

        const {password:_, pw: _pw, ...user} = resp;
        await t.none("insert into auditlog (userid, action, cdata) values ($[userid], 'login', $[body:json]);",
            {userid: user.userid, body: {email: req.body.email, to: req.body.to}});

        req.session.user = user;
        setValid(req);
        const check = await requirePerm(req, "login", false);
        if (check !== true) {
            req.session = null;
            return res.send(check);
        }

        res.send("Redirecting after login...<script>window.location = window.location.origin + " +
            JSON.stringify(req.body.to || "/admin") + "</script>");
    });
};
