import { createEslintConfig } from '@iobroker/eslint-config';

export default createEslintConfig({
    // Basis-Konfiguration für deinen ioBroker Adapter
    
    // Angepasste Regeln für eine sanftere Migration
    rules: {
        // Während der Migration: Warnings statt Errors
        '@typescript-eslint/no-unused-vars': 'warn',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        'prefer-const': 'warn',
        'no-var': 'warn',
        
        // Heizungssteuerung-spezifische Anpassungen
        'no-console': 'off', // Adapter-Logging ist erlaubt
        'max-len': ['warn', { code: 120 }], // Etwas längere Zeilen erlauben
    },
    
    // Diese Dateien/Ordner ignorieren
    ignores: [
        'node_modules/**',
        'build/**',
        'admin/build/**',
        'dist/**',
        '*.js.map',
        'coverage/**',
        '.vscode/**',
        '.git/**'
    ]
});
