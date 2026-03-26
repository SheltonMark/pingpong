const { pool } = require('../config/database');

const CHECKOUT_COLUMNS = [
  {
    name: 'check_out_time',
    sql: 'ALTER TABLE check_ins ADD COLUMN check_out_time TIMESTAMP NULL DEFAULT NULL AFTER check_in_time'
  },
  {
    name: 'check_out_latitude',
    sql: 'ALTER TABLE check_ins ADD COLUMN check_out_latitude DECIMAL(10, 8) NULL DEFAULT NULL AFTER distance'
  },
  {
    name: 'check_out_longitude',
    sql: 'ALTER TABLE check_ins ADD COLUMN check_out_longitude DECIMAL(11, 8) NULL DEFAULT NULL AFTER check_out_latitude'
  },
  {
    name: 'check_out_distance',
    sql: 'ALTER TABLE check_ins ADD COLUMN check_out_distance INT NULL DEFAULT NULL AFTER check_out_longitude'
  }
];

module.exports = {
  async up(connectionPool = pool) {
    const db = connectionPool && typeof connectionPool.query === 'function'
      ? connectionPool
      : pool;

    const [rows] = await db.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'check_ins'
         AND COLUMN_NAME IN (?)`,
      [CHECKOUT_COLUMNS.map((column) => column.name)]
    );

    const existingColumns = new Set(rows.map((row) => row.COLUMN_NAME));

    for (const column of CHECKOUT_COLUMNS) {
      if (existingColumns.has(column.name)) {
        continue;
      }

      await db.query(column.sql);
      console.log(`  added check_ins.${column.name}`);
    }
  }
};
