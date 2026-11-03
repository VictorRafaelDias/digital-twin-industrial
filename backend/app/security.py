"""Senhas (PBKDF2-SHA256 com sal) e tokens de login (JWT HS256), só com a biblioteca padrão do Python."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Optional

ITERACOES = 100_000


def hash_senha(senha: str, sal: Optional[str] = None) -> str:
    """Mesmo formato do banco de dados: pbkdf2_sha256$iteracoes$sal$hash (nunca guardamos a senha em texto)."""
    sal = sal or secrets.token_hex(8)
    dk = hashlib.pbkdf2_hmac("sha256", senha.encode(), sal.encode(), ITERACOES)
    return f"pbkdf2_sha256${ITERACOES}${sal}${base64.b64encode(dk).decode()}"


def confere_senha(senha: str, guardado: str) -> bool:
    try:
        algoritmo, iteracoes, sal, esperado = guardado.split("$")
        if algoritmo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", senha.encode(), sal.encode(), int(iteracoes))
        return hmac.compare_digest(base64.b64encode(dk).decode(), esperado)
    except (ValueError, TypeError):
        return False


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def criar_token(user_id: int, usuario: str, chave: str, minutos: int) -> str:
    cab = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    corpo = _b64(json.dumps({"sub": user_id, "usr": usuario, "exp": int(time.time()) + minutos * 60}, separators=(",", ":")).encode())
    assin = _b64(hmac.new(chave.encode(), f"{cab}.{corpo}".encode(), hashlib.sha256).digest())
    return f"{cab}.{corpo}.{assin}"


def ler_token(token: str, chave: str) -> Optional[dict]:
    """Devolve os dados do token, ou None se for inválido, adulterado ou vencido."""
    try:
        cab, corpo, assin = token.split(".")
        esperada = _b64(hmac.new(chave.encode(), f"{cab}.{corpo}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(assin, esperada):
            return None
        dados = json.loads(_unb64(corpo))
        return dados if dados.get("exp", 0) > time.time() else None
    except (ValueError, TypeError, json.JSONDecodeError):
        return None
