from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ollama_base_url: str = Field(default="http://127.0.0.1:11434", validation_alias="OLLAMA_BASE_URL")
    ollama_model: str = Field(default="llama3.2", validation_alias="OLLAMA_MODEL")
    rag_embedding_model: str = Field(default="nomic-embed-text", validation_alias="RAG_EMBEDDING_MODEL")
    ollama_timeout_s: float = Field(default=120.0, validation_alias="OLLAMA_TIMEOUT_S")
    ollama_think: bool = Field(default=False, validation_alias="OLLAMA_THINK")

    rag_corpus_dir: str = Field(default="", validation_alias="RAG_CORPUS_DIR")
    rag_vector_store_path: str = Field(default="", validation_alias="RAG_VECTOR_STORE_PATH")
    rag_disable_vector_store: bool = Field(default=False, validation_alias="RAG_DISABLE_VECTOR_STORE")
    rag_export_chunks_jsonl: str = Field(
        default="",
        validation_alias="RAG_EXPORT_CHUNKS_JSONL",
        description="Optional path: after build_index, write chunks as JSONL (debug / audit). Relative to clinical-ai package root if not absolute.",
    )
    rag_chunk_max_chars: int = Field(default=1650, validation_alias="RAG_CHUNK_MAX_CHARS")
    rag_chunk_overlap: int = Field(default=120, validation_alias="RAG_CHUNK_OVERLAP")
    rag_embed_max_chars: int = Field(default=8000, validation_alias="RAG_EMBED_MAX_CHARS")
    rag_query_max_chars: int = Field(default=2000, validation_alias="RAG_QUERY_MAX_CHARS")
    rag_max_chunks: int = Field(default=6, validation_alias="RAG_MAX_CHUNKS")
    rag_max_chars_per_chunk: int = Field(default=2400, validation_alias="RAG_MAX_CHARS_PER_CHUNK")
    rag_rerank_enabled: bool = Field(default=True, validation_alias="RAG_RERANK_ENABLED")
    rag_rerank_pool_size: int = Field(default=24, validation_alias="RAG_RERANK_POOL_SIZE")
    rag_mmr_lambda: float = Field(default=0.72, validation_alias="RAG_MMR_LAMBDA")
    rag_recency_weight: float = Field(default=0.35, validation_alias="RAG_RECENCY_WEIGHT")
    rag_query_expand_enabled: bool = Field(default=False, validation_alias="RAG_QUERY_EXPAND_ENABLED")
    rag_query_expand_max_tokens: int = Field(default=220, validation_alias="RAG_QUERY_EXPAND_MAX_TOKENS")
    rag_query_expand_max_out_chars: int = Field(default=450, validation_alias="RAG_QUERY_EXPAND_MAX_OUT_CHARS")

    mcp_chat_max_tokens: int = Field(
        default=1024,
        validation_alias="MCP_CHAT_MAX_TOKENS",
        description="Ollama num_predict base; with think=ON adds MCP_CHAT_THINK_EXTRA and floor, then MCP_CHAT_THINK_MAX_PREDICT caps.",
    )
    mcp_chat_think_extra_tokens: int = Field(
        default=2048,
        validation_alias="MCP_CHAT_THINK_EXTRA_TOKENS",
        description="Added to MCP_CHAT_MAX_TOKENS when think=ON (shared num_predict).",
    )
    mcp_chat_think_num_predict_floor: int = Field(
        default=2048,
        validation_alias="MCP_CHAT_THINK_NUM_PREDICT_FLOOR",
        description="Minimum num_predict when think=ON (before cap); raise if resposta visivel vier vazia com Think.",
    )
    mcp_chat_think_max_predict: int = Field(
        default=8192,
        validation_alias="MCP_CHAT_THINK_MAX_PREDICT",
        description="Hard cap on num_predict when think=ON; evita loops longos no thinking que esgotam tokens.",
    )

    gemini_api_key: str = Field(default="", validation_alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.0-flash", validation_alias="GEMINI_MODEL")
    gemini_timeout_s: float = Field(default=120.0, validation_alias="GEMINI_TIMEOUT_S")


@lru_cache
def get_settings() -> Settings:
    return Settings()
