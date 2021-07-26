const express = require("express");

const app = express();

app.get("/", (req, res, next) => {
    res.send("test");
    next();
});

app.listen(3000, () => {
    console.log("Listening");
});
