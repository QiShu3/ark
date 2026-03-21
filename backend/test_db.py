import asyncio

import asyncpg


async def main():
    pool = await asyncpg.create_pool("postgresql://postgres:140423@localhost:5432/ark")
    async with pool.acquire() as conn:
        print("Schema:")
        print(await conn.fetch("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'flow_profiles'"))
        print("Data:")
        print(await conn.fetch("SELECT * FROM flow_profiles"))

asyncio.run(main())
