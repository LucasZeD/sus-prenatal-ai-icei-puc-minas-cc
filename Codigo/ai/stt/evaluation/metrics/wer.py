from jiwer import wer

def compute_wer(reference: str, hypothesis: str) -> float:
    """
    Calcula o Word Error Rate (WER).
    """
    if not reference or not hypothesis:
        return 1.0 if reference != hypothesis else 0.0
    return wer(reference, hypothesis)
