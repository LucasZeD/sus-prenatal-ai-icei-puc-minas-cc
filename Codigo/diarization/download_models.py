"""Pré-download dos modelos pyannote em BUILD TIME (cache na imagem/volume).

Usa o token HF apenas durante o build (via BuildKit secret -> env HF_TOKEN).
Em runtime o serviço roda com HF_HUB_OFFLINE=1 e consome este cache.
"""

from __future__ import annotations

import os
import sys


def main() -> int:
    model = os.getenv("DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1")
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_TOKEN")
    if not token:
        print("download_models: HF_TOKEN ausente; pulando pré-download.", file=sys.stderr)
        return 1
    try:
        from pyannote.audio import Pipeline

        # from_pretrained baixa segmentation + embedding e popula o cache (HF_HOME).
        Pipeline.from_pretrained(model, use_auth_token=token)
        print(f"download_models: '{model}' cacheado com sucesso.")
        return 0
    except Exception as e:  # noqa: BLE001
        print(f"download_models: falha ao baixar '{model}': {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
