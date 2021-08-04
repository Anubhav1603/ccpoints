const {db} = require("../db.js");
const {failLog, goBack, requirePerm} = require("../helpers.js");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "record", false);
    if (check !== true) return res.send(check);

    await db.tx("do_record", async t => {
        await failLog(req, db, t, "record");

        if (req.body.warid === "") req.body.warid = null;
        if (req.body.pubnote === "") req.body.pubnote = null;
        if (req.body.privnote === "") req.body.privnote = null;

        const trans = await t.one("insert into transactions (clantag, ts, warid, pubnote, privnote, points) values ($[clantag], $[ts], $[warid], $[pubnote], $[privnote], $[points]) returning *", req.body);

        const clan = await t.one("update clans set points=points+$[diff] where clantag=$[clantag] returning points;", {
            clantag: trans.clantag,
            diff: trans.points
        });

        await t.none("insert into auditlog (userid, action, cdata) values ($[userid], 'record', $[cdata:json]);", {
            userid: req.session.user.userid,
            clantag: clan.clantag,
            cdata: {
                transid: trans.transid,
                to: trans,
                newPoints: clan.points
            }
        });

        res.send("Created successfully." + goBack("/clan?tag=" + trans.clantag, "the clan page"));
    });
};
