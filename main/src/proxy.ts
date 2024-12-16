import type { Server } from 'http'
import { app, net, session } from 'electron'
import type { Logger } from './RemoteLogger'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import path from 'path'

const PROXY_HOSTS = [
  { host: 'www.pathofexile2.com', official: true },
  { host: 'ru.pathofexile2.com', official: true },
  { host: 'pathofexile2.tw', official: true },
  { host: 'poe2.game.daum.net', official: true },
  { host: 'poe.ninja', official: false },
  { host: 'www.poeprices.info', official: false },
]

export class HttpProxy {
  private _session: Electron.Session;
  constructor(
    server: Server,
    logger: Logger,
  ) {
    
    this._session = session.fromPartition('persist:proxy', {
      cache: true
    });

    this.LoadExtensions()

    server.addListener('request', (req, res) => {
      if (!req.url?.startsWith('/proxy/')) return
      const host = req.url.split('/', 3)[2]

      const official = PROXY_HOSTS.find(entry => entry.host === host)?.official
      if (official === undefined) return req.destroy()

      for (const key in req.headers) {
        if (key.startsWith('sec-') || key === 'host' || key === 'origin' || key === 'content-length') {
          delete req.headers[key]
        }
      }
      console.log(`request ${req.url} (${host})`)
      const proxyReq = net.request({
        url: 'https://' + req.url.slice('/proxy/'.length),
        method: req.method,
        headers: {
          ...req.headers,
          'user-agent': app.userAgentFallback
        },
        useSessionCookies: true,
        session: this._session,
      })
      proxyReq.addListener('response', (proxyRes) => {
        const resHeaders = { ...proxyRes.headers }
        // `net.request` returns an already decoded body
        delete resHeaders['content-encoding']
        res.writeHead(proxyRes.statusCode, proxyRes.statusMessage, resHeaders)
          ; (proxyRes as unknown as NodeJS.ReadableStream).pipe(res)
      })
      proxyReq.addListener('error', (err) => {
        logger.write(`error [cors-proxy] ${err.message} (${host})`)
        res.destroy(err)
      })
      req.pipe(proxyReq as unknown as NodeJS.WritableStream)
      setTimeout(() => {
        console.log('Request timed out');
        proxyReq.abort();
      }, 5000);
    })
  }

  private LoadExtensions() {
    const chromeExtensions = new ElectronChromeExtensions({
      session: this._session,
      license: 'GPL-3.0',
      modulePath: path.join(app.getAppPath(), 'chrome-extensions')
    });
  }
}
