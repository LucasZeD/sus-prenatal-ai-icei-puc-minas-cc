# Cartilhas SUS — corpus para RAG

Coloque aqui **`.pdf`**, **`.docx`**, **`.md`**, **`.txt`** ou **`.jsonl`** (subpastas permitidas). Ficheiros `README.md` sao ignorados na indexacao.

## Pipeline

1. **Ingestão** (`build_index` ao subir a API ou `POST /rag/test/rebuild`): `gather_documents` le os ficheiros, `chunk_text` corta troços (por defeito ~1650 caracteres com overlap ~120 — `RAG_CHUNK_MAX_CHARS` / `RAG_CHUNK_OVERLAP`), **Ollama** gera embeddings em lote quando `nomic-embed-text` (ou `RAG_EMBEDDING_MODEL`) está disponível. **Ao alterar o tamanho do chunk**, é obrigatório **rebuild com `force=true`** para voltar a incorporar o corpus.
2. **Vector store (SQLite)** em `data/rag_store.sqlite` por defeito (ou `RAG_VECTOR_STORE_PATH`): guarda texto + blobs de embedding + *fingerprint* do corpus. Ao reiniciar, se o corpus não mudou, o serviço **carrega vetores da base** (`sqlite_load_ms` nos timings).
3. **Consulta**: embedding da query (modo densão) ou *lexical* se embeddings falharem; **pool top-N** (`RAG_RERANK_POOL_SIZE`); **MMR** sobre o pool (`RAG_RERANK_ENABLED`, `RAG_MMR_LAMBDA`). Opcionalmente, com `RAG_QUERY_EXPAND_ENABLED=true` (ou `expand_query` no JSON em `/rag/test/query`), o **modelo de chat** (`OLLAMA_MODEL`) acrescenta **termos de busca** à pergunta antes do embedding. Métricas em `rag_timing_ms` na primeira linha NDJSON (`type=pipeline`) e em `POST /rag/test/query`.

## Variáveis (clinical-ai)

- `RAG_CORPUS_DIR` — raíz do corpus (Compose default: esta pasta dentro da imagem).
- `RAG_VECTOR_STORE_PATH` — ficheiro SQLite para vetores persistidos.
- `RAG_DISABLE_VECTOR_STORE=true` — nunca ler/gravar SQLite (útil só em dev).
- `RAG_EXPORT_CHUNKS_JSONL` — opcional caminho onde gravar todos os chunks em JSONL após cada rebuild (auditoria).
- `POST /rag/test/rebuild?force=true` — força re-embed e atualiza SQLite.

## JSONL “gerado”

O formato JSONL de trechos pode ser emitido pela API em **export** (`RAG_EXPORT_CHUNKS_JSONL`): não deve ser editado à mão como “referência oficial”; mantenha o documento‑fonte (PDF/MD/DOCX) nesta hierarquia e deixe a ingestão recriar o snapshot.

### Metadados opcionais no `meta` (citações na Lívia)

Ao montar chunks (JSONL customizado ou extensões da ingestão), pode preencher no objeto **`meta`**:

- **`document_title`** — título do documento (ex.: nome longo legível).
- **`author`** — autor ou órgão emissor.
- **`publication_year`** ou **`year`** — ano de publicação (número ou string).

O runtime monta uma linha curta do tipo `ficheiro.pdf (título, autor, ano)`; se faltar título/autor/ano, usa só o nome do ficheiro.

