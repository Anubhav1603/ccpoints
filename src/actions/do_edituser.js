const {db} = require("../db.js");
const {failLog, goBack, requirePerm, invalidate} = require("../helpers.js");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "manage", false);
    if (check !== true) return res.send(check);

    await db.tx("do_user", async t => {
        await failLog(req, db, t, "edituser");

        const prev = await t.oneOrNone("select * from users where userid=$[userid] for update;", req.body);
        if (!prev) return res.send("User not found");

        const perms = ["all", "login", "record", "manage", "update"].filter(p => req.body[p]);

        await t.none("update users set perms=$[perms:json] where userid=$[userid];", {userid: req.body.userid, perms});

        await t.none("insert into auditlog (userid, action, cdata) values ($[userid], 'edituser', $[cdata:json]);", {
            userid: req.session.user.userid,
            cdata: {
                userid: prev.userid,
                from: prev.perms, to: perms
            }
        });

        invalidate();

        res.send("Updated successfully." + goBack("/users", "Manage Users"));
    });
};
