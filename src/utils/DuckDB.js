import * as duckdb from "@duckdb/duckdb-wasm";

async function init() {
  const CDN_BUNDLES = duckdb.getJsDelivrBundles(),
    bundle = await duckdb.selectBundle(CDN_BUNDLES), // Select a bundle based on browser checks
    worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], {
        type: "text/javascript"
      })
    );

  const worker = new Worker(worker_url);
  const logger = new duckdb.ConsoleLogger("DEBUG");
  const db = new duckdb.AsyncDuckDB(logger, worker);

  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);

  return db;
}

class DuckDBClient {
  constructor(_db = null) {
    if (_db !== null) {
      this._db = _db;
    }
  }

  async db() {
    if (!this._db) {
      this._db = await init();
    }
    return this._db;
  }

  async connect(db) {
    return db.connect();
  }

  async version() {
    const db = await this.db();
    return await db.getVersion();
  }

  async query(sql) {
    const db = await this.db();
    const conn = await this.connect(db);
    const results = await conn.query(sql);

    const rows = {
      values: results.toArray().map((row) => row.toJSON()),
      columns: results.schema.fields.map((d) => d.name),
    };

    return rows;
  }

  async createTableFromContent(tableName, content) {
    const db = await this.db();
    const conn = await this.connect(db);
    await db.registerFileText(
      `${tableName}.json`,
      JSON.stringify(content),
    );
    await this.query(`DROP TABLE IF EXISTS ${tableName}`);
    return await conn.insertJSONFromPath(`${tableName}.json`, { name: tableName });
  }

  async loadTables(db, sql) {
    await this.query(db, "CREATE TABLE IF NOT EXISTS area AS SELECT * FROM read_parquet('https://storage.googleapis.com/public-md/eu_area.parquet')");
    await this.query(db, "CREATE TABLE IF NOT EXISTS population AS SELECT * FROM read_parquet('https://storage.googleapis.com/public-md/eu_population.parquet')");
  }
}

export default DuckDBClient;

// export default {
//   version: async () => {
//     const db = await init();
//     return await db.getVersion();
//   },
//   query: async () => {
//     const db = await init();
//   }
// }