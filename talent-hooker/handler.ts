export async function handler(event) {
  try {
    await fetch('http://localhost:3000/agent-event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionKey: event.sessionKey,
        type: event.type,
        timestamp: event.timestamp,
      }),
    })
  } catch {
    // Bridge not running — silently ignore, poll will cover it
  }
}
