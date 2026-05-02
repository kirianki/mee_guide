from celery import Celery
from celery.schedules import crontab
import os

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

app = Celery("webguide-crawler", broker=REDIS_URL, backend=REDIS_URL)

app.conf.beat_schedule = {
    # Nightly SII change detection — runs at 02:00 UTC
    "nightly-sii-crawl": {
        "task": "app.tasks.crawl.run_nightly_crawl",
        "schedule": crontab(hour=2, minute=0),
    },
}

app.conf.timezone = "UTC"
app.autodiscover_tasks(["app.tasks"])
