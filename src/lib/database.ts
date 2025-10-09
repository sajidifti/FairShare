import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'fairshare.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    invite_code TEXT UNIQUE NOT NULL,
    owner_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shared_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    purchase_date DATE NOT NULL,
    depreciation_years INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES groups (id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS member_leave_dates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_member_id INTEGER NOT NULL,
    leave_date DATE,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(group_member_id),
    FOREIGN KEY (group_member_id) REFERENCES group_members (id) ON DELETE CASCADE
  );
`);

// Generate unique invite codes
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Database helper functions
export const dbHelpers = {
  // User operations
  createUser: (email: string, passwordHash: string, name: string) => {
    const stmt = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)');
    return stmt.run(email, passwordHash, name);
  },

  getUserByEmail: (email: string) => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email) as any;
  },

  getUserById: (id: number) => {
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as any;
  },

  // Group operations
  createGroup: (name: string, description: string | null, ownerId: number) => {
    const inviteCode = generateInviteCode();
    const stmt = db.prepare('INSERT INTO groups (name, description, invite_code, owner_id) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name, description, inviteCode, ownerId);
    
    // Add owner as group member
    const memberStmt = db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
    memberStmt.run(result.lastInsertRowid, ownerId, 'owner');
    
    return { ...result, inviteCode };
  },

  getGroupByInviteCode: (inviteCode: string) => {
    const stmt = db.prepare('SELECT * FROM groups WHERE invite_code = ?');
    return stmt.get(inviteCode) as any;
  },

  getGroupById: (id: number) => {
    const stmt = db.prepare('SELECT * FROM groups WHERE id = ?');
    return stmt.get(id) as any;
  },

  getUserGroups: (userId: number) => {
    const stmt = db.prepare(`
      SELECT g.*, gm.role, gm.joined_at 
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = ?
      ORDER BY gm.joined_at DESC
    `);
    return stmt.all(userId) as any[];
  },

  joinGroup: (groupId: number, userId: number) => {
    const stmt = db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)');
    return stmt.run(groupId, userId);
  },

  // Member operations
  getGroupMembers: (groupId: number) => {
    const stmt = db.prepare(`
      SELECT gm.*, u.name, u.email, mld.leave_date
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      LEFT JOIN member_leave_dates mld ON gm.id = mld.group_member_id
      WHERE gm.group_id = ?
      ORDER BY gm.role, gm.joined_at
    `);
    return stmt.all(groupId) as any[];
  },

  updateMemberLeaveDate: (groupMemberId: number, leaveDate: string | null) => {
    const stmt = db.prepare(`
      INSERT INTO member_leave_dates (group_member_id, leave_date) 
      VALUES (?, ?)
      ON CONFLICT(group_member_id) DO UPDATE SET 
        leave_date = excluded.leave_date,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(groupMemberId, leaveDate);
  },

  // Item operations
  createItem: (groupId: number, name: string, price: number, purchaseDate: string, depreciationYears: number, createdBy: number) => {
    const stmt = db.prepare(`
      INSERT INTO shared_items (group_id, name, price, purchase_date, depreciation_years, created_by) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(groupId, name, price, purchaseDate, depreciationYears, createdBy);
  },

  getGroupItems: (groupId: number) => {
    const stmt = db.prepare(`
      SELECT si.*, u.name as created_by_name
      FROM shared_items si
      JOIN users u ON si.created_by = u.id
      WHERE si.group_id = ?
      ORDER BY si.created_at DESC
    `);
    return stmt.all(groupId) as any[];
  },

  updateItem: (itemId: number, name: string, price: number, purchaseDate: string, depreciationYears: number) => {
    const stmt = db.prepare(`
      UPDATE shared_items 
      SET name = ?, price = ?, purchase_date = ?, depreciation_years = ?
      WHERE id = ?
    `);
    return stmt.run(name, price, purchaseDate, depreciationYears, itemId);
  },

  deleteItem: (itemId: number) => {
    const stmt = db.prepare('DELETE FROM shared_items WHERE id = ?');
    return stmt.run(itemId);
  },

  // Utility functions
  isUserInGroup: (userId: number, groupId: number) => {
    const stmt = db.prepare('SELECT id FROM group_members WHERE user_id = ? AND group_id = ?');
    return stmt.get(userId, groupId) as any;
  },

  getUserRoleInGroup: (userId: number, groupId: number) => {
    const stmt = db.prepare('SELECT role FROM group_members WHERE user_id = ? AND group_id = ?');
    const result = stmt.get(userId, groupId) as any;
    return result?.role || null;
  }
};

export default db;
