const { withEntitlementsPlist } = require('expo/config-plugins');

/**
 * Daybook only schedules local reminders, but expo-notifications adds the push-notification
 * entitlement, which a free (Personal Team) Apple ID can't sign. Remove it so the app can be built
 * onto a phone without the paid Apple Developer Program. Drop this plugin once push is needed.
 *
 * List it *before* expo-notifications in app.json: entitlement mods run in reverse order, so this
 * one then runs after expo-notifications has added the key.
 */
module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
