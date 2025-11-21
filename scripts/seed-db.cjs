const Database = require('better-sqlite3');
const { join } = require('path');
const bcrypt = require('bcryptjs');

const dbPath = join(process.cwd(), 'fairshare.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log('Starting database seeding...\n');

try {
  // Clear existing data (in reverse order of foreign key dependencies)
  console.log('Clearing existing data...');
  db.prepare('DELETE FROM member_leave_dates').run();
  db.prepare('DELETE FROM shared_items').run();
  db.prepare('DELETE FROM group_members').run();
  db.prepare('DELETE FROM groups').run();
  db.prepare('DELETE FROM user_tokens').run();
  db.prepare('DELETE FROM users').run();
  console.log('✓ Existing data cleared\n');

  // Hash password for admin user
  const passwordHash = bcrypt.hashSync('password', 10);

  // 1. Create admin/owner user
  console.log('Creating admin user...');
  const userStmt = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)');
  const userResult = userStmt.run('admin@app.com', passwordHash, 'Ifti');
  const adminUserId = userResult.lastInsertRowid;
  console.log(`✓ Created user: Ifti (admin@app.com) - ID: ${adminUserId}`);

  // 2. Create additional users for members
  console.log('\nCreating member users...');
  const akibResult = userStmt.run('akib@app.com', passwordHash, 'Akib');
  const akibUserId = akibResult.lastInsertRowid;
  console.log(`✓ Created user: Akib (akib@app.com) - ID: ${akibUserId}`);

  const tusharResult = userStmt.run('tushar@app.com', passwordHash, 'Tushar');
  const tusharUserId = tusharResult.lastInsertRowid;
  console.log(`✓ Created user: Tushar (tushar@app.com) - ID: ${tusharUserId}`);

  // 3. Create group
  console.log('\nCreating group...');
  const groupStmt = db.prepare('INSERT INTO groups (name, description, invite_code, owner_id) VALUES (?, ?, ?, ?)');
  const groupResult = groupStmt.run(
    'Hasina Manjil (5th Floor)',
    'Shared apartment on 5th floor',
    'HASINA5F',
    adminUserId
  );
  const groupId = groupResult.lastInsertRowid;
  console.log(`✓ Created group: Hasina Manjil (5th Floor) - ID: ${groupId}`);

  // 4. Add members to group (all joined on 1 Oct 2024)
  console.log('\nAdding members to group...');
  const joinDate = '2024-10-01';
  const memberStmt = db.prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
  
  memberStmt.run(groupId, adminUserId, 'owner', joinDate);
  console.log(`✓ Added Ifti as owner (joined: ${joinDate})`);
  
  memberStmt.run(groupId, akibUserId, 'member', joinDate);
  console.log(`✓ Added Akib as member (joined: ${joinDate})`);
  
  memberStmt.run(groupId, tusharUserId, 'member', joinDate);
  console.log(`✓ Added Tushar as member (joined: ${joinDate})`);

  // 5. Add items (all with 3 years depreciation = 1095 days)
  console.log('\nAdding shared items...');
  const itemStmt = db.prepare(`
    INSERT INTO shared_items 
    (group_id, name, price, purchase_date, depreciation_years, depreciation_days, depreciation_period_type, created_by) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Fridge: 25000, purchased 1 Oct 2024
  itemStmt.run(groupId, 'Fridge', 25000, '2024-10-01', 3, 1095, 'years', adminUserId);
  console.log('✓ Added item: Fridge - ৳25,000 (purchased: 2024-10-01, depreciation: 3 years)');

  // Kitchen Rack: 1750, purchased 1 Jan 2025
  itemStmt.run(groupId, 'Kitchen Rack', 1750, '2025-01-01', 3, 1095, 'years', adminUserId);
  console.log('✓ Added item: Kitchen Rack - ৳1,750 (purchased: 2025-01-01, depreciation: 3 years)');

  // Shoe Rack: 3250, purchased 1 Aug 2025
  itemStmt.run(groupId, 'Shoe Rack', 3250, '2025-08-01', 3, 1095, 'years', adminUserId);
  console.log('✓ Added item: Shoe Rack - ৳3,250 (purchased: 2025-08-01, depreciation: 3 years)');

  console.log('\n✅ Database seeding completed successfully!\n');
  console.log('Login credentials:');
  console.log('  Email: admin@app.com');
  console.log('  Password: password');
  console.log('\nOther users:');
  console.log('  Akib - akib@app.com (password: password)');
  console.log('  Tushar - tushar@app.com (password: password)');
  console.log('\nGroup invite code: HASINA5F\n');

} catch (error) {
  console.error('❌ Error seeding database:', error.message);
  process.exit(1);
} finally {
  db.close();
}
