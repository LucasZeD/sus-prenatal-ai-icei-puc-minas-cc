-- Adiciona o tipo de evento de stream para transcricao com rotulo de locutor (diarizacao).
-- Payload em consulta_stream_evento.payload = JSON [{ "speaker", "role", "text" }] (texto ja sanitizado).
ALTER TYPE "ConsultaStreamEventoTipo" ADD VALUE IF NOT EXISTS 'TRANSCRICAO_DIARIZADA';
