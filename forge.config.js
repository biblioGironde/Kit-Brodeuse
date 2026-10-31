module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'kit-brodeuse',
    icon: './public/icons/icon'
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'KitBrodeuse',
        setupIcon: './public/icons/icon.ico'
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
      config: {
        macUpdateManifestBaseUrl: "https://biblioGironde.github.io/Kit-Brodeuse/update/darwin/arm64"
      }
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        icon: './public/icons/icon.icns'
      }
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'kit-brodeuse',
          productName: 'Kit Brodeuse',
          bin: 'kit-brodeuse',
          icon: './public/icons/256x256.png'
        }
      },
    },
    {
      name: "@reforged/maker-appimage",
      config: {
        options: {
          categories: ["Robotics"],
          icon: "./public/icon.svg"
        }
      }
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'electron/main.ts',
            config: 'vite.config.electron.mts',
            target: 'main',
          },
          {
            entry: 'electron/preload.ts',
            config: 'vite.config.electron.mts',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.config.mts',
          },
        ],
      },
    },
  ],
};
