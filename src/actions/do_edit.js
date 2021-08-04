const {db} = require("../db.js");
const {failLog, goBack, requirePerm} = require("../helpers.js");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "login", false);
    if (check !== true) return res.send(check);

    await db.tx("do_edit", async t => {
        await failLog(req, db, t, "edit");

        const prev = await t.oneOrNone("select * from clans where clantag=$[clantag] for update;", req.body);
        if (!prev) return res.send("Clan not found");

        const special = [];
        let points = prev.points;
        if (req.body.zerowin) {
            special.push("zerowin");
            if (points !== -100) {
                await t.none("insert into transactions (clantag, pubnote, points) values ($[clantag], 'Automatic points change upon becoming zero-win', $[points])",
                    { clantag: prev.clantag, points: -100 - prev.points });
                points = -100;
            }
        }
        if (req.body.redzone) {
            special.push("redzone");
            if (points !== -50) {
                await t.none("insert into transactions (clantag, pubnote, points) values ($[clantag], 'Automatic points change upon entering red zone', $[points])",
                    { clantag: prev.clantag, points: -50 - prev.points });
                points = -50;
            }
        }

        await t.none("update clans set special=$[special:json], points=$[points] where clantag=$[clantag];", {clantag: req.body.clantag, special, points});

        await t.none("insert into auditlog (userid, clantag, action, cdata) values ($[userid], $[clantag], 'edit', $[cdata:json]);", {
            userid: req.session.user.userid,
            clantag: prev.clantag,
            cdata: { from: prev.special, to: special }
        });

        res.send("Updated successfully." + goBack("/clan?tag=" + prev.clantag, "the clan"));
    });
};
