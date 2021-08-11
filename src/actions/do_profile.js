const {db} = require("../db.js");
const {failLog, goBack, requirePerm, invalidate, setValid} = require("../helpers.js");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "login", false);
    if (check !== true) return res.send(check);

    await db.tx("do_profile", async t => {
        await failLog(req, db, t, "profile");

        if (req.body.password !== req.body.passwordconfirm) return res.send("Passwords don't match");

        const {password:_, ...prev} = await t.one("select * from users where userid=$[userid] for update;", req.session.user);

        if (+req.body.userid !== req.session.user.userid) {
            // something fishy is going on
            throw new Error("");
        }

        const {password:_pass, ...user} = await t.one("update users set email=lower($[email]), name=$[username] where userid=$[userid] returning *", req.body);

        const passwordChanged = req.body.password !== "";
        if (passwordChanged) {
            await t.none("update users set password=crypt($[password], gen_salt('bf')) where userid=$[userid]", req.body);
        }

        await t.none("insert into auditlog (userid, action, cdata) values ($[userid], 'profile', $[cdata:json]);", {
            userid: req.session.user.userid,
            cdata: {
                from: prev, to: user, passwordChanged
            }
        });

        req.session.user = user;
        invalidate();
        setValid(req);

        res.send("Updated successfully." + goBack("/admin", "the main menu"));
    });
};
