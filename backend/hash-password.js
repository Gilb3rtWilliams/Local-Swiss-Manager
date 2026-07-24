// Run once to generate the value for ADMIN_PASSWORD_HASH in your .env file.
// Usage:  node hash-password.js "your-chosen-password"
//
// This never stores or transmits your plaintext password anywhere — it just
// prints the bcrypt hash for you to copy into .env. The plaintext is only
// ever compared against this hash at login time (see auth.js).

const bcrypt = require("bcryptjs");

const password = process.argv[2];
if (!password) {
  console.error('Usage: node hash-password.js "your-chosen-password"');
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  console.log("\nAdd this line to your .env file:\n");
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(
    "\nAlso make sure JWT_SECRET is set to a long random string — e.g. run:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"\n" +
      "and put that in .env as JWT_SECRET=...\n",
  );
});
