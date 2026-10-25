// Real SQL in an isolated in-memory database, behind the Capacitor interface.
import { DatabaseSync } from 'node:sqlite';
export const CapacitorSQLite = {};
export class SQLiteConnection {
  async isConnection() { return { result: false }; }
  async createConnection() {
    const db = new DatabaseSync(':memory:');
    return {
      isDBOpen: async () => ({ result: true }), open: async () => {},
      execute: async sql => db.exec(sql),
      query: async (sql, values = []) => ({ values: db.prepare(sql).all(...values) }),
      run: async (sql, values = []) => db.prepare(sql).run(...values),
      beginTransaction: async () => db.exec('BEGIN'),
      commitTransaction: async () => db.exec('COMMIT'),
      rollbackTransaction: async () => db.exec('ROLLBACK'),
    };
  }
}
