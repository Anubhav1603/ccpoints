const {db} = require("../db.js");
const {failLog, goBack, requirePerm, formatTag} = require("../helpers.js");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "record", false);
    if (check !== true) return res.send(check);

    await db.tx("do_sync", async t => {
        await failLog(req, db, t, "do_sync");

        await t.none("lock table clans, transactions, wars in access exclusive mode;");

        const tags = req.body.tags.split(",").map(clantag => formatTag(clantag));
        let count = 0;
        await Promise.all(tags.map(async (clantag) => {
            // ignore unchecked in case browser sends us disabled checkboxes
            if (!req.body[clantag + "_include"]) return;
            count++;

            let points = +req.body[clantag + "_value"];
            if (!isFinite(points)) throw new Error("Points value not numeric for " + clantag);
            let warid = req.body[clantag + "_warid"];
            let note = null;

            if (warid === "") warid = null;
            else {
                warid = +warid;
                if (!isFinite(warid)) throw new Error("War ID value not numeric or null for " + clantag);
            }

            let clan = await t.one("select * from clans where clantag=$[clantag];", { clantag });
            if (!clan.active) throw new Error("Sync tried to add transaction for non-active clan " + clantag);

            // special cases: do not modify points for clans in red zone or which are zero win
            if (clan.special.includes("redzone") || clan.special.includes("zerowin")) {
                note = "Point value zeroed from " + points + " due to ";
                if (clan.special.includes("redzone")) note += "red zone ";
                if (clan.special.includes("zerowin")) note += "no win "; // if both will say red zone no win status
                note += " status";
                points = 0;
            }

            clan = await t.one("update clans set points=points+$[diff] where clantag=$[clantag] returning *;", {
                clantag,
                diff: points
            });

            await t.none("insert into transactions (clantag, ts, warid, points, reason, pubnote) values ($[clantag], now(), $[warid], $[points], 'sync', $[note]);", {
                clantag, warid, points, note
            });

            // set war as recorded
            await t.none("update wars set recorded=true where warid=$[warid];", {warid});
        }));

        await t.none("insert into auditlog (userid, action, cdata) values ($[userid], 'sync', $[cdata:json]);", {
            userid: req.session.user.userid,
            cdata: { count }
        });

        res.send("Added " + count + " transactions successfully." + goBack("/admin", "the admin menu"));
    });
};
