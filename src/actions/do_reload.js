const fetch = require("node-fetch");

const {db, pgp} = require("../db.js");
const {failLog, formatTag, goBack, requirePerm} = require("../helpers.js");

const clans_cs = new pgp.helpers.ColumnSet(["clantag", "clanname", "active"], {table: "clans"});

module.exports = async (req, res) => {
    const check = await requirePerm(req, "login", false);
    if (check !== true) return res.send(check);

    await db.tx("do_reload", async t => {
        await failLog(req, db, t, "reload");

        const resp = await (await fetch("https://chocolateclash.com/cc_n/_export.php?m=points_gfl")).json();
        const values = resp.map(([tag, name]) => ({
            clantag: formatTag(tag),
            clanname: name,
            active: true
        }));

        await t.none("lock table clans, transactions in access exclusive mode;");
        await t.none("update clans set active=false;");

        const rows = await t.any(pgp.helpers.insert(values, clans_cs) +
            " on conflict (clantag) do update set clanname=EXCLUDED.clanname, active=true returning null;");

        const recalc = await t.any("update clans set points=x.pts from (select clantag, sum(points) as pts from transactions where deleted=false group by clantag) as x where clans.clantag=x.clantag returning null;");

        await t.none("insert into auditlog (userid, action, cdata) values ($[userid], 'reload', $[body:json]);", {
            userid: req.session.user.userid,
            body: {
                active: rows.length,
                all: recalc.length
            }
        });

        res.send(rows.length + " clans marked as official. " + recalc.length + " clan points recalculated." + goBack("/admin", "the admin menu"));
    });
};
