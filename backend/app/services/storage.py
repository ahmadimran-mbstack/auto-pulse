"""Object storage abstraction for AutoPulse customization documents.
Supports local filesystem (dev/test) and S3/Cloudflare R2 (production).
"""

import logging
from pathlib import Path
from typing import Optional, Protocol

from app.core.config import settings

logger = logging.getLogger(__name__)


class StorageError(RuntimeError):
    """Raised when an object storage operation fails."""


class StorageBackend(Protocol):
    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...
    def presigned_get(
        self, key: str, expires_in: int = 300, filename: Optional[str] = None
    ) -> Optional[str]: ...
    def delete_prefix(self, prefix: str) -> int: ...


class LocalStorageBackend:
    """Local disk backend for development and tests."""

    def __init__(self, root_dir: str):
        self.root = Path(root_dir).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _resolve_key(self, key: str) -> Path:
        clean = key.lstrip("/").replace("\\", "/")
        target = (self.root / clean).resolve()
        if not str(target).startswith(str(self.root)):
            raise StorageError("Invalid storage key path")
        return target

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        target = self._resolve_key(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def get(self, key: str) -> bytes:
        target = self._resolve_key(key)
        if not target.exists():
            raise StorageError(f"Object not found: {key}")
        return target.read_bytes()

    def delete(self, key: str) -> None:
        target = self._resolve_key(key)
        if target.exists():
            target.unlink()

    def presigned_get(
        self, key: str, expires_in: int = 300, filename: Optional[str] = None
    ) -> Optional[str]:
        return None

    def delete_prefix(self, prefix: str) -> int:
        base = self._resolve_key(prefix.rstrip("/"))
        if not base.exists():
            return 0
        count = 0
        for p in sorted(base.rglob("*"), reverse=True):
            if p.is_file():
                p.unlink()
                count += 1
            elif p.is_dir():
                try:
                    p.rmdir()
                except OSError:
                    pass
        try:
            base.rmdir()
        except OSError:
            pass
        return count


class S3StorageBackend:
    """S3 / Cloudflare R2 backend using boto3."""

    def __init__(
        self,
        bucket: str,
        endpoint_url: Optional[str],
        access_key_id: Optional[str],
        secret_access_key: Optional[str],
        region_name: str = "auto",
    ):
        import boto3
        from botocore.config import Config

        if not bucket or not access_key_id or not secret_access_key:
            raise StorageError("S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY are required for s3 storage")

        self.bucket = bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url or None,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name=region_name or "auto",
            config=Config(signature_version="s3v4"),
        )

    def put(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        try:
            self.client.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=data,
                ContentType=content_type,
            )
        except Exception as exc:
            raise StorageError(f"Failed to upload object {key}: {exc}") from exc

    def get(self, key: str) -> bytes:
        try:
            resp = self.client.get_object(Bucket=self.bucket, Key=key)
            return resp["Body"].read()
        except Exception as exc:
            raise StorageError(f"Failed to read object {key}: {exc}") from exc

    def delete(self, key: str) -> None:
        try:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            logger.warning(f"Best-effort S3 delete failed for {key}: {exc}")

    def presigned_get(
        self, key: str, expires_in: int = 300, filename: Optional[str] = None
    ) -> Optional[str]:
        params = {"Bucket": self.bucket, "Key": key}
        if filename:
            safe_name = filename.replace('"', "")
            params["ResponseContentDisposition"] = f'attachment; filename="{safe_name}"'
        else:
            params["ResponseContentDisposition"] = "attachment"
        try:
            return self.client.generate_presigned_url(
                "get_object", Params=params, ExpiresIn=expires_in
            )
        except Exception as exc:
            raise StorageError(f"Failed to generate presigned URL for {key}: {exc}") from exc

    def delete_prefix(self, prefix: str) -> int:
        deleted = 0
        try:
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                objects = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
                if objects:
                    self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": objects})
                    deleted += len(objects)
        except Exception as exc:
            logger.warning(f"Best-effort S3 delete_prefix failed for {prefix}: {exc}")
        return deleted


_STORAGE_INSTANCE: Optional[StorageBackend] = None


def get_storage_backend() -> StorageBackend:
    global _STORAGE_INSTANCE
    if _STORAGE_INSTANCE is not None:
        return _STORAGE_INSTANCE

    if settings.STORAGE_BACKEND == "s3":
        _STORAGE_INSTANCE = S3StorageBackend(
            bucket=settings.S3_BUCKET or "",
            endpoint_url=settings.S3_ENDPOINT_URL,
            access_key_id=settings.S3_ACCESS_KEY_ID,
            secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
        )
    else:
        _STORAGE_INSTANCE = LocalStorageBackend(settings.STORAGE_LOCAL_DIR)
    return _STORAGE_INSTANCE


def reset_storage_backend_for_tests(backend: Optional[StorageBackend] = None) -> None:
    global _STORAGE_INSTANCE
    _STORAGE_INSTANCE = backend
