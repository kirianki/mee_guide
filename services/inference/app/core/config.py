from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    REDIS_URL: str
    OPENAI_API_KEY: str
    ANTHROPIC_API_KEY: str
    LOG_LEVEL: str = "info"
    ENVIRONMENT: str = "development"


settings = Settings()
