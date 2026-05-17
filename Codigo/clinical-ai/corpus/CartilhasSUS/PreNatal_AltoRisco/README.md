# Corpus: pré-natal / alto risco (SUS)

This directory is the **default RAG corpus root** for the clinical API boilerplate (`RAG_CORPUS_DIR`).

## O que é indexado (nem “tudo” nem PDF automático)

1. **Só nesta pasta, na raiz (sem subpastas):**
   - `*.md`
   - `*.txt`
   - `*.jsonl` (uma linha JSON por documento com `id`, `title`, `text`, opcional `meta`)

2. **Excluído de propósito**
   - `README.md` (este ficheiro e qualquer homónimo são ignorados)
   - `.*` ocultos
   - **PDF, Word, etc.** — este diretório **não** indexa PDFs/DOCX; converta para `.md`/`.txt` ou ingestão via `jsonl`.
     - Para indexar PDFs/DOCX no boilerplate, use `CartilhasSUS/` (controlado por `RAG_CARTILHAS_DIR`), que extrai texto no arranque da API.

3. **Além da pasta**, o índice agrega sempre que existir no disco:
   - `RAG_BENCHMARK_CSV` (predef.: `ollama/bench/prenatal_sus_benchmark.csv`) — cada linha é um texto recuperável (“pergunta + resumo”), com `question_id` estilo **Q025**; não carrega PDFs das cadernetas.

Os PDFs citados no benchmark (ex. `GestacaoAltoRisco_2010.pdf`, `CadernetaGestante_8ed_rev_2024.pdf`) **não vêm neste repo** como ficheiros: o texto que aparece associado ao título nos excertos vem do **CSV sintético**/notas até você colocar extrações reais aqui como `.md`.

## Como adicionar, retirar ou atualizar ficheiros

1. Grave ou apague `.md`, `.txt` ou `.jsonl` na **raiz** desta pasta (ou altere variáveis de ambiente conforme [`../README.md`](../README.md)).
2. **Reconstruir o índice:** no arranque da API corre `build_index()` (lifecycle FastAPI). Após só mudar dados **sem** alterar código, é preciso **reiniciar o processo uvicorn** (ex. parar e subir de novo ou gravar um ficheiro `.py` se usar `--reload`; mudar apenas `.md` **não** dispara `--reload`).
3. Confirme com `GET /v1/rag/stats` (número de chunks, modo embedding vs lexical).

## Embedding usado (`RAG_EMBEDDING_MODEL`)

- **Default:** `nomic-embed-text` via **`POST`** Ollama **`/api/embeddings`** (`app/embeddings.py`).

```bash
ollama pull nomic-embed-text
```

- **Porquê:** mantém embeddings **no mesmo daemon** que já serve o modelo de chat (`OLLAMA_*`), sem chave SaaS nem serviço extra — ideal para bancada/offline neste projeto.
- Se o modelo não existir ou a chamada falhar, o código cai para **retrieve lexical** (sobreposição de tokens sobre os mesmos chunks).

## Vector DB

- **Nenhum.** O índice é **lista em memória** (camada `app/retrieval/`), com ordenação por similaridade a cada pedido (`retrieve`) e reranking MMR opcional.
- **Porquê:** simplicidade e zero dependências de Pinecone/pgvector/etc. no sandbox; troque em `rag.py` + ingestão quando for para produção com milhões de vetores ou persistência partilhada.

## Motor de agentes

- **Nenhum framework** (LangGraph, CrewAI, AutoGen, …). Fluxo determinístico no FastAPI (**de-ID stub → retrieve → montar mensagens → um modelo Ollama**), opcionalmente com **várias voltas** `chat ↔ ferramentas` em `app/orchestrator.py` capadas por `TOOL_LOOP_MAX_ROUNDS`.
- **Porquê:** um só LLM + ferramentas explícitas (stub RAG/tool, SQL só-leitura) é suficiente para prototipagem e económico em hardware limitado sem orquestração extra.
