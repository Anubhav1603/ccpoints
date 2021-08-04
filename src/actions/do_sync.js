const {db} = require("../db.js");
const {failLog, goBack, requirePerm, formatTag} = require("../helpers.js");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "record", false);
    if (check !== true) return res.send(check);

    await db.tx("do_sync", async t => {
        await failLog(req, db, t, "do_sync");

        await t.none("lock table clans, transactions, wars in access exclusive mode;");

        const tags = req.body.tags.split(",").map(tag => formatTag(tag));
        let count = 0;
        await Promise.all(tags.map(async (tag) => {
            // ignore unchecked in case browser sends us disabled checkboxes
            if (!req.body[tag + "_include"]) return;
            count++;

            const points = +req.body[tag + "_value"];
            if (!isFinite(points)) throw new Error("Points value not numeric for " + tag);
            let warid = req.body[tag + "_warid"];

            if (warid === "") warid = null;
            else {
                warid = +warid;
                if (!isFinite(warid)) throw new Error("War ID value not numeric or null for " + tag);
            }

            let clan = await t.one("update clans set points=points+$[diff] where clantag=$[clantag] returning *;", {
                clantag: tag,
                diff: points
            });
            if (!clan.active) throw new Error("Sync tried to add transaction for non-active clan " + tag);
            await t.none("insert into transactions (clantag, ts, warid, points) values ($[clantag], now(), $[warid], $[points]);", {
                clantag: tag, warid, points
            });

            // special cases
            if (clan.special.includes("redzone") && points !== 0) {
                const points = -50 - clan.points;
                clan = await t.one("update clans set points=points+$[diff] where clantag=$[clantag] returning *;", {
                    clantag: tag,
                    diff: points
                });
                if (!clan.active) throw new Error("Sync tried to add transaction for non-active clan " + tag);
                await t.none("insert into transactions (clantag, ts, warid, points, pubnote) values ($[clantag], now(), $[warid], $[points], $[pubnote]);", {
                    clantag: tag, warid, points, pubnote: "Automatic correction to -50 due to red zone"
                });
            }
            if (clan.special.includes("zerowin") && points !== 0) {
                const points = -100 - clan.points;
                clan = await t.one("update clans set points=points+$[diff] where clantag=$[clantag] returning *;", {
                    clantag: tag,
                    diff: points
                });
                if (!clan.active) throw new Error("Sync tried to add transaction for non-active clan " + tag);
                await t.none("insert into transactions (clantag, ts, warid, points, pubnote) values ($[clantag], now(), $[warid], $[points], $[pubnote]);", {
                    clantag: tag, warid, points, pubnote: "Automatic correction to -100 due to zero win"
                });
            }

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
