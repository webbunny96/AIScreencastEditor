"""
Application configuration
Separate module to avoid circular imports
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from .env file"""
    NVIDIA_API_KEY: str = ""
    NVIDIA_BASE_URL: str = "https://integrate.api.nvidia.com/v1"
    LLM_MODEL: str = "meta/llama-3.1-70b-instruct"
    WHISPER_MODEL: str = "base"
    UPLOAD_DIR: str = "./data/uploads"
    EXPORT_DIR: str = "./data/exports"
    MAX_UPLOAD_SIZE: int = 2 * 1024 * 1024 * 1024  # 2GB

    class Config:
        env_file = ".env"


settings = Settings()