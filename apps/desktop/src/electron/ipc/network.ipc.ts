import { BrowserWindow, ipcMain } from 'electron'
import { NetworkService } from '../services/network.service'

export function registerNetworkIpc(network: NetworkService) {
  ipcMain.handle('network:isOnline', () => network.isOnline)
  ipcMain.handle('network:getSnapshot', () => network.snapshot)

  network.on('change', (online: boolean) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('network:change', online)
    })
  })

  network.on('snapshot', (snapshot) => {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('network:snapshot', snapshot)
    })
  })
}
