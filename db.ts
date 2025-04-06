import { Client, QueryResultRow } from 'pg';

export async function db_query<T extends QueryResultRow = any>(
 query: string,
 values?: any[]
):Promise<T[]> {
  try {
    const client = new Client({
      user: 'postgres',
      host: 'localhost',
      database: 'postgres',
      password: 'postgresXOLOKOCT',
      port: 5432,
    });  
    await client.connect();
    const result = await client.query<T>(query, values || []);
    return result.rows;  
  } catch (err) {
    console.error('Query error:', err);
    throw err; // Пробрасываем ошибку для обработки в вызывающем коде
  }
}