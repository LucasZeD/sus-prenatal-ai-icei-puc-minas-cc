import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { assertDatabaseUrlNotPlaceholder } from "./lib/env/assertDatabaseUrl.js";

/**
 * `backend/.env` primeiro, depois `Codigo/.env` com override — o arquivo da raiz do projeto
 * prevalece (evita `DATABASE_URL` com USUARIO:SENHA vinda de um `.env` local na pasta backend).
 */
const backendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(backendRoot, ".env") });
config({ path: path.join(backendRoot, "..", ".env"), override: true });

assertDatabaseUrlNotPlaceholder();
