import prettierConfig from '@iobroker/eslint-config/prettier.config.mjs'

// Keep this project's established formatting (tabs and double quotes),
// overriding the @iobroker/eslint-config defaults (spaces and single quotes).
export default {
    ...prettierConfig,
    useTabs: true,
    singleQuote: false,
}
