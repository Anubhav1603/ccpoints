const {db} = require("../db.js");
const {failLog, goBack, requirePerm} = require("../helpers.js");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "record", false);
    if (check !== true) return res.send(check);

    await db.tx("do_deltransaction", async t => {
        await failLog(req, db, t, "deltransaction");

        const prev = await t.oneOrNone("update transactions set deleted=true where transid=$[transid] returning *;", req.body);
        if (!prev) return req.send("Transaction not found");

        const clan = await t.one("update clans set points=points+$[diff] where clantag=$[clantag] returning points;", {
            clantag: prev.clantag,
            diff: -prev.points
        });

        await t.none("insert into auditlog (userid, action, cdata) values ($[userid], 'deltransaction', $[cdata:json]);", {
            userid: req.session.user.userid,
            clantag: prev.clantag,
            cdata: {
                transid: prev.transid,
                from: prev,
                newPoints: clan.points
            }
        });

        res.send("Deleted successfully." + goBack("/clan?tag=" + prev.clantag, "the clan page"));
    });
};
