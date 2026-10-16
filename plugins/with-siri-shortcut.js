const fs = require('fs');
const path = require('path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const FILE = 'AddToDaybookIntent.swift';

/**
 * "Add to Daybook" for Siri and the Shortcuts app. App Intents must be compiled into the app target
 * itself (iOS reads their metadata from the app), so this copies the Swift file into the generated
 * ios/<app> folder and adds it to the target's sources.
 */
module.exports = function withSiriShortcut(config) {
  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
      const target = path.join(config.modRequest.platformProjectRoot, projectName, FILE);
      fs.copyFileSync(path.join(__dirname, 'siri', FILE), target);
      return config;
    },
  ]);

  return withXcodeProject(config, (config) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(config.modRequest.projectRoot);
    const project = config.modResults;
    const filePath = `${projectName}/${FILE}`;
    if (!project.hasFile(filePath)) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath: filePath, groupName: projectName, project });
    }
    return config;
  });
};
