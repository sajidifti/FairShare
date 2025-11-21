import Database from 'better-sqlite3';
import { join } from 'path';

const dbPath = join(process.cwd(), 'fairshare.db');
// Use a loose type for the exported DB instance so TypeScript doesn't try to name
// the external BetterSqlite3.Database type in declaration output (avoids TS4023).
const db: any = new Database(dbPath);

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
    depreciation_years INTEGER,
    depreciation_days INTEGER,
    depreciation_period_type TEXT DEFAULT 'days',
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

  CREATE TABLE IF NOT EXISTS user_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    type TEXT NOT NULL,
    expires_at DATETIME,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
`);

// Ensure compatibility with older databases: add new columns if they don't exist
try {
  const cols = db.prepare("PRAGMA table_info('shared_items')").all() as Array<{ name: string }>;
  const colNames = cols.map(c => c.name);
  if (!colNames.includes('depreciation_days')) {
    db.exec("ALTER TABLE shared_items ADD COLUMN depreciation_days INTEGER;");
  }
  if (!colNames.includes('depreciation_period_type')) {
    db.exec("ALTER TABLE shared_items ADD COLUMN depreciation_period_type TEXT DEFAULT 'days';");
  }
} catch (err) {
  // If PRAGMA fails for any reason, log and continue; the app can still run but item creation will error until fixed.
  console.error('Compatibility migration check failed:', err);
}

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

  getAllUsers: () => {
    const stmt = db.prepare('SELECT id, email, name, created_at FROM users ORDER BY name');
    return stmt.all() as any[];
  },

  searchUsers: (query: string) => {
    const stmt = db.prepare(`
      SELECT id, email, name, created_at FROM users 
      WHERE LOWER(name) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?)
      ORDER BY name
      LIMIT 20
    `);
    const searchPattern = `%${query}%`;
    return stmt.all(searchPattern, searchPattern) as any[];
  },

  // Group operations
  createGroup: (name: string, description: string | null, ownerId: number, ownerJoinedAt?: string) => {
    const inviteCode = generateInviteCode();
    const stmt = db.prepare('INSERT INTO groups (name, description, invite_code, owner_id) VALUES (?, ?, ?, ?)');
    const result = stmt.run(name, description, inviteCode, ownerId);

    // Add owner as group member; if ownerJoinedAt is provided, set it explicitly
    if (ownerJoinedAt) {
      const memberStmt = db.prepare('INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)');
      memberStmt.run(result.lastInsertRowid, ownerId, 'owner', ownerJoinedAt);
    } else {
      const memberStmt = db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)');
      memberStmt.run(result.lastInsertRowid, ownerId, 'owner');
    }

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

  joinGroup: (groupId: number, userId: number, joinedAt?: string) => {
    if (joinedAt) {
      const stmt = db.prepare('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)');
      return stmt.run(groupId, userId, joinedAt);
    }
    const stmt = db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)');
    return stmt.run(groupId, userId);
  },

  // Member operations
  getGroupMembers: (groupId: number) => {
    const stmt = db.prepare(`
      SELECT gm.*, u.name, u.email, mld.leave_date,
      (SELECT count(*) FROM user_tokens ut WHERE ut.user_id = u.id AND ut.type = 'signup' AND ut.used = 0) as pending_invite_count
      FROM group_members gm
      JOIN users u ON gm.user_id = u.id
      LEFT JOIN member_leave_dates mld ON gm.id = mld.group_member_id
      WHERE gm.group_id = ?
      ORDER BY gm.role, gm.joined_at
    `);
    return stmt.all(groupId) as any[];
  },

  // Token operations (invitations, password resets)
  createUserToken: (userId: number, token: string, type: string, expiresAt?: string) => {
    const stmt = db.prepare('INSERT INTO user_tokens (user_id, token, type, expires_at) VALUES (?, ?, ?, ?)');
    return stmt.run(userId, token, type, expiresAt || null);
  },

  getActiveTokenForUser: (userId: number, type: string) => {
    const stmt = db.prepare(`
      SELECT * FROM user_tokens 
      WHERE user_id = ? AND type = ? AND used = 0 
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at DESC
      LIMIT 1
    `);
    return stmt.get(userId, type) as any;
  },

  getUserToken: (token: string, type?: string) => {
    if (type) {
      const stmt = db.prepare('SELECT ut.*, u.email, u.name FROM user_tokens ut JOIN users u ON ut.user_id = u.id WHERE ut.token = ? AND ut.type = ?');
      return stmt.get(token, type) as any;
    }
    const stmt = db.prepare('SELECT ut.*, u.email, u.name FROM user_tokens ut JOIN users u ON ut.user_id = u.id WHERE ut.token = ?');
    return stmt.get(token) as any;
  },

  markUserTokenUsed: (token: string) => {
    const stmt = db.prepare('UPDATE user_tokens SET used = 1 WHERE token = ?');
    return stmt.run(token);
  },

  updateUserPassword: (userId: number, passwordHash: string) => {
    const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    return stmt.run(passwordHash, userId);
  },

  updateUserName: (userId: number, name: string) => {
    const stmt = db.prepare('UPDATE users SET name = ? WHERE id = ?');
    return stmt.run(name, userId);
  },

  updateUserEmail: (userId: number, email: string) => {
    const stmt = db.prepare('UPDATE users SET email = ? WHERE id = ?');
    return stmt.run(email, userId);
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

  updateMemberJoinedAt: (groupMemberId: number, joinedAt: string) => {
    const stmt = db.prepare(`
      UPDATE group_members
      SET joined_at = ?
      WHERE id = ?
    `);
    return stmt.run(joinedAt, groupMemberId);
  },

  // Item operations
  createItem: (groupId: number, name: string, price: number, purchaseDate: string, depreciationValue: number, depreciationPeriodType: 'days' | 'years', createdBy: number) => {
    // depreciationValue is either years or days depending on depreciationPeriodType
    let depreciationDays: number;
    let depreciationYearsVal: number | null = null;
    if (depreciationPeriodType === 'days') {
      depreciationDays = Math.max(1, Math.round(depreciationValue || 1));
      depreciationYearsVal = Math.round(depreciationDays / 365);
    } else {
      depreciationDays = Math.max(1, Math.round((depreciationValue || 1) * 365));
      depreciationYearsVal = depreciationValue || null;
    }

    const stmt = db.prepare(`
      INSERT INTO shared_items (group_id, name, price, purchase_date, depreciation_years, depreciation_days, depreciation_period_type, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(groupId, name, price, purchaseDate, depreciationYearsVal, depreciationDays, depreciationPeriodType, createdBy);
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

  updateItem: (itemId: number, name: string, price: number, purchaseDate: string, depreciationValue: number, depreciationPeriodType: 'days' | 'years', depreciationYears?: number) => {
    // depreciationValue is either years or days depending on depreciationPeriodType
    let depreciationDays: number;
    let depreciationYearsVal: number | null = null;
    if (depreciationPeriodType === 'days') {
      depreciationDays = Math.max(1, Math.round(depreciationValue || 1));
      depreciationYearsVal = Math.round(depreciationDays / 365);
    } else {
      depreciationDays = Math.max(1, Math.round((depreciationValue || 1) * 365));
      depreciationYearsVal = typeof depreciationYears === 'number' ? depreciationYears : depreciationValue || null;
    }

    const stmt = db.prepare(`
      UPDATE shared_items 
      SET name = ?, price = ?, purchase_date = ?, depreciation_years = ?, depreciation_days = ?, depreciation_period_type = ?
      WHERE id = ?
    `);
    return stmt.run(name, price, purchaseDate, depreciationYearsVal, depreciationDays, depreciationPeriodType, itemId);
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
