const {db} = require("../db.js");
const {failLog, goBack, requirePerm} = require("../helpers.js");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "record", false);
    if (check !== true) return res.send(check);

    await db.tx("do_transaction", async t => {
        await failLog(req, db, t, "transaction");

        const prev = await t.oneOrNone("select * from transactions where transid=$[transid] for update;", req.body);
        if (!prev) return req.send("Transaction not found");
        
        if (req.body.warid === "") req.body.warid = null;
        if (req.body.pubnote === "") req.body.pubnote = null;
        if (req.body.privnote === "") req.body.privnote = null;

        const trans = await t.one("update transactions set ts=$[ts], warid=$[warid], pubnote=$[pubnote], privnote=$[privnote], points=$[points] where transid=$[transid] returning *", req.body);
        if (trans.deleted) throw new Error("Editing a deleted transaction");

        const clan = await t.one("update clans set points=points+$[diff] where clantag=$[clantag] returning points;", {
            clantag: trans.clantag,
            diff: trans.points - prev.points
        });

        await t.none("insert into auditlog (userid, action, cdata) values ($[userid], 'transaction', $[cdata:json]);", {
            userid: req.session.user.userid,
            clantag: trans.clantag,
            cdata: {
                transid: trans.transid,
                from: prev, to: trans,
                newPoints: clan.points
            }
        });

        res.send("Updated successfully." + goBack("/clan?tag=" + trans.clantag, "the clan page"));
    });
};
