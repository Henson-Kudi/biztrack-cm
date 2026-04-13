import { BrowserWindow, ipcMain } from 'electron'
import { NetworkService } from '../services/network.service'

export function registerNetworkIpc(network: NetworkService) {
  ipcMain.handle('network:isOnline', () => network.isOnline)

  network.on('change', (online: boolean) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('network:change', online)
    })
  })
}
