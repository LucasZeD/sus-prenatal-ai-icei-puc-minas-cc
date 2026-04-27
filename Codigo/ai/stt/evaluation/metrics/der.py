from pyannote.metrics.diarization import DiarizationErrorRate
from pyannote.core import Annotation, Segment

def compute_der(reference_segments: list, hypothesis_segments: list) -> float:
    """
    Calcula o Diarization Error Rate (DER).
    Cada lista deve conter tuplas (start, end, speaker).
    """
    metric = DiarizationErrorRate()
    
    ref = Annotation()
    for s, e, spk in reference_segments:
        ref[Segment(s, e)] = spk
        
    hyp = Annotation()
    for s, e, spk in hypothesis_segments:
        hyp[Segment(s, e)] = spk
        
    return metric(ref, hyp)
