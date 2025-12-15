const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`📦 Found ${files.length} migration files`);

  for (const file of files) {
    console.log(`\n🔄 Running: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // 按分号分割SQL语句
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const statement of statements) {
      try {
        await pool.execute(statement);
        console.log('  ✅ Statement executed');
      } catch (error) {
        // 忽略"表已存在"、"重复键"、"列已存在"等非致命错误
        const ignorableErrors = [
          'ER_TABLE_EXISTS_ERROR',
          'ER_DUP_ENTRY',
          'ER_DUP_KEY',
          'ER_DUP_KEYNAME',
          'ER_FK_DUP_KEY',
          'ER_DUP_FIELDNAME',
          'ER_COLUMN_EXISTS'
        ];
        if (ignorableErrors.includes(error.code) || error.errno === 1022 || error.errno === 1060 || error.errno === 1061) {
          console.log(`  ⚠️ Skipped: ${error.message.substring(0, 60)}...`);
        } else {
          console.error(`  ❌ Error: ${error.message}`);
          throw error;
        }
      }
    }
    console.log(`✅ Completed: ${file}`);
  }

  console.log('\n🎉 All migrations completed!');
  process.exit(0);
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
