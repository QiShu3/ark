import asyncio

import asyncpg


async def main():
    try:
        pool = await asyncpg.create_pool("postgresql://postgres:140423@localhost:5432/ark")
        # get first user and first profile
        async with pool.acquire() as conn:
            user = await conn.fetchrow("SELECT id FROM auth_users LIMIT 1")
            if not user:
                print("No user")
                return
            user_id = user["id"]

            profile = await conn.fetchrow("SELECT id FROM flow_profiles WHERE user_id = $1 LIMIT 1", user_id)
            if not profile:
                print("No profile")
                return
            profile_id = profile["id"]

            print(f"Setting profile {profile_id} for user {user_id} to default...")

            # test the logic
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT id FROM flow_profiles WHERE id = $1 AND user_id = $2",
                    profile_id, user_id
                )
                if not row:
                    print("Not found")
                    return

                await conn.execute(
                    "UPDATE flow_profiles SET is_default = FALSE WHERE user_id = $1",
                    user_id
                )

                await conn.execute(
                    "UPDATE flow_profiles SET is_default = TRUE, updated_at = NOW() WHERE id = $1 AND user_id = $2",
                    profile_id, user_id
                )
                print("Success")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(main())
