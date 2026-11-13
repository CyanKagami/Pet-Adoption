const subscribersByUser = new Map();

function subscribeToNotificationChanges(userId, response) {
  let subscribers = subscribersByUser.get(userId);
  if (!subscribers) {
    subscribers = new Set();
    subscribersByUser.set(userId, subscribers);
  }
  subscribers.add(response);

  response.on('close', () => {
    subscribers.delete(response);
    if (subscribers.size === 0) subscribersByUser.delete(userId);
  });
}

function publishNotificationChanged(userId) {
  const subscribers = subscribersByUser.get(userId);
  if (!subscribers) return;

  for (const response of subscribers) {
    if (response.destroyed || response.writableEnded) {
      subscribers.delete(response);
      continue;
    }
    response.write('event: notifications-changed\ndata: {}\n\n');
  }

  if (subscribers.size === 0) subscribersByUser.delete(userId);
}

module.exports = { publishNotificationChanged, subscribeToNotificationChanges };
