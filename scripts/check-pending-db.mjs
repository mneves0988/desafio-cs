import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000
});

try {
  const result = await pool.query(`
    SELECT
      current_database() AS database_name,
      to_regclass('public.agent_pending_cancellations') AS tabela
  `);

  console.log("Banco:", result.rows[0].database_name);
  console.log("Tabela:", result.rows[0].tabela ?? "AUSENTE");

  await pool.query(`
    SELECT order_id
    FROM public.agent_pending_cancellations
    WHERE session_key = $1 AND expires_at > NOW()
  `, ["cli:demo-user-1"]);

  console.log("Consulta de confirmacoes: OK");
} catch (error) {
  console.error("Erro PostgreSQL:", error.code ?? error.name);
  process.exitCode = 1;
} finally {
  await pool.end();
}
