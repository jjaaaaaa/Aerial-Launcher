import childProcess from 'node:child_process'
import path from 'node:path'

import { ElectronAPIEventKeys } from '../../config/constants/main-process'

import { MainWindow } from '../startup/windows/main'

export class CustomProcess {
  private static id: number | null = null
  private static name: string | null = null
  private static isRunning = false
  private static pollInterval: NodeJS.Timeout | null = null

  static init() {
    if (!CustomProcess.name) {
      return
    }

    if (CustomProcess.pollInterval) {
      clearInterval(CustomProcess.pollInterval)
      CustomProcess.pollInterval = null
    }

    CustomProcess.pollOnce()

    CustomProcess.pollInterval = setInterval(() => {
      CustomProcess.pollOnce()
    }, 2_000)
  }

  static kill() {
    if (typeof CustomProcess.id !== 'number') {
      return
    }

    if (process.platform === 'win32') {
      childProcess.exec(`taskkill /PID ${CustomProcess.id} /T /F`, () => {})

      return
    }

    try {
      process.kill(CustomProcess.id, 'SIGTERM')
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      //
    }
  }

  static setName(value: string, restart?: boolean) {
    if (value === CustomProcess.name) {
      return
    }

    CustomProcess.name = value

    if (restart) {
      CustomProcess.destroy()
      CustomProcess.init()
    }
  }

  static destroy() {
    if (CustomProcess.pollInterval) {
      clearInterval(CustomProcess.pollInterval)
      CustomProcess.pollInterval = null
    }

    CustomProcess.id = null
    CustomProcess.name = null
    CustomProcess.isRunning = false
  }

  private static pollOnce() {
    const name = CustomProcess.name

    if (!name) {
      return
    }

    const command =
      process.platform === 'win32'
        ? 'tasklist /FO CSV /NH'
        : 'ps -axo pid=,comm='

    childProcess.exec(command, (error, stdout) => {
      if (error) {
        CustomProcess.pushStatus(false, null)

        return
      }

      const processId =
        process.platform === 'win32'
          ? CustomProcess.findOnWindows(stdout, name)
          : CustomProcess.findOnUnix(stdout, name)

      CustomProcess.pushStatus(
        typeof processId === 'number',
        processId ?? null,
      )
    })
  }

  private static findOnWindows(stdout: string, processName: string) {
    const rows = stdout.split('\n')

    for (const row of rows) {
      const match = row.match(/^"([^"]+)","([^"]+)"/)

      if (!match) {
        continue
      }

      if (match[1].toLowerCase() !== processName.toLowerCase()) {
        continue
      }

      const pid = Number.parseInt(match[2], 10)

      if (!Number.isNaN(pid)) {
        return pid
      }
    }

    return null
  }

  private static findOnUnix(stdout: string, processName: string) {
    const rows = stdout.split('\n')

    for (const row of rows) {
      const current = row.trim()

      if (!current) {
        continue
      }

      const parts = current.split(/\s+/, 2)
      const pid = Number.parseInt(parts[0], 10)
      const commandPath = parts[1] ?? ''
      const commandName = path.basename(commandPath)

      if (
        commandName.toLowerCase() !== processName.toLowerCase() &&
        !commandPath.toLowerCase().includes(processName.toLowerCase())
      ) {
        continue
      }

      if (!Number.isNaN(pid)) {
        return pid
      }
    }

    return null
  }

  private static pushStatus(
    isRunning: boolean,
    processId: number | null,
  ) {
    CustomProcess.isRunning = isRunning
    CustomProcess.id = processId

    const mainWindow = MainWindow.instance

    if (
      mainWindow.isDestroyed() ||
      mainWindow.webContents.isDestroyed()
    ) {
      return
    }

    mainWindow.webContents.send(
      ElectronAPIEventKeys.CustomProcessStatus,
      CustomProcess.isRunning,
    )
  }
}
