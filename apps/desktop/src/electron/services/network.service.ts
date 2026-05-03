import { EventEmitter } from 'events'
import { createHttpClient } from '@biztrack/http-client'
import { net } from 'electron'
import type { NetworkQuality, NetworkSnapshot } from '@biztrack/types'

type ProbeSample = {
  success: boolean
  latencyMs: number | null
}

const DEFAULT_API_URL = 'http://localhost:3001/api/v1'
const SAMPLE_LIMIT = 5
const PROBE_TIMEOUT_MS = 5_000

export class NetworkService extends EventEmitter {
  private _snapshot: NetworkSnapshot = {
    online: true,
    quality: 'strong',
    latencyMs: null,
    lastCheckedAt: null,
  }
  private checkInterval: NodeJS.Timeout | null = null
  private readonly httpClient = createHttpClient({
    timeout: PROBE_TIMEOUT_MS,
  })
  private readonly probeUrl: string
  private readonly samples: ProbeSample[] = []

  constructor(apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL) {
    super()
    const normalizedBase = apiBaseUrl.replace(/\/+$/, '')
    this.probeUrl = `${normalizedBase}/health`
  }

  start() {
    this.checkInterval = setInterval(() => {
      void this.refresh()
    }, 30_000)
    void this.refresh()
  }

  stop() {
    if (this.checkInterval) clearInterval(this.checkInterval)
  }

  get isOnline() {
    return this._snapshot.online
  }

  get quality() {
    return this._snapshot.quality
  }

  get snapshot(): NetworkSnapshot {
    return { ...this._snapshot }
  }

  async refresh() {
    const online = net.isOnline()

    if (!online) {
      this.pushSample({ success: false, latencyMs: null })
      this.updateSnapshot({
        online: false,
        quality: 'offline',
        latencyMs: null,
        lastCheckedAt: new Date().toISOString(),
      })
      return this.snapshot
    }

    const startedAt = Date.now()

    try {
      await this.httpClient.get(this.probeUrl)
      const latencyMs = Date.now() - startedAt
      const success = true
      this.pushSample({ success, latencyMs })

      this.updateSnapshot({
        online: true,
        quality: this.classifyQuality(),
        latencyMs,
        lastCheckedAt: new Date().toISOString(),
      })
    } catch {
      this.pushSample({ success: false, latencyMs: null })
      this.updateSnapshot({
        online: true,
        quality: this.classifyQuality(),
        latencyMs: null,
        lastCheckedAt: new Date().toISOString(),
      })
    }

    return this.snapshot
  }

  private pushSample(sample: ProbeSample) {
    this.samples.push(sample)
    if (this.samples.length > SAMPLE_LIMIT) {
      this.samples.shift()
    }
  }

  private classifyQuality(): NetworkQuality {
    if (this.samples.length === 0) {
      return this._snapshot.online ? 'fair' : 'offline'
    }

    const successes = this.samples.filter((sample) => sample.success)
    if (successes.length === 0) {
      return 'offline'
    }

    const failureRate = 1 - successes.length / this.samples.length
    const sortedLatencies = successes
      .map((sample) => sample.latencyMs)
      .filter((latency): latency is number => latency !== null)
      .sort((left, right) => left - right)

    const medianLatency =
      sortedLatencies[Math.floor(sortedLatencies.length / 2)] ?? this._snapshot.latencyMs ?? 9999

    let quality: NetworkQuality
    if (medianLatency < 150) {
      quality = 'very_strong'
    } else if (medianLatency < 350) {
      quality = 'strong'
    } else if (medianLatency < 900) {
      quality = 'fair'
    } else {
      quality = 'weak'
    }

    if (failureRate >= 0.5) {
      return 'weak'
    }

    if (failureRate >= 0.25 && quality === 'very_strong') {
      return 'strong'
    }

    if (failureRate >= 0.25 && quality === 'strong') {
      return 'fair'
    }

    return quality
  }

  private updateSnapshot(next: NetworkSnapshot) {
    const previous = this._snapshot
    this._snapshot = next

    if (previous.online !== next.online) {
      this.emit('change', next.online)
    }

    if (previous.quality !== next.quality) {
      this.emit('quality', next.quality)
    }

    this.emit('snapshot', this.snapshot)
  }
}
