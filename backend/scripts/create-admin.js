const { Client } = require('pg');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  const client = new Client({
    connectionString: 'postgres://byte:e6eutbdz5aet4jscq69y@179.198.113.136:5432/byte?sslmode=disable'
  });

  try {
    await client.connect();
    
    // Create tenant
    const tenantRes = await client.query(
      `INSERT INTO tenants (name, slug, plan, max_users) VALUES ($1, $2, 'enterprise', 50) RETURNING id`,
      ['Byte Force', 'byte-force']
    );
    const tenantId = tenantRes.rows[0].id;

    // Hash password
    const hash = await bcrypt.hash('SenhaSegura123!', 10);

    // Create user
    await client.query(
      `INSERT INTO users (tenant_id, email, password_hash, full_name, role) VALUES ($1, $2, $3, $4, 'owner')`,
      [tenantId, 'moreiraxxz10@gmail.com', hash, 'Administrador']
    );

    console.log('✅ Usuário criado com sucesso no banco!');
  } catch (err) {
    if (err.code === '23505') {
      console.log('⚠️ Usuário ou Tenant já existe no banco!');
    } else {
      console.error('Erro:', err);
    }
  } finally {
    await client.end();
  }
}

createAdmin();
