const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const config = require('../config/config');

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  // Gamba helpers
  createGamba(type, userDiscordId, bet) {
    return new Promise((resolve, reject) => {
      const query = `INSERT INTO gamba (type, user, bet) VALUES (?, ?, ?)`;
      this.db.run(query, [type, userDiscordId, bet], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      });
    });
  }

  getGambaById(id) {
    return new Promise((resolve, reject) => {
      const query = `SELECT * FROM gamba WHERE id = ?`;
      this.db.get(query, [id], (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  updateGamba(id, fields) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return Promise.resolve({ changes: 0 });
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    values.push(id);
    return new Promise((resolve, reject) => {
      const query = `UPDATE gamba SET ${setClause} WHERE id = ?`;
      this.db.run(query, values, function(err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  // Daily claim helpers
  getLastClaim(discordId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT claimed_at FROM point_log WHERE discord_id = ? ORDER BY claimed_at DESC LIMIT 1`;
      this.db.get(query, [discordId], (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.claimed_at : null);
      });
    });
  }

  canClaimPoints(discordId) {
    return new Promise((resolve, reject) => {
      const query = `SELECT 1 as found FROM point_log WHERE discord_id = ? AND claimed_at >= datetime('now','-24 hours') LIMIT 1`;
      this.db.get(query, [discordId], (err, row) => {
        if (err) return reject(err);
        resolve(!row);
      });
    });
  }

  recordClaim(discordId) {
    return new Promise((resolve, reject) => {
      const query = `INSERT INTO point_log (discord_id, claimed_at) VALUES (?, CURRENT_TIMESTAMP)`;
      this.db.run(query, [discordId], function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      });
    });
  }

  // Increment or decrement points for a member
  addPoints(username, delta) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE fc_members
        SET points = COALESCE(points, 0) + ?, last_updated = CURRENT_TIMESTAMP
        WHERE username = ?
      `;
      this.db.run(query, [delta, username], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Ensure the points column exists on fc_members; add it if missing
  ensurePointsColumn() {
    const checkQuery = `PRAGMA table_info(fc_members)`;
    this.db.all(checkQuery, [], (err, rows) => {
      if (err) {
        console.error('Error checking fc_members columns:', err.message);
        return;
      }
      const hasPoints = rows.some((r) => r.name === 'points');
      if (!hasPoints) {
        const alterQuery = `ALTER TABLE fc_members ADD COLUMN points INTEGER DEFAULT 0`;
        this.db.run(alterQuery, (alterErr) => {
          if (alterErr) {
            console.error('Error adding points column:', alterErr.message);
          } else {
            console.log('Added points column to fc_members');
          }
        });
      }
    });
  }

  init() {
    // Ensure data directory exists
    const dbDir = path.dirname(config.database.path);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new sqlite3.Database(config.database.path, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
      } else {
        console.log('Connected to SQLite database');
        this.createTables();
      }
    });
  }

  createTables() {
    const createMembersTable = `
      CREATE TABLE IF NOT EXISTS fc_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        discord_id TEXT UNIQUE,
        detected_date_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_level TEXT DEFAULT 'user',
        user_rank TEXT,
        user_note TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createChannelsTable = `
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        disc_channel TEXT NOT NULL UNIQUE,
        use TEXT NOT NULL
      )
    `;

    const createRankRoleTable = `
      CREATE TABLE IF NOT EXISTS rank_role (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fc_rank TEXT NOT NULL UNIQUE,
        disc_role TEXT NOT NULL
      )
    `;

    const createPointLogTable = `
      CREATE TABLE IF NOT EXISTS point_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_id TEXT NOT NULL,
        claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createGambaTable = `
      CREATE TABLE IF NOT EXISTS gamba (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        user TEXT NOT NULL,
        challenger TEXT,
        bet INTEGER NOT NULL,
        turn TEXT,
        status INTEGER,
        winner TEXT
      )
    `;

    this.db.run(createMembersTable, (err) => {
      if (err) {
        console.error('Error creating fc_members table:', err.message);
      } else {
        console.log('FC members table ready');
        // Ensure points column exists
        this.ensurePointsColumn();
      }
    });

    this.db.run(createChannelsTable, (err) => {
      if (err) {
        console.error('Error creating channels table:', err.message);
      } else {
        console.log('Channels table ready');
      }
    });

    this.db.run(createRankRoleTable, (err) => {
      if (err) {
        console.error('Error creating rank_role table:', err.message);
      } else {
        console.log('Rank role table ready');
      }
    });

    this.db.run(createPointLogTable, (err) => {
      if (err) {
        console.error('Error creating point_log table:', err.message);
      } else {
        console.log('Point log table ready');
      }
    });

    this.db.run(createGambaTable, (err) => {
      if (err) {
        console.error('Error creating gamba table:', err.message);
      } else {
        console.log('Gamba table ready');
      }
    });
  }

  // Insert or update member data
  upsertMember(username, gameLevel, rank, note = null) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO fc_members (username, user_level, user_rank, user_note, last_updated)
        VALUES (?, 'user', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(username) DO UPDATE SET
          user_rank = excluded.user_rank,
          user_note = COALESCE(excluded.user_note, user_note),
          last_updated = CURRENT_TIMESTAMP
      `;

      this.db.run(query, [username, rank, note], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  // Get all members
  getAllMembers() {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fc_members ORDER BY username';
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get total member count
  getMemberCount() {
    return new Promise((resolve, reject) => {
      const query = 'SELECT COUNT(*) AS count FROM fc_members';
      this.db.get(query, [], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.count : 0);
        }
      });
    });
  }

  // Get member by username
  getMember(username) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fc_members WHERE username = ?';
      this.db.get(query, [username], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Update member note
  updateMemberNote(username, note) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE fc_members 
        SET user_note = ?, last_updated = CURRENT_TIMESTAMP 
        WHERE username = ?
      `;
      
      this.db.run(query, [note, username], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Remove member
  removeMember(username) {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM fc_members WHERE username = ?';
      this.db.run(query, [username], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Link Discord ID to member
  linkDiscordId(username, discordId) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE fc_members 
        SET discord_id = ?, last_updated = CURRENT_TIMESTAMP 
        WHERE username = ?
      `;
      
      this.db.run(query, [discordId, username], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Unlink Discord ID from member
  unlinkDiscordId(username) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE fc_members 
        SET discord_id = NULL, last_updated = CURRENT_TIMESTAMP 
        WHERE username = ?
      `;
      
      this.db.run(query, [username], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Get member by Discord ID
  getMemberByDiscordId(discordId) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fc_members WHERE discord_id = ?';
      this.db.get(query, [discordId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Get all linked members (with Discord IDs)
  getLinkedMembers() {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fc_members WHERE discord_id IS NOT NULL ORDER BY username';
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get all unlinked members (without Discord IDs)
  getUnlinkedMembers() {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM fc_members WHERE discord_id IS NULL ORDER BY username';
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Set user permission level
  setUserLevel(username, level) {
    return new Promise((resolve, reject) => {
      if (!['user', 'admin'].includes(level)) {
        reject(new Error('Invalid permission level. Must be "user" or "admin"'));
        return;
      }

      const query = `
        UPDATE fc_members 
        SET user_level = ?, last_updated = CURRENT_TIMESTAMP 
        WHERE username = ?
      `;
      
      this.db.run(query, [level, username], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Check if user has admin permissions (by Discord ID or username)
  async isAdmin(discordId = null, username = null) {
    try {
      let member;
      
      if (discordId) {
        member = await this.getMemberByDiscordId(discordId);
      } else if (username) {
        member = await this.getMember(username);
      }
      
      return member && member.user_level === 'admin';
    } catch (error) {
      logger.error('Error checking admin status:', error);
      return false;
    }
  }

  // Channel management methods
  setChannel(channelId, use) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO channels (disc_channel, use)
        VALUES (?, ?)
        ON CONFLICT(disc_channel) DO UPDATE SET
          use = excluded.use
      `;
      
      this.db.run(query, [channelId, use], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  getChannel(use) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM channels WHERE use = ?';
      this.db.get(query, [use], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Rank role management methods
  setRankRole(fcRank, discordRoleId) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO rank_role (fc_rank, disc_role)
        VALUES (?, ?)
        ON CONFLICT(fc_rank) DO UPDATE SET
          disc_role = excluded.disc_role
      `;
      
      this.db.run(query, [fcRank, discordRoleId], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  getRankRole(fcRank) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM rank_role WHERE fc_rank = ?';
      this.db.get(query, [fcRank], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  getAllRankRoles() {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM rank_role ORDER BY fc_rank';
      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  removeRankRole(fcRank) {
    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM rank_role WHERE fc_rank = ?';
      this.db.run(query, [fcRank], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  // Enhanced member methods for rank tracking
  updateMemberRank(username, newRank) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE fc_members 
        SET user_rank = ?, last_updated = CURRENT_TIMESTAMP 
        WHERE username = ?
      `;
      
      this.db.run(query, [newRank, username], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ changes: this.changes });
        }
      });
    });
  }

  getMembersNotInList(currentMembers) {
    return new Promise((resolve, reject) => {
      const placeholders = currentMembers.map(() => '?').join(',');
      const query = `SELECT * FROM fc_members WHERE username NOT IN (${placeholders})`;
      
      this.db.all(query, currentMembers, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error closing database:', err.message);
        } else {
          console.log('Database connection closed');
        }
      });
    }
  }
}

module.exports = new Database();
