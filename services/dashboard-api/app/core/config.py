from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_ENDPOINT_URL: str
    AWS_REGION: str = "us-east-1"
    MINIO_BUCKET: str = "webguide"
    DASHBOARD_ORIGIN: str = "http://localhost:3000"
    LOG_LEVEL: str = "info"
    ENVIRONMENT: str = "development"


settings = Settings()
