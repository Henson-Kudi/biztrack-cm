import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { readFile, stat } from 'fs/promises'
import { extname, resolve, sep } from 'path'

type RendererServer = {
  close: () => Promise<void>
  url: string
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function getContentType(filePath: string) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function ensureWithinRoot(rootPath: string, relativePath: string) {
  const absolutePath = resolve(rootPath, relativePath)
  const normalizedRoot = resolve(rootPath)

  if (absolutePath !== normalizedRoot && !absolutePath.startsWith(`${normalizedRoot}${sep}`)) {
    return null
  }

  return absolutePath
}

function getRouteCandidates(pathname: string, defaultLocale: string) {
  const normalizedPath = pathname.replace(/\/{2,}/g, '/')

  if (normalizedPath === '/' || normalizedPath.length === 0) {
    return [`${defaultLocale}.html`]
  }

  const nextAssetIndex = normalizedPath.indexOf('/_next/')
  if (nextAssetIndex >= 0) {
    return [normalizedPath.slice(nextAssetIndex + 1)]
  }

  const trimmedPath = normalizedPath.replace(/^\/+/, '')
  if (trimmedPath.length === 0) {
    return [`${defaultLocale}.html`]
  }

  const lastSegment = trimmedPath.split('/').pop() ?? ''
  if (lastSegment.includes('.')) {
    return [trimmedPath]
  }

  return [`${trimmedPath}.html`, `${trimmedPath}/index.html`]
}

async function resolveRequestPath(rootPath: string, pathname: string, defaultLocale: string) {
  const candidates = getRouteCandidates(pathname, defaultLocale)

  for (const candidate of candidates) {
    const absolutePath = ensureWithinRoot(rootPath, candidate)
    if (!absolutePath) {
      continue
    }

    try {
      const fileStats = await stat(absolutePath)
      if (fileStats.isFile()) {
        return absolutePath
      }
    } catch {
      continue
    }
  }

  return null
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  rootPath: string,
  defaultLocale: string,
) {
  const method = request.method ?? 'GET'
  if (method !== 'GET' && method !== 'HEAD') {
    response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Method Not Allowed')
    return
  }

  const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
  const pathname = decodeURIComponent(requestUrl.pathname)
  const filePath = await resolveRequestPath(rootPath, pathname, defaultLocale)

  if (!filePath) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not Found')
    return
  }

  try {
    const body = await readFile(filePath)
    response.writeHead(200, {
      'Cache-Control': pathname.includes('/_next/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Content-Type': getContentType(filePath),
    })

    if (method === 'HEAD') {
      response.end()
      return
    }

    response.end(body)
  } catch (error) {
    console.error('[RendererServer] Failed to serve renderer asset', { error, filePath, pathname })
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Internal Server Error')
  }
}

export async function startRendererServer(
  rootPath: string,
  defaultLocale = 'en',
): Promise<RendererServer> {
  return await new Promise((resolveServer, rejectServer) => {
    const server = createServer((request, response) => {
      void handleRequest(request, response, rootPath, defaultLocale)
    })

    const onError = (error: Error) => {
      server.off('error', onError)
      rejectServer(error)
    }

    server.on('error', onError)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError)
      const address = server.address()

      if (!address || typeof address === 'string') {
        rejectServer(new Error('Renderer server failed to bind to a local port.'))
        return
      }

      resolveServer({
        url: `http://127.0.0.1:${address.port}/${defaultLocale}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.close((error) => {
              if (error) {
                rejectClose(error)
                return
              }
              resolveClose()
            })
          }),
      })
    })
  })
}
