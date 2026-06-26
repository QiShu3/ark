import { useCallback, useEffect, useRef, useState } from 'react';

import type { Appointment, Task } from '../components/taskTypes';
import { apiJson } from '../lib/api';
import { getEventWorkbench } from '../lib/events/api';

type UseEventArrangementsResult = {
  tasks: Task[];
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

export function useEventArrangements(eventId: string | null): UseEventArrangementsResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable fetch key to trigger re-fetch when eventId changes
  const fetchId = useRef(0);

  const fetch = useCallback(async () => {
    const id = ++fetchId.current;
    setLoading(true);
    setError(null);

    try {
      if (eventId) {
        const workbench = await getEventWorkbench(eventId);
        if (id !== fetchId.current) return;
        setTasks(Array.isArray(workbench.created_tasks) ? workbench.created_tasks : []);
        setAppointments(Array.isArray(workbench.created_appointments) ? workbench.created_appointments : []);
      } else {
        const [tasksRes, appointmentsRes] = await Promise.all([
          apiJson<Task[]>('/todo/tasks?limit=100'),
          apiJson<Appointment[]>('/todo/appointments'),
        ]);
        if (id !== fetchId.current) return;
        setTasks(Array.isArray(tasksRes) ? tasksRes : []);
        setAppointments(Array.isArray(appointmentsRes) ? appointmentsRes : []);
      }
    } catch (err) {
      if (id !== fetchId.current) return;
      setError(err instanceof Error ? err.message : '加载任务失败');
    } finally {
      if (id === fetchId.current) setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  return { tasks, appointments, loading, error, refetch: fetch };
}
