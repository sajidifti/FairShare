const fs = require('fs');
const { join } = require('path');

const dbPath = join(process.cwd(), 'fairshare.db');

if (fs.existsSync(dbPath)) {
  try {
    fs.unlinkSync(dbPath);
    console.log('Deleted existing DB at', dbPath);
  } catch (err) {
    console.error('Failed to delete DB file:', err.message);
    process.exit(1);
  }
} else {
  console.log('No existing DB file found at', dbPath);
}

// Run the init script to recreate the DB and tables
try {
  require('./init-db.cjs');
} catch (err) {
  console.error('Failed to run init-db.cjs:', err && err.message ? err.message : err);
  process.exit(1);
}
