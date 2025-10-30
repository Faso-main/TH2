// set_users_and_link.js
import pkg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pkg;

const pool = new Pool({
  user: 'faso_user',
  host: 'localhost',
  database: 'pc_db',
  password: '1234',
  port: 5432,
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('🚀 Start: import users from procurements & link user_id to procurements');
    await client.query('BEGIN');

    // 0) Тех.индекс по ИНН (ускоряет UPDATE JOIN)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'i'
            AND c.relname = 'idx_procurements_inn'
        ) THEN
          CREATE INDEX idx_procurements_inn ON procurements(organization_inn);
        END IF;
      END $$;
    `);

    // 1) Сгенерируем пароль once
    const passwordHash = await bcrypt.hash('default123', 10);

    // 2) Добавляем пользователей на основе уникальных ИНН из закупок
    //    email = "<ИНН>@auto.company"
    const insertUsersSql = `
      INSERT INTO users (email, password_hash, inn, company_name, full_name)
      SELECT 
        LOWER(CONCAT(TRIM(p.organization_inn), '@auto.company')) AS email,
        $1 AS password_hash,
        TRIM(p.organization_inn) AS inn,
        TRIM(p.organization_name) AS company_name,
        'Импортированный пользователь' AS full_name
      FROM procurements p
      WHERE p.organization_inn IS NOT NULL AND p.organization_inn <> ''
      GROUP BY TRIM(p.organization_inn), TRIM(p.organization_name)
      ON CONFLICT (email) DO NOTHING
    `;
    const r1 = await client.query(insertUsersSql, [passwordHash]);
    console.log(`👥 Users inserted (or skipped on conflict): ${r1.rowCount}`);

    // 3) Привязываем закупки к пользователям по ИНН
    const linkSql = `
      UPDATE procurements p
      SET user_id = u.user_id
      FROM users u
      WHERE TRIM(p.organization_inn) = TRIM(u.inn)
        AND (p.user_id IS NULL OR p.user_id <> u.user_id)
    `;
    const r2 = await client.query(linkSql);
    console.log(`🔗 Procurements linked to users: ${r2.rowCount}`);

    await client.query('COMMIT');
    console.log('✅ Done');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', e.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
