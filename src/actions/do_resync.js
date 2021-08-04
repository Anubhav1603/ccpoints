const {db} = require("../db.js");
const {failLog, requirePerm} = require("../helpers.js");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "record", false);
    if (check !== true) return res.send(check);

    await db.tx("do_resync", async t => {
        await failLog(req, db, t, "resync");

        const upd = await t.any("update clans set lastchecked=null where active=true returning null;");

        res.send(upd.length + " clans marked for force resyncing. Redirecting...<script>window.location = '/sync';</script>");
    });
};
