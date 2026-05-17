"""MMR reranking (from reference project)."""

from __future__ import annotations

from collections.abc import Callable, Sequence


def mmr_select_indices(
    relevance: Sequence[tuple[int, float]],
    *,
    pair_similarity: Callable[[int, int], float],
    lambda_mult: float,
    k_out: int,
) -> list[tuple[int, float]]:
    lam = max(0.05, min(0.95, float(lambda_mult)))
    k_take = max(0, min(k_out, len(relevance)))
    if k_take == 0:
        return []

    cand = {idx for idx, _ in relevance}
    rel_map = dict(relevance)
    chosen: list[tuple[int, float]] = []
    chosen_idx: set[int] = set()

    while len(chosen) < k_take and cand:
        best_i: int | None = None
        best_mm: float | None = None
        for i in sorted(cand, key=lambda x: (-float(rel_map.get(x, 0.0)), x)):
            r = float(rel_map.get(i, 0.0))
            if not chosen_idx:
                mm = r
            else:
                max_sim = max(pair_similarity(i, j) for j in chosen_idx)
                mm = lam * r - (1.0 - lam) * max_sim
            if best_mm is None or mm > best_mm:
                best_mm = mm
                best_i = i
        if best_i is None or best_mm is None:
            break
        chosen.append((best_i, float(best_mm)))
        chosen_idx.add(best_i)
        cand.remove(best_i)

    return chosen


def rerank_candidate_indices(
    scored_pool: list[tuple[int, float]],
    *,
    pair_similarity: Callable[[int, int], float],
    out_k: int,
    rerank_enabled: bool,
    mmr_lambda: float,
) -> list[tuple[int, float]]:
    k_take = max(1, min(out_k, len(scored_pool)))
    head = scored_pool[:k_take]
    if not rerank_enabled or len(scored_pool) <= 1:
        return [(i, float(s)) for i, s in head]

    return mmr_select_indices(
        scored_pool,
        pair_similarity=pair_similarity,
        lambda_mult=mmr_lambda,
        k_out=k_take,
    )
