import path from 'node:path'
import { Menu, app, nativeImage, Tray } from 'electron'
import { MainWindow } from './windows/main'

export class SystemTray {
  private static current: Tray | null = null
  private static active = false

  static get isActive() {
    return SystemTray.active
  }

  static setIsActive(value: boolean) {
    SystemTray.active = value
  }

  static async create({
    onOpen,
  }: {
    onOpen: () => Promise<void>
  }): Promise<boolean> {
    if (SystemTray.current !== null) {
      return true
    }

    try {
      const icon = SystemTray.getTrayIcon()

      if (icon.isEmpty()) {
        return false
      }

      SystemTray.current = new Tray(icon)

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'Open Aerial Launcher',
          type: 'normal',
          click: () => {
            onOpen()
          },
        },
        {
          label: 'Exit',
          type: 'normal',
          click: () => {
            MainWindow.closeApp()
          },
        },
      ])

      SystemTray.current.setContextMenu(contextMenu)
      SystemTray.current.setToolTip(app.getName())

      SystemTray.current.addListener('click', () => {
        onOpen()
      })

      return true

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return false
    }
  }

  static destroy() {
    SystemTray.current?.removeAllListeners()
    SystemTray.current?.destroy()
    SystemTray.current = null
  }

  private static getTrayIcon() {
    const appPath = app.getAppPath()
    const selected = SystemTray.loadFirstAvailableIcon([
      path.join(appPath, 'icon-transparent.png'),
      path.join(appPath, 'icon.png'),
      path.join(process.resourcesPath, 'icon-transparent.png'),
      path.join(process.resourcesPath, 'icon.png'),
      path.join(process.resourcesPath, 'app.asar', 'icon-transparent.png'),
      path.join(process.resourcesPath, 'app.asar', 'icon.png'),
    ])

    if (selected.isEmpty()) {
      if (process.platform === 'darwin') {
        const dockIcon = app.dock.getIcon()

        if (!dockIcon.isEmpty()) {
          return dockIcon.resize({
            width: 18,
            height: 18,
          })
        }
      }

      return selected
    }

    if (process.platform === 'darwin') {
      return selected.resize({
        width: 18,
        height: 18,
      })
    }

    return selected
  }

  private static loadFirstAvailableIcon(paths: Array<string>) {
    for (const currentPath of paths) {
      const icon = nativeImage.createFromPath(currentPath)

      if (!icon.isEmpty()) {
        return icon
      }
    }

    return nativeImage.createEmpty()
  }
}
