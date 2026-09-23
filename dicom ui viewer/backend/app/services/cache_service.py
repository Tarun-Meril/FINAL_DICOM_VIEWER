import logging
import json
from app.config.config import settings

logger = logging.getLogger("medview_pro.cache_service")

class CacheService:
    def __init__(self):
        self.redis_client = None
        self.local_cache = {}
        try:
            import redis
            redis_url = settings.REDIS_URL or settings.CELERY_BROKER_URL
            if redis_url:
                self.redis_client = redis.Redis.from_url(
                    redis_url,
                    socket_timeout=0.5,
                    decode_responses=True
                )
            else:
                self.redis_client = redis.Redis(
                    host=settings.REDIS_HOST,
                    port=settings.REDIS_PORT,
                    db=settings.REDIS_DB,
                    socket_timeout=0.5,
                    decode_responses=True
                )
            self.redis_client.ping()
            logger.info("Connected to Redis cache successfully.")
        except Exception as e:
            self.redis_client = None
            logger.warning(f"Could not connect to Redis: {e}. Falling back to local in-memory dictionary cache.")

    def get(self, key: str):
        if self.redis_client:
            try:
                val = self.redis_client.get(key)
                if val:
                    return json.loads(val)
            except Exception as e:
                logger.error(f"Redis get failed: {e}")
        return self.local_cache.get(key)

    def set(self, key: str, value: any, expire: int = 3600):
        if self.redis_client:
            try:
                self.redis_client.set(key, json.dumps(value), ex=expire)
                return
            except Exception as e:
                logger.error(f"Redis set failed: {e}")
        self.local_cache[key] = value

    def delete(self, key: str):
        if self.redis_client:
            try:
                self.redis_client.delete(key)
                return
            except Exception as e:
                logger.error(f"Redis delete failed: {e}")
        self.local_cache.pop(key, None)

cache_service = CacheService()
