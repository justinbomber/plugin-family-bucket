/**
 * @typedef {Object} PluginMeta
 * @property {string} id
 * @property {string} label
 * @property {string} [description]
 */

/**
 * @typedef {Object} PluginRecord
 * @property {boolean} enabled
 * @property {Record<string, unknown>} settings
 */

/**
 * @typedef {Object} PluginSuiteStateV1
 * @property {1} version
 * @property {Record<string, PluginRecord>} plugins
 */

export {};
