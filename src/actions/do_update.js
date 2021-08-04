const {goBack, requirePerm} = require("../helpers.js");
const {execSync} = require("child_process");

module.exports = async (req, res) => {
    const check = await requirePerm(req, "update", false);
    if (check !== true) return res.send(check);

    execSync("ssh-keyscan github.com > ~/.ssh/known_hosts");
    execSync("chmod 400 /app/keys/deploykey");
    const ret = execSync("GIT_SSH_COMMAND=\"ssh -i /app/keys/deploykey\" git pull --ff-only -X theirs").toString();
    res.send("Git returned: <tt>" + ret + "</tt><br /><br />Rebooting..." + goBack("/admin", "the admin menu"));

    setTimeout(() => process.exit(0), 1000);
};
