import type {
  AppLanguageSettings,
  CustomizableMenuSettings,
  LanguageResponse,
  Settings,
} from '../../types/settings'

import { writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

// import { defaultMissionInterval } from '../../config/constants/automation'
import { ElectronAPIEventKeys } from '../../config/constants/main-process'
// import { defaultClaimingRewardsDelay } from '../../config/constants/mcp'
import {
  availableLanguages,
  defaultAppLanguage,
} from '../../config/constants/settings'
// import { defaultFortniteGameProcess } from '../../config/fortnite/app'
import { launcherAppClient2 } from '../../config/fortnite/clients'

import { CustomProcess } from '../core/custom-process'
import { MainWindow } from './windows/main'
import { DataDirectory } from './data-directory'
import { SystemTray } from './system-tray'

import { launcherAvailablePlatforms } from '../../services/config/launcher'
import { getLauncherAssetForCatalogItem } from '../../services/endpoints/launcher'
import { getLightswitchStatus } from '../../services/endpoints/lightswitch'
import {
  createAccessTokenUsingClientCredentials,
  killSession,
} from '../../services/endpoints/oauth'

import { Language } from '../../locales/resources'

export type GameContext = {
  namespaceId: 'fn'
}

export type DetectGameResult = {
  appVersion: string | null
  name: string
  path: string
}

const defaultGameData: DetectGameResult & {
  base: string
  extra: string
} = process.platform === 'win32'
  ? {
      appVersion: '++Fortnite+Release-38.00-CL-47722112-Windows',
      name: 'Fortnite',
      path: 'C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64',
      base: 'C:\\Program Files\\Epic Games\\Fortnite',
      extra: 'FortniteGame\\Binaries\\Win64',
    }
  : {
      appVersion: null,
      name: 'Fortnite',
      path: '/Applications/Fortnite.app',
      base: '/Applications/Fortnite.app',
      extra: '',
    }
const isWindowsPlatform = process.platform === 'win32'
const launcherPlatform = isWindowsPlatform
  ? launcherAvailablePlatforms.Windows
  : launcherAvailablePlatforms.Mac

const defaultLauncherAssetVersion = {
  win32: '++Fortnite+Release-38.00-CL-47722112-Windows',
  darwin: '++Fortnite+Release-38.00-CL-47722112-Mac',
}
// const fnGameData = detectGameData({ namespaceId: 'fn' })
// const defaultSettingsData: Settings = {
//   claimingRewards: `${defaultClaimingRewardsDelay}`,
//   customProcess: defaultFortniteGameProcess,
//   missionInterval: `${defaultMissionInterval}`,
//   path: fnGameData.path,
//   systemTray: false,
//   userAgent: `${fnGameData.name}/${fnGameData.appVersion ?? defaultGamePath.fn.appVersion}`,
// }

export class SettingsManager {
  static async load() {
    const settings = await SettingsManager.getData()

    MainWindow.instance.webContents.send(
      ElectronAPIEventKeys.OnLoadSettings,
      settings,
    )

    CustomProcess.setName(settings.customProcess)
    CustomProcess.init()

    await SettingsManager.update(settings)
  }

  static async getData() {
    const defaultSettingsData = DataDirectory.getSettingsDefaultData()
    const result = await DataDirectory.getSettingsFile()
    const settings: Required<Settings> = {
      claimingRewards:
        result.settings.claimingRewards ??
        defaultSettingsData.claimingRewards,
      customProcess:
        result.settings.customProcess ?? defaultSettingsData.customProcess,
      missionInterval:
        result.settings.missionInterval ??
        defaultSettingsData.missionInterval,
      path: result.settings.path ?? defaultSettingsData.path,
      systemTray:
        result.settings.systemTray ?? defaultSettingsData.systemTray,
      userAgent:
        result.settings.userAgent ?? defaultSettingsData.userAgent,
    }

    return settings
  }

  static async update(settings: Settings) {
    const nextSettings = {
      ...settings,
    }

    if (
      nextSettings.systemTray !== undefined &&
      SystemTray.isActive !== nextSettings.systemTray
    ) {
      if (nextSettings.systemTray) {
        const isCreated = await SystemTray.create({
          onOpen: async () => {
            if (MainWindow.instance.isMinimized()) {
              MainWindow.instance.restore()
            }

            if (!MainWindow.instance.isVisible()) {
              MainWindow.instance.show()
            }

            MainWindow.instance.focus()
          },
        })

        SystemTray.setIsActive(isCreated)

        if (!isCreated) {
          nextSettings.systemTray = false
        }
      } else {
        SystemTray.destroy()
        SystemTray.setIsActive(false)
      }
    }

    if (nextSettings.customProcess !== undefined) {
      CustomProcess.setName(nextSettings.customProcess)
    }

    await DataDirectory.updateSettingsFile(nextSettings)

    MainWindow.instance.webContents.send(
      ElectronAPIEventKeys.OnLoadSettings,
      nextSettings,
    )
  }

  static async detectGamePath(config: GameContext) {
    const data = detectGameData(config)
    let appVersion =
      data.appVersion ??
      (isWindowsPlatform
        ? defaultLauncherAssetVersion.win32
        : defaultLauncherAssetVersion.darwin)
    let name = data.name

    if (isWindowsPlatform && data.appVersion === null) {
      let token: string | null = null

      try {
        const result = await createAccessTokenUsingClientCredentials({
          authorization: launcherAppClient2.auth,
        })

        token = result.data.access_token

        const status = await getLightswitchStatus('Fortnite', {
          headers: {
            Authorization: `bearer ${result.data.access_token}`,
          },
        })
        const asset = await getLauncherAssetForCatalogItem(
          {
            appName: status.data.launcherInfoDTO?.appName ?? 'Fortnite',
            catalogItemId:
              status.data.launcherInfoDTO?.catalogItemId ??
              '4fe75bbc5a674f4f9b356b5c90567da5',
            platform: launcherPlatform,
            label: 'Live',
          },
          {
            headers: {
              Authorization: `bearer ${result.data.access_token}`,
            },
          },
        )

        appVersion = asset.data.buildVersion
        name = asset.data.appName
      } catch (error) {
        //
      }

      if (token !== null) {
        killSession(token, {
          headers: {
            Authorization: `bearer ${token}`,
          },
        }).catch(() => {})
      }
    }

    return {
      ...data,
      appVersion,
      name,
    }
  }
}

export class DevSettingsManager {
  static async load() {
    const data = await DataDirectory.getDevSettingsFile()

    MainWindow.instance.webContents.send(
      ElectronAPIEventKeys.DevSettingsResponse,
      data.devSettings,
    )
  }
}

export class CustomizableMenuSettingsManager {
  static async load() {
    const customizableMenuSettings =
      await CustomizableMenuSettingsManager.getData()

    MainWindow.instance.webContents.send(
      ElectronAPIEventKeys.CustomizableMenuSettingsResponse,
      customizableMenuSettings,
    )
  }

  static async getData() {
    const { customizableMenu } =
      await DataDirectory.getCustomizableMenuSettingsFile()

    return customizableMenu
  }

  static async update(
    key: keyof CustomizableMenuSettings,
    visibility: boolean,
  ) {
    const customizableMenuSettings =
      await CustomizableMenuSettingsManager.getData()
    const newData: CustomizableMenuSettings = {
      ...customizableMenuSettings,
      [key]: visibility,
    }

    await DataDirectory.updateCustomizableMenuSettingsFile(newData)

    MainWindow.instance.webContents.send(
      ElectronAPIEventKeys.CustomizableMenuSettingsResponse,
      newData,
    )
  }
}

export class AppLanguage {
  static async load() {
    const availableLocales = availableLanguages.reduce(
      (accumulator, language) => {
        accumulator[language.id] = language.id

        return accumulator
      },
      {} as Record<string, Language>,
    )
    const currentLocale = app.getLocale()
    const locale = currentLocale.toLowerCase().startsWith('es')
      ? Language.Spanish
      : currentLocale

    const data = await DataDirectory.getAppLanguageFile()
    const response: LanguageResponse = {
      generatedFile: true,
      language:
        data?.i18n ?? availableLocales[locale] ?? defaultAppLanguage,
    }

    if (data === null) {
      response.generatedFile = false
    }

    MainWindow.instance.webContents.send(
      ElectronAPIEventKeys.AppLanguageNotification,
      response,
    )
  }

  static async update(language: Language) {
    try {
      const data: AppLanguageSettings = {
        i18n: language,
      }

      await writeFile(
        DataDirectory.getAppLanguageDirectoryPath(),
        JSON.stringify(data, null, 2),
        {
          encoding: 'utf8',
        },
      )

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      //
    }
  }
}

function detectGameData({ namespaceId }: GameContext): DetectGameResult {
  if (!isWindowsPlatform) {
    return {
      appVersion: defaultGameData.appVersion,
      name: defaultGameData.name,
      path: defaultGameData.path,
    }
  }

  try {
    const file = JSON.parse(
      readFileSync(
        path.join(
          process.env.PROGRAMDATA ?? '',
          'Epic',
          'UnrealEngineLauncher',
          'LauncherInstalled.dat',
        ),
        {
          encoding: 'utf8',
        },
      ),
    )
    const installationList = file?.InstallationList ?? []
    const game = installationList?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (item: any) => item.NamespaceId === namespaceId,
    )

    const basePath =
      game?.InstallLocation ?? 'C:\\Program Files\\Epic Games'
    const extraPath = defaultGameData.extra
    const currentPath = path.join(basePath, extraPath)

    return {
      appVersion: game?.AppVersion ?? null,
      name: defaultGameData.name,
      path: currentPath,
    }
  } catch (error) {
    //
  }

  return {
    appVersion: null,
    name: defaultGameData.name,
    path: defaultGameData.path,
  }
}
