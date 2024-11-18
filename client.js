const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let targetUsername = "";
let username = "";
const users = new Map();

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username}, to the chat`);

    socket.emit("registerPublicKey", {
      username,
      publicKey: publicKey.export({ type: "pkcs1", format: "pem" }),
    });
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        if ((match = message.match(/^!secret (\w+)$/))) {
          targetUsername = match[1];
          console.log(`Now secretly chatting with ${targetUsername}`);
        } else if (message.match(/^!exit$/)) {
          console.log(`No more secretly chatting with ${targetUsername}`);
          targetUsername = "";
        } else {
          if (targetUsername) {
            const targetPublicKey = users.get(targetUsername);
            if (!targetPublicKey) {
              console.log(`Public key for ${targetUsername} not found!`);
            } else {
              
              const encryptedMessage = crypto.publicEncrypt(
                targetPublicKey,
                Buffer.from(message)
              );
              socket.emit("message", {
                username,
                target: targetUsername,
                message: encryptedMessage.toString("base64"),
              });
            }
          } else {
            socket.emit("message", { username, message });
          }
        }
      }
      rl.prompt();
    });
  });
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`\nThere are currently ${users.size} users in the chat`);
  rl.prompt();
});

socket.on("newUser", (data) => {
  const { username: newUser, publicKey } = data;
  users.set(newUser, publicKey);
  console.log(`${newUser} joined the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage, target } = data;
  if (senderUsername !== username) {
    if (target === username) {
      try {
        const decryptedMessage = crypto.privateDecrypt(
          privateKey,
          Buffer.from(senderMessage, "base64")
        );
        console.log(`${senderUsername} (secret): ${decryptedMessage.toString()}`);
      } catch (error) {
        console.log(`${senderUsername} (secret): [Decryption failed]`);
      }
    } else {
      console.log(`${senderUsername}: ${senderMessage}`);
    }
    rl.prompt();
  }
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});
