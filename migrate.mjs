import mysql from "mysql2/promise";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
dotenv.config();

const uri = (process.env.DATABASE_URL || "").replace(/[?&]ssl-mode=[^&]*/i, "").replace(/\?$/, "");
const conn = await mysql.createConnection({ uri, ssl: { rejectUnauthorized: false } });

const sqlDir = "./drizzle";
const sqlFiles = readdirSync(sqlDir)
  .filter(f => f.endsWith(".sql"))
  .sort();

for (const file of sqlFiles) {
  console.log(`\n[migrate] Running ${file}`);
  const sql = readFileSync(join(sqlDir, file), "utf-8");
  const statements = sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    try {
      await conn.execute(stmt);
      console.log("  ✓", stmt.slice(0, 60).replace(/\n/g, " "));
    } catch (e) {
      if (e.code === "ER_TABLE_EXISTS_ERROR" || e.code === "ER_DUP_KEYNAME") {
        console.log("  skip (exists):", stmt.slice(0, 60).replace(/\n/g, " "));
      } else {
        console.error("  ✗", e.message);
      }
    }
  }
}

await conn.end();
console.log("\nMigration complete.");
