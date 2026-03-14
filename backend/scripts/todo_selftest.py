import random
import string
import sys
from datetime import UTC, datetime
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from main import app


def _rand_username(prefix: str = "u") -> str:
    """生成随机用户名，避免与现有数据冲突。"""
    return prefix + "".join(random.choices(string.ascii_lowercase + string.digits, k=10))


def _run() -> int:
    """执行 ToDo 冒烟测试：创建任务→更新→记录专注→校验累计→软删除。"""
    username = _rand_username()
    password = "P@ssw0rd!" + "".join(random.choices(string.ascii_letters, k=8))

    with TestClient(app) as c:
        r = c.post("/auth/register", json={"username": username, "password": password})
        if r.status_code != 200:
            print("register failed:", r.status_code, r.text)
            return 1

        r = c.post("/auth/login", json={"username": username, "password": password})
        if r.status_code != 200:
            print("login failed:", r.status_code, r.text)
            return 1
        token = (r.json() or {}).get("access_token")
        if not token:
            print("missing token:", r.text)
            return 1

        headers = {"Authorization": f"Bearer {token}"}

        r = c.post(
            "/todo/tasks",
            headers=headers,
            json={
                "title": "test task",
                "content": "hello",
                "category": "学习",
                "status": "todo",
                "priority": 2,
                "target_duration": 1500,
            },
        )
        if r.status_code != 200:
            print("create task failed:", r.status_code, r.text)
            return 1
        task = r.json() or {}
        task_id = task.get("id")
        if not task_id:
            print("missing task id:", r.text)
            return 1

        r = c.get("/todo/tasks", headers=headers)
        if r.status_code != 200:
            print("list tasks failed:", r.status_code, r.text)
            return 1
        tasks = r.json() or []
        if not any(t.get("id") == task_id for t in tasks):
            print("task not found in list:", r.text)
            return 1

        r = c.patch("/todo/tasks/" + task_id, headers=headers, json={"status": "doing"})
        if r.status_code != 200:
            print("patch task failed:", r.status_code, r.text)
            return 1
        if (r.json() or {}).get("status") != "doing":
            print("unexpected status after patch:", r.text)
            return 1

        start = datetime.now(UTC)
        r = c.post(
            "/todo/tasks/" + task_id + "/focus-logs",
            headers=headers,
            json={"duration": 120, "start_time": start.isoformat()},
        )
        if r.status_code != 200:
            print("create focus log failed:", r.status_code, r.text)
            return 1

        # 开始专注 → 查询当前专注 → 结束专注
        r = c.post(f"/todo/tasks/{task_id}/focus/start", headers=headers)
        if r.status_code != 200:
            print("start focus failed:", r.status_code, r.text)
            return 1
        started = r.json() or {}
        if started.get("end_at") is not None:
            print("start focus should have end_at = null", r.text)
            return 1
        if started.get("task_id") != task_id:
            print("start focus task mismatch", r.text)
            return 1

        r = c.get("/todo/focus/current", headers=headers)
        if r.status_code != 200:
            print("get current focus failed:", r.status_code, r.text)
            return 1
        current = r.json() or {}
        if current.get("task_id") != task_id or current.get("end_at") is not None:
            print("unexpected current focus payload", r.text)
            return 1
        if int(current.get("duration") or 0) < 0:
            print("current focus duration invalid", r.text)
            return 1

        r = c.post("/todo/focus/stop", headers=headers)
        if r.status_code != 200:
            print("stop focus failed:", r.status_code, r.text)
            return 1
        stopped = r.json() or {}
        if stopped.get("end_at") is None or int(stopped.get("duration") or 0) < 0:
            print("stop focus payload invalid", r.text)
            return 1

        r = c.get("/todo/tasks/" + task_id, headers=headers)
        if r.status_code != 200:
            print("get task failed:", r.status_code, r.text)
            return 1
        # 校验累计时长至少包含固定记录的 120 秒与进行中专注的时长
        if int((r.json() or {}).get("actual_duration") or 0) < 120:
            print("actual_duration not updated:", r.text)
            return 1

        r = c.get("/todo/tasks/" + task_id + "/focus-logs", headers=headers)
        if r.status_code != 200:
            print("list focus logs failed:", r.status_code, r.text)
            return 1
        logs = r.json() or []
        if not logs:
            print("missing focus logs:", r.text)
            return 1

        r = c.delete("/todo/tasks/" + task_id, headers=headers)
        if r.status_code != 200:
            print("delete task failed:", r.status_code, r.text)
            return 1

        r = c.get("/todo/tasks", headers=headers)
        if r.status_code != 200:
            print("list tasks after delete failed:", r.status_code, r.text)
            return 1
        tasks = r.json() or []
        if any(t.get("id") == task_id for t in tasks):
            print("deleted task still visible:", r.text)
            return 1

        r = c.get("/todo/tasks", headers=headers, params={"include_deleted": "true"})
        if r.status_code != 200:
            print("list tasks include_deleted failed:", r.status_code, r.text)
            return 1
        tasks = r.json() or []
        if not any(t.get("id") == task_id for t in tasks):
            print("deleted task missing when include_deleted:", r.text)
            return 1

        print("ok")
        return 0


if __name__ == "__main__":
    raise SystemExit(_run())
