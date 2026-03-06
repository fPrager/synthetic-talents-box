import express from 'express'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ?? 3000

app.use(express.json())

// SSE clients
const clients = new Set()

// Serve the UI
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'))
})

// SSE stream — browser subscribes here
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  clients.add(res)
  req.on('close', () => clients.delete(res))
})

// Receive hook POSTs from OpenClaw
app.post('/agent-event', (req, res) => {
  const event = {
    ...req.body,
    receivedAt: new Date().toISOString(),
  }

  console.log('[hook]', event)

  const data = `data: ${JSON.stringify(event)}\n\n`
  for (const client of clients) {
    client.write(data)
  }

  res.sendStatus(200)
})

app.listen(PORT, () => {
  console.log(`talent-hooker-debug running at http://localhost:${PORT}`)
})
