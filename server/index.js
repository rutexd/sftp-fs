"use strict";

const path = require("path");
const FileSystem = require("../impl/FileSystem");
const Server = require("../lib/Server");

const keyFile = process.env.KEY_FILE || path.join(__dirname, "keys", "id_rsa");
const username = process.env.SFTP_USERNAME || process.env.USER || "admin";
const password = process.env.SFTP_PASSWORD || "SuPerSeCrReT";
const port = parseInt(process.env.PORT || "8022", 10);

const server = new Server(new FileSystem(username, password));

process.on("SIGINT", async () => {
    console.log("User requested exit, shutting down...");
    await server.stop();
    console.log("All connections closed, goodbye!");
});


const run = async () => {
    console.log(`Starting SFTP server on port ${port}`);
    console.log(` - Key file in use is: ${keyFile}`);

    server.on("client-connected", () => {
        console.log("Client connected!");
    });

    server.on("client-disconnected", () => {
        console.log("Client disconnected!");
    });

    server.on("error", (error) => {
        console.error(error);
    });

    await server.start(keyFile, port);

    console.log("Server is ready!");
};

run();
