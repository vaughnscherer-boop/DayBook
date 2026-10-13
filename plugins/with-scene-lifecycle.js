const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * iOS 27 stops apps at launch unless they adopt the UIScene life cycle. Expo ships a scene delegate
 * for this (`ExpoAppSceneDelegate`), but the SDK 57 prebuild template doesn't wire it up yet:
 *
 * - Info.plist declares a single window scene whose delegate is Expo's (registered in Objective-C
 *   as `EXExpoAppSceneDelegate`).
 * - AppDelegate conforms to `ExpoReactNativeFactoryProvider` so the scene delegate can reach the
 *   factory, and no longer makes its own window: the scene delegate creates the window from the
 *   connecting scene and starts React Native in it.
 *
 * Drop this plugin once `npx expo prebuild` generates the scene setup itself.
 */
module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: 'EXExpoAppSceneDelegate',
          },
        ],
      },
    };
    return config;
  });

  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('with-scene-lifecycle expects a Swift AppDelegate');
    }
    let contents = config.modResults.contents;

    contents = contents.replace(
      /class AppDelegate: ExpoAppDelegate \{/,
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {'
    );

    // The scene delegate starts React Native once the window scene connects.
    contents = contents.replace(
      /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/,
      '\n'
    );

    if (!contents.includes('ExpoReactNativeFactoryProvider') || contents.includes('UIScreen.main.bounds')) {
      throw new Error('with-scene-lifecycle could not patch AppDelegate.swift; the template has changed');
    }
    config.modResults.contents = contents;
    return config;
  });
};
