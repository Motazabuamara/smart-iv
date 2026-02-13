const fs = require("fs");
const bcrypt = require("bcrypt");

const USERS_FILE = "users.json";

async function hashPasswords() {
  let users = JSON.parse(fs.readFileSync(USERS_FILE));

  for (let user of users) {
    if (!user.password.startsWith("$2b$")) {
      user.password = await bcrypt.hash(user.password, 10);
      console.log("Hashed:", user.username);
    }
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  console.log("✅ All passwords hashed successfully");
}

hashPasswords();
