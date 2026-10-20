from cryptography.fernet import Fernet
from app.core.config import settings

# DAY 6: support key rotation with MultiFernet


def _get_fernet() -> Fernet:
    # Build Fernet cipher using the configured symmetric encryption key
    key = settings.TOKEN_ENCRYPTION_KEY.strip().encode("utf-8")
    return Fernet(key)


def encrypt_text(plain_text: str) -> str:
    # Encrypt plain text string and return an ASCII string safe for database storage
    if not plain_text:
        return ""
    fernet = _get_fernet()
    token_bytes = fernet.encrypt(plain_text.encode("utf-8"))
    return token_bytes.decode("utf-8")


def decrypt_text(cipher_text: str) -> str:
    # Decrypt stored ciphertext string and return original plain text string
    if not cipher_text:
        return ""
    fernet = _get_fernet()
    plain_bytes = fernet.decrypt(cipher_text.encode("utf-8"))
    return plain_bytes.decode("utf-8")
