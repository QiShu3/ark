"""Sub-app: 模板子应用"""
from .routes import router


async def init_test_template(pool):
    from .repository import init_tables
    await init_tables(pool)
