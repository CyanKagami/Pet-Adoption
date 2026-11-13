type NotificationChangeListener = () => void;

const listeners = new Set<NotificationChangeListener>();
let eventSource: EventSource | null = null;

function handleNotificationChange() {
  listeners.forEach((listener) => listener());
}

function subscribeToNotificationChanges(listener: NotificationChangeListener) {
  listeners.add(listener);

  if (!eventSource) {
    eventSource = new EventSource('/api/notifications/events');
    eventSource.addEventListener('notifications-changed', handleNotificationChange);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && eventSource) {
      eventSource.close();
      eventSource = null;
    }
  };
}

export { subscribeToNotificationChanges };
